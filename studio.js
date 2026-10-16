import * as THREE from 'three';
import {RectAreaLightUniformsLib} from './vendor/ltc.js';
import {BASE} from './kinematics.js';

// ---------------------------------------------------------------------------
// One physical lighting set-up for the whole room.
//
//   • A tall window in the (off-screen) left wall, x = WINDOW.x. It is both
//     - a large rectangular area light (soft daylight: makes the left of the
//       room brighter and warmer, falls off toward the right), and
//     - the aperture through which direct sun enters.
//   • The sun comes from the front-left, above. Its visibility at any point is
//     computed by tracing toward the sun to the window plane: frame, mullions
//     and transoms block it, edges are softened by the angular size of the
//     source × distance travelled (penumbra). Two wide horizontal transoms
//     therefore land on the back wall as two broad, soft diagonal shafts.
//   • The same visibility function multiplies the sun for EVERY lit material
//     (walls, floor, metal arm, charms), so highlights, sun patches, cast
//     shadows and reflections all agree.
//   • A cool sky/bounce environment (PMREM of a simple room with the same
//     window) supplies indirect light and the reflections in the metal.
// ---------------------------------------------------------------------------

export const SUN_DIR = new THREE.Vector3(-0.58, 0.62, 0.53).normalize();   // toward the sun
// Tall window with a grid of glazing bars in the left wall. Its upper edge
// is what puts the top-right corner of the wall in shade.
// Only horizontal bars: they project onto the back wall as one family of
// broad parallel diagonal shafts (vertical bars would add a criss-cross).
export const WINDOW = {x: -4.8, y0: 1.2, y1: 9.3, z0: -8.0, z1: 14.0,
  mullions: [], mullionW: 0.3, transoms: [4.3, 7.4], transomW: 0.95};
// A large glazed opening at the front-left of the room (behind the viewer).
// No direct sun through it, only diffuse sky: it washes the left of the room.
export const FRONT = {x: -6.0, y: 2.2, z: 1.6, w: 3.4, h: 4.4};
export const ROOM = {wallZ: -1.4, cove: 0.6, floorY: 0};

const SUN_GLSL = /* glsl */`
uniform vec3 uSunDir;
float sBox(float x, float lo, float hi, float b) {          // softly diffused aperture edges
  return smoothstep(lo - b*.5, lo + b*.5, x) * (1. - smoothstep(hi - b*.5, hi + b*.5, x));
}
float studioSun(vec3 p) {
  if (uSunDir.x > -1e-3) return 1.;
  float t = (${WINDOW.x.toFixed(3)} - p.x) / uSunDir.x;
  if (t <= 0.) return 1.;
  vec3 q = p + uSunDir * t;
  float b = .22 + t * .18;                                     // penumbra grows with distance (large, soft source)
  float open = sBox(q.y, ${WINDOW.y0.toFixed(3)}, ${WINDOW.y1.toFixed(3)}, b) * sBox(q.z, ${WINDOW.z0.toFixed(3)}, ${WINDOW.z1.toFixed(3)}, b);
  ${WINDOW.mullions.map(z => `open *= 1. - sBox(q.z, ${(z - WINDOW.mullionW/2).toFixed(3)}, ${(z + WINDOW.mullionW/2).toFixed(3)}, b);`).join('\n  ')}
  ${WINDOW.transoms.map(y => `open *= 1. - sBox(q.y, ${(y - WINDOW.transomW/2).toFixed(3)}, ${(y + WINDOW.transomW/2).toFixed(3)}, b);`).join('\n  ')}
  return open;
}`;

export function createStudio(renderer, scene) {
  RectAreaLightUniformsLib.init();
  const shared = {uSunDir: {value: SUN_DIR.clone()}};

  // Inject the sun visibility into any MeshStandard/Physical material.
  let envTexture = null;
  function sunlit(material, extra = null) {
    // Assign the environment per material: with only scene.environment set,
    // three.js replaces every material's envMapIntensity by
    // scene.environmentIntensity, which silently flattened the room.
    if (envTexture && !material.envMap && material.isMeshStandardMaterial) material.envMap = envTexture;
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, r) => {
      Object.assign(shader.uniforms, shared);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vStudioWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvStudioWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vStudioWorld;\n' + SUN_GLSL)
        .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
          'getDirectionalLightInfo( directionalLight, directLight );',
          'getDirectionalLightInfo( directionalLight, directLight );\n\t\tif ( UNROLLED_LOOP_INDEX == 0 ) directLight.color *= studioSun( vStudioWorld );'));
      if (extra) extra(shader, r);
      if (prev) prev(shader, r);
    };
    material.customProgramCacheKey = () => 'studio-sun-' + (extra ? 'x' : '') + material.type;
    return material;
  }

  // ---- lights ----
  const sun = new THREE.DirectionalLight(0xfff7ea, 4.6);
  sun.position.copy(SUN_DIR).multiplyScalar(12).add(new THREE.Vector3(0, 1.2, 0));
  sun.target.position.set(0, 1.2, 0);
  sun.castShadow = true;
  sun.shadow.intensity = .42;          // shadows cast by the arm/charms only; window shafts unaffected
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left: -9, right: 9, top: 9, bottom: -6, near: 0.5, far: 40});
  sun.shadow.radius = 14; sun.shadow.blurSamples = 20;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.01;
  scene.add(sun, sun.target);

  // Skylight: the bright ceiling / open sky above gives a broad, very soft
  // shadow straight under the arm and card (ambient occlusion on the floor).
  const sky = new THREE.DirectionalLight(0xf2f6fb, 1.65);
  // from above and a little to the right: its soft shadow falls left of the base
  sky.position.set(3.4, 10, 0.7); sky.target.position.set(0.6, 0, 0);
  sky.castShadow = true; sky.shadow.mapSize.set(1024, 1024); sky.shadow.intensity = .45;
  Object.assign(sky.shadow.camera, {left: -9, right: 9, top: 6, bottom: -4, near: 0.5, far: 30});
  sky.shadow.radius = 18; sky.shadow.blurSamples = 20; sky.shadow.bias = -0.0005;
  scene.add(sky, sky.target);

  const win = new THREE.RectAreaLight(0xf5f7fa, 1.35, WINDOW.z1 - WINDOW.z0, WINDOW.y1 - WINDOW.y0);
  win.position.set(WINDOW.x, (WINDOW.y0 + WINDOW.y1) / 2, (WINDOW.z0 + WINDOW.z1) / 2);
  win.lookAt(WINDOW.x + 1, win.position.y, win.position.z);
  scene.add(win);
  const front = new THREE.RectAreaLight(0xfffaf3, 8.5, FRONT.w, FRONT.h);
  front.position.set(FRONT.x, FRONT.y, FRONT.z);
  front.lookAt(-3.6, 1.4, ROOM.wallZ);
  scene.add(front);

  // ---- environment (indirect light + metal reflections) ----
  const env = new THREE.Scene();
  const W = 8.5, Hh = 7.5;
  const face = (color, size, pos, rotY = 0, rotX = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide}));
    m.position.set(...pos); m.rotation.set(rotX, rotY, 0); env.add(m); return m;
  };
  const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
  face(lin(.58, .59, .60), [2*W, Hh], [0, Hh/2, ROOM.wallZ]);                   // back wall
  face(lin(.20, .23, .28), [2*W, Hh], [W, Hh/2, 0], Math.PI/2);                // right: cool, far from window
  face(lin(.30, .31, .33), [2*W, Hh], [0, Hh/2, 10], 0);                       // behind camera (darker: gives the metal form)
  face(lin(.62, .64, .67), [2*W, 2*W], [0, Hh, 0], 0, Math.PI/2);              // ceiling
  face(lin(.50, .51, .52), [2*W, 2*W], [0, 0, 0], 0, Math.PI/2);               // floor
  face(lin(.45, .46, .47), [2*W, Hh], [WINDOW.x - .01, Hh/2, 0], Math.PI/2);   // left wall
  face(lin(7.0, 7.1, 7.3), [WINDOW.z1 - WINDOW.z0, WINDOW.y1 - WINDOW.y0],      // the window
    [WINDOW.x + .02, (WINDOW.y0 + WINDOW.y1)/2, (WINDOW.z0 + WINDOW.z1)/2], Math.PI/2);
  face(lin(4.2, 4.3, 4.45), [FRONT.w, FRONT.h], [FRONT.x, FRONT.y, 9.9]);  // front opening
  for (const z of WINDOW.mullions) face(lin(.5, .5, .5), [WINDOW.mullionW * 1.4, WINDOW.y1 - WINDOW.y0], [WINDOW.x + .04, (WINDOW.y0 + WINDOW.y1)/2, z], Math.PI/2);
  for (const y of WINDOW.transoms) face(lin(.5, .5, .5), [WINDOW.z1 - WINDOW.z0, WINDOW.transomW * 1.4], [WINDOW.x + .04, y, (WINDOW.z0 + WINDOW.z1)/2], Math.PI/2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(env, 0.02, 0.1, 40, {position: new THREE.Vector3(0.6, 1.6, 0.4)});
  scene.environment = envRT.texture;
  envTexture = envRT.texture;
  pmrem.dispose();

  // ---- the room: floor → cove → wall, one surface, continuous normals ----
  const profile = [];                       // [y, z]
  const zc = ROOM.wallZ + ROOM.cove;        // where the floor starts to curve
  for (let z = 14; z > zc; z -= 0.5) profile.push([0, z]);
  for (let i = 0; i <= 64; i++) {
    const a = i / 64 * Math.PI / 2;
    profile.push([ROOM.cove * (1 - Math.cos(a)), zc - ROOM.cove * Math.sin(a)]);
  }
  for (let y = ROOM.cove + 0.5; y <= 16; y += 0.5) profile.push([y, ROOM.wallZ]);
  const pos = [], nrm = [], idx = [];
  const X0 = -26, X1 = 26, NX = 52;
  profile.forEach(([y, z], i) => {
    const prev = profile[Math.max(0, i - 1)], next = profile[Math.min(profile.length - 1, i + 1)];
    const dy = next[0] - prev[0], dz = next[1] - prev[1], n = Math.hypot(dy, dz);
    for (let k = 0; k <= NX; k++) { pos.push(X0 + (X1 - X0) * k / NX, y, z); nrm.push(0, -dz / n, dy / n); }
  });
  for (let i = 0; i < profile.length - 1; i++) for (let k = 0; k < NX; k++) {
    const a = i * (NX + 1) + k, b = a + NX + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const roomGeo = new THREE.BufferGeometry();
  roomGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roomGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  roomGeo.setIndex(idx);

  // Satin reflection of the sculpture on the floor (blurred planar mirror).
  const reflRT = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType});
  const blurRT = [0, 1].map(() => new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, depthBuffer: false}));
  const reflUniforms = {uRefl: {value: blurRT[1].texture}, uReflSize: {value: new THREE.Vector2(1, 1)},
    uBase: {value: new THREE.Vector2(BASE[0], BASE[2])}};

  const roomMaterial = sunlit(new THREE.MeshStandardMaterial({color: new THREE.Color().setRGB(.84, .862, .89, THREE.LinearSRGBColorSpace), roughness: .95, envMapIntensity: 1.25}),
    shader => {
      Object.assign(shader.uniforms, reflUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vFloor;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvFloor = smoothstep(.55, .98, normal.y);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFloor;\nuniform sampler2D uRefl;\nuniform vec2 uReflSize;\nuniform vec2 uBase;')
        // satin floor, matte wall; the floor is a touch cooler & brighter
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(.95, .5, vFloor);')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(1.), vec3(.955, .958, .965), vFloor);')
        // ambient occlusion where the pedestal meets the floor
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
          { float r = length(vStudioWorld.xz - uBase);
            float ao = 1. - .55 * exp(-max(r - .2, 0.) / .07) - .16 * exp(-pow(max(r - .15, 0.) / .55, 2.));
            ao = mix(1., ao, vFloor);
            // concave corner where wall meets floor: a soft occlusion band
            // the foot of the wall sits in the corner's occlusion; the floor
            // just in front of it only slightly, so the junction reads as a
            // soft horizon: darker wall foot, brighter floor plane
            float corner = (.55 * exp(-vStudioWorld.y / .65) + .45 * exp(-vStudioWorld.y / 1.3)) * (1. - vFloor)
                         + .12 * exp(-max(vStudioWorld.z - (${(ROOM.wallZ + ROOM.cove).toFixed(3)}), 0.) / .25) * vFloor;
            ao *= 1. - .085 * corner;
            reflectedLight.indirectDiffuse *= ao; reflectedLight.directDiffuse *= mix(1., ao, .85); }`)
        .replace('#include <opaque_fragment>', `
          { vec2 suv = gl_FragCoord.xy / uReflSize;
            vec4 refl = texture2D(uRefl, suv);
            // higher parts of the sculpture reflect at floor points nearer the camera,
            // where a satin floor's reflection is blurrier and weaker: fade with z
            float w = vFloor * .16 * exp(-max(vStudioWorld.z - .15, 0.) / 1.1);
            outgoingLight = mix(outgoingLight, refl.rgb / max(refl.a, 1e-3), refl.a * w); }
          #include <opaque_fragment>`);
    });
  const room = new THREE.Mesh(roomGeo, roomMaterial);
  room.receiveShadow = true;
  scene.add(room);

  // ---- reflection pass ----
  const blurScene = new THREE.Scene(), blurCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blurMat = new THREE.ShaderMaterial({
    uniforms: {map: {value: null}, dir: {value: new THREE.Vector2()}},
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `varying vec2 vUv; uniform sampler2D map; uniform vec2 dir;
      void main(){ vec4 c = vec4(0.); float ws = 0.;
        for (int i = -6; i <= 6; i++) { float w = exp(-float(i*i) / 18.); c += texture2D(map, vUv + dir * float(i)) * w; ws += w; }
        gl_FragColor = c / ws; }`,
    depthTest: false, depthWrite: false});
  blurScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat));
  const mirror = new THREE.Group(); mirror.scale.y = -1;
  const tmpColor = new THREE.Color();

  return {
    sunlit, room, sun, win, shared,
    resize(w, h, dpr) {
      const rw = Math.max(1, Math.round(w * dpr / 3)), rh = Math.max(1, Math.round(h * dpr / 3));
      reflRT.setSize(rw, rh); blurRT.forEach(t => t.setSize(rw, rh));
      reflUniforms.uReflSize.value.set(w * dpr, h * dpr);
    },
    // Render `objects` mirrored in the floor plane with the main camera, blur.
    reflect(camera, objects) {
      const parents = objects.map(o => o.parent);
      objects.forEach(o => mirror.add(o));
      scene.add(mirror); room.visible = false;
      const old = renderer.getRenderTarget(), oldAlpha = renderer.getClearAlpha(); renderer.getClearColor(tmpColor);
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(reflRT); renderer.clear(); renderer.render(scene, camera);
      blurMat.uniforms.map.value = reflRT.texture; blurMat.uniforms.dir.value.set(1.6 / reflRT.width, 0);
      renderer.setRenderTarget(blurRT[0]); renderer.render(blurScene, blurCam);
      blurMat.uniforms.map.value = blurRT[0].texture; blurMat.uniforms.dir.value.set(0, 2.2 / reflRT.height);
      renderer.setRenderTarget(blurRT[1]); renderer.render(blurScene, blurCam);
      renderer.setRenderTarget(old); renderer.setClearColor(tmpColor, oldAlpha);
      objects.forEach((o, i) => parents[i].add(o));
      scene.remove(mirror); room.visible = true;
    },
  };
}
