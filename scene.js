import * as THREE from 'three';
import {createStudio} from './studio.js';
import {buildRobot, prefetchArm} from './robot.js';
import {buildCharms, buildChainLinks} from './charms.js';
import {ChainPendant, separate, springStep, clamp} from './physics.js';
import {solveIK, goalFrame, REST_GUESS, CARD, GRASP, GRASP_A, HOME} from './kinematics.js';

const host = document.querySelector('#scene');
const hero = document.querySelector('.hero');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer:coarse)').matches;
let paused = reduced.matches;

const CHARM_SCALE = CARD.w / 1.07;        // charms were designed for a 1.07-wide card
const CHARMS = [                          // anchor x on the bottom rail, chain length
  {x: -0.2, chain: 0.13},                 // NYU
  {x: 0.17, chain: 0.21},                 // BLÅHAJ, a little lower, nose toward the coin's side
];

// Behaviour timing
const BREATH = 5.5;                       // seconds per idle breath (sway + light)
const GREET = 1.5;                        // seconds for the click greeting
const REST_DZ = -0.8, PRESENT_DZ = 0.53;  // card depth at rest / presented (from HOME)

async function start() {
  prefetchArm();          // arm meshing runs in workers while the rest is set up
  const portraitPromise = new THREE.TextureLoader().loadAsync('./assets/portrait-full.webp');
  // Keep the asset request parallel with meshing; start() handles failures below.
  portraitPromise.catch(() => {});
  const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'});
  // Preserve retina detail in the photo as well as in the DOM text.
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // High-key studio curve: linear (colour-faithful) up to 0.8, then a short
  // exponential shoulder that reaches white at ~1.7, so the window-lit left
  // of the room can bloom to paper white the way a bright photograph does.
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    `vec3 CustomToneMapping( vec3 color ) {
      color *= toneMappingExposure;
      float peak = max(max(color.r, color.g), color.b);
      const float k = 0.8;
      if (peak <= k) return color;
      float mapped = k + (1.0 - k) * (1.0 - exp(-(peak - k) / (1.0 - k) * 1.15));
      vec3 c = color * (mapped / peak);
      return mix(c, vec3(mapped), smoothstep(0.0, 1.0, (peak - k) * 0.6));
    }`);
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.className = 'studio-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  hero.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1f1ef);
  const camera = new THREE.PerspectiveCamera();
  const studio = createStudio(renderer, scene);
  const {sunlit} = studio;

  // Matte, pale satin silver for every shell, knuckle, cap and the frame.
  // Softer satin: less metalness and more roughness, so the arm mirrors less
  // of the darker room and its highlight/shadow contrast stays gentle.
  // Metal look kept (high metalness, environment reflections), but the hot
  // direct-light highlights from the sun and window are damped on the arm so
  // they don't pull the eye away from the photo; very bright reflections are
  // softly compressed too.
  const metal = sunlit(new THREE.MeshPhysicalMaterial({color: new THREE.Color().setRGB(.93, .935, .945, THREE.LinearSRGBColorSpace),
    metalness: .76, roughness: .44, envMapIntensity: 1.25}), shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directSpecular *= .3;
        vec3 is = reflectedLight.indirectSpecular; float pk = max(max(is.r, is.g), is.b);
        reflectedLight.indirectSpecular = is * (pk > .55 ? (.55 + (pk - .55) * .35) / pk : 1.);`);
    });
  metal.customProgramCacheKey = () => 'studio-sun-arm-metal';
  const seam = sunlit(new THREE.MeshStandardMaterial({color: new THREE.Color().setRGB(.42, .44, .46, THREE.LinearSRGBColorSpace), metalness: .8, roughness: .6}));
  // Saturated cyan, kept below the tone curve's knee so it stays coloured.
  const led = new THREE.MeshStandardMaterial({color: 0x1aa9bf, emissive: 0x00b8d4, emissiveIntensity: .7, roughness: .35, metalness: 0});
  const pad = sunlit(new THREE.MeshStandardMaterial({color: 0x3a3f44, roughness: .85}));

  const robot = await buildRobot({metal, seam, led, pad});
  scene.add(robot.root);

  // ---- the held photo card (rigidly pinched; see GRASP in kinematics.js) ----
  const card = new THREE.Group();
  {
    const A = GRASP_A;   // columns: gripper axes in card coords → card→gripper = Aᵀ
    const m = new THREE.Matrix4().set(A[0], A[3], A[6], 0, A[1], A[4], A[7], 0, A[2], A[5], A[8], 0, 0, 0, 0, 1);
    card.quaternion.setFromRotationMatrix(m);
    card.position.set(...GRASP.pinch).applyMatrix4(m).negate();
    robot.tcp.add(card);
  }
  const rounded = (w, h, r) => {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  };
  // A thin clear acrylic panel carrying the portrait cut-out (no backing,
  // no frame). Its edge is lit by a fine cyan band, the same light as the
  // arm's rings, so it breathes and brightens with them.
  const S = CHARM_SCALE, T = CARD.depth;
  const panelShape = rounded(CARD.w, CARD.h, 0.04);
  const panelGeo = new THREE.ExtrudeGeometry(panelShape, {depth: T, bevelEnabled: true, bevelThickness: .002, bevelSize: .002, bevelSegments: 2, curveSegments: 16});
  panelGeo.translate(0, 0, -T / 2);
  const acrylic = sunlit(new THREE.MeshPhysicalMaterial({color: 0xf4f8fb, transparent: true, opacity: .16, roughness: .06, metalness: 0,
    clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1.3, depthWrite: false}));
  const panel = new THREE.Mesh(panelGeo, acrylic); panel.renderOrder = 1; card.add(panel);
  const edgePath = new THREE.CatmullRomCurve3(rounded(CARD.w - .004, CARD.h - .004, 0.038).getPoints(40).map(p => new THREE.Vector3(p.x, p.y, 0)), true);
  const edge = new THREE.Mesh(new THREE.TubeGeometry(edgePath, 240, 0.0042, 8, true), led);
  card.add(edge);
  const portrait = await portraitPromise;
  // Crop the full-resolution image in UV space, retaining the existing framing.
  portrait.repeat.set(0.70, 0.7825);
  portrait.offset.set(0.15, 1 - 0.7825);
  portrait.colorSpace = THREE.SRGBColorSpace;
  portrait.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const pw = CARD.w - 0.05, ph = CARD.h - 0.05;
  const photoGeo = new THREE.PlaneGeometry(pw, ph);
  const photo = new THREE.Mesh(photoGeo, new THREE.MeshBasicMaterial({map: portrait, transparent: true, toneMapped: false, alphaTest: .02}));
  photo.position.z = T / 2 + 0.0012; photo.renderOrder = 2;
  // the printed image (not the clear acrylic) casts the shadow
  photo.castShadow = true;
  photo.customDepthMaterial = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking, map: portrait, alphaTest: .5});
  card.add(photo);
  const ANCHOR_Y = -CARD.h / 2 + 0.03;          // grommets just inside the bottom edge
  for (const c of CHARMS) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0035, 8, 32), metal);
    m.position.set(c.x, ANCHOR_Y, 0); m.castShadow = true; card.add(m);
  }

  // ---- charms on chains ----
  const pendants = (await buildCharms({metal, sunlit})).map((group, i) => {
    group.scale.setScalar(S);
    scene.add(group);
    const n = Math.max(3, Math.round(CHARMS[i].chain / 0.021));
    const links = buildChainLinks(metal, n, 1.15);
    links.forEach(l => scene.add(l));
    return {group, links, sim: new ChainPendant([0, 0, 0], CHARMS[i].chain, {links: n, radius: group.userData.radius * S})};
  });
  const drops = pendants.map(p => p.group.userData.drop * S);

  // ---- kinematic state ----
  let q = solveIK(REST_GUESS, goalFrame([0, 0, 0, 0, 0]), {rest: REST_GUESS, iterations: 400, nullGain: 0.02});
  const rest = [...q];
  q = solveIK(q, goalFrame([0, 0, REST_DZ, 0, 0]), {rest, iterations: 200});
  let offset = [0, 0, REST_DZ, 0, 0], offVel = [0, 0, 0, 0, 0];   // smoothed task-space offsets
  let jointSpeed = 0;                                       // smoothed, rad/s

  const anchor = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0), tmp = new THREE.Vector3();
  function anchorAt(i) { anchor.set(CHARMS[i].x, ANCHOR_Y, 0); card.localToWorld(anchor); return anchor.toArray(); }
  function applyPose(dt) {
    const prev = q;
    q = solveIK(q, goalFrame(offset), {rest, iterations: dt ? 4 : 60, dt});
    if (dt) {
      const sp = Math.hypot(...q.map((v, k) => v - prev[k])) / dt;
      jointSpeed += (sp - jointSpeed) * Math.min(1, dt * 6);
    }
    robot.set(q);
    robot.root.updateMatrixWorld(true);
  }
  applyPose(null);
  pendants.forEach((p, i) => p.sim.reset(anchorAt(i)));
  if (params.has('still')) {
    for (let k = 0; k < 2400; k++) { pendants.forEach((p, i) => p.sim.step(anchorAt(i), 1 / 120)); separate(pendants.map(p => p.sim), drops); }
  }

  function drawPendants() {
    pendants.forEach((p, i) => {
      const s = p.sim, a = new THREE.Vector3(...anchorAt(i)), end = new THREE.Vector3(...s.end);
      p.group.position.copy(end);
      p.group.quaternion.setFromUnitVectors(down, end.clone().sub(a).normalize());
      p.group.rotateY(s.twist);
      p.links.forEach((l, j) => {
        const pa = s.p[j], pb = s.p[j + 1];
        l.position.set((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2);
        tmp.set(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]).normalize();
        l.quaternion.setFromUnitVectors(down, tmp);
        if (j % 2) l.rotateY(Math.PI / 2);
      });
    });
  }

  // ---- framing: off-axis perspective so the sculpture sits in its column ----
  const COMPOSE = {x0: -1.21, x1: 1.87, y0: -0.1, y1: 2.55, eyeY: 1.0, dist: 5.4};
  let needsRender = 3;
  function resize() {
    const W = hero.clientWidth, H = hero.clientHeight, r = host.getBoundingClientRect(), hr = hero.getBoundingClientRect();
    renderer.setSize(W, H, false);
    renderer.domElement.style.width = W + 'px'; renderer.domElement.style.height = H + 'px';
    // Narrow screens: frame the card and the forearm; the base may leave the frame.
    const C = r.width < 600 ? {...COMPOSE, x0: -0.62, x1: 1.2, y0: 0.45, y1: 2.5} : COMPOSE;
    const k = Math.min(r.width / (C.x1 - C.x0), r.height / (C.y1 - C.y0));
    const cx = (C.x0 + C.x1) / 2, cyW = (C.y0 + C.y1) / 2;
    const hx = r.left - hr.left + r.width / 2, hy = r.top - hr.top + r.height / 2;
    camera.position.set(cx, C.eyeY, C.dist);
    camera.lookAt(cx, C.eyeY, 0);
    const F = k * C.dist, u0 = hx, v0 = hy - k * (C.eyeY - cyW), n = 0.5, f = 60;
    camera.near = n; camera.far = f;
    camera.projectionMatrix.makePerspective(-u0 * n / F, (W - u0) * n / F, v0 * n / F, -(H - v0) * n / F, n, f);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld();
    studio.resize(W, H, renderer.getPixelRatio());
    needsRender = 3;
  }
  new ResizeObserver(resize).observe(hero);
  resize();

  // ---- behaviour: idle breathing, hover attention, click greeting ----
  const cardBox = new THREE.Box3(), ndc = new THREE.Vector3();
  function cardRect() {
    cardBox.setFromObject(card);
    const cr = renderer.domElement.getBoundingClientRect();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const x of [cardBox.min.x, cardBox.max.x]) for (const y of [cardBox.min.y, cardBox.max.y]) for (const z of [cardBox.min.z, cardBox.max.z]) {
      ndc.set(x, y, z).project(camera);
      const sx = cr.left + (ndc.x + 1) / 2 * cr.width, sy = cr.top + (1 - ndc.y) / 2 * cr.height;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return {x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2};
  }
  const pointer = {x: -1e4, y: -1e4, inside: false};
  let hover = 0, greetAt = -1e9;
  addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true; }, {passive: true});
  document.documentElement.addEventListener('pointerleave', () => { pointer.inside = false; });
  function overCard(x, y, m = 12) { const r = cardRect(); return x > r.x0 - m && x < r.x1 + m && y > r.y0 - m && y < r.y1 + m; }
  let simTime = 0;
  function greet() { if (!paused) { greetAt = simTime; needsRender = 3; } }
  addEventListener('pointerdown', e => { if (overCard(e.clientX, e.clientY)) greet(); });
  host.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); greet(); } });

  // Offsets [dx, dy, dz, dyaw, dpitch] the arm should hold at time t.
  function behaviour(t) {
    const b = params.has('still') ? 0 : Math.sin(2 * Math.PI * t / BREATH);
    // idle: millimetre-scale breathing, slow enough not to pull the eye
    const amp = params.has('still') ? 0 : 1;
    // the card rests set back and turned (dz < 0, HOME.yaw); hover brings it
    // forward and square to the screen
    const o = [0.012 * amp * Math.sin(2 * Math.PI * t / 11), 0.022 * b, REST_DZ, 0.05 * amp * Math.sin(2 * Math.PI * t / 8.3 + 1), 0.025 * amp * Math.sin(2 * Math.PI * t / BREATH + 0.8)];
    // hover: lean the card toward the visitor and turn it to face the cursor
    let target = 0, u = 0, v = 0;
    if (pointer.inside && !coarse) {
      const r = cardRect();
      const dx = Math.max(r.x0 - pointer.x, 0, pointer.x - r.x1), dy = Math.max(r.y0 - pointer.y, 0, pointer.y - r.y1);
      target = 1 - THREE.MathUtils.smoothstep(Math.hypot(dx, dy), 0, 150);
      u = clamp((pointer.x - r.cx) / 420, -1, 1); v = clamp((r.cy - pointer.y) / 420, -1, 1);
    }
    hover += (target - hover) * 0.06;
    o[0] += hover * u * 0.04; o[1] += hover * (0.03 + v * 0.02); o[2] += hover * (PRESENT_DZ - REST_DZ);
    // presented: parallel to the window, no yaw or pitch (the idle sway fades out)
    o[3] = o[3] * (1 - hover) - HOME.yaw * hover; o[4] *= 1 - hover;
    // greeting: bring the card forward, a small double nod of the wrist, back
    const g = t - greetAt;
    if (g >= 0 && g < GREET) {
      const env = Math.sin(Math.PI * Math.min(1, g / GREET)) ** 1.5;
      // forward to the presented distance, square to the screen, with two
      // small up-down bobs that set the charms swinging (no tilt)
      const p = Math.max(env, hover);
      o[2] += (PRESENT_DZ - REST_DZ) * Math.max(0, env - hover);
      o[3] = o[3] * (1 - p) - HOME.yaw * p; o[4] *= 1 - p;
      o[1] += 0.04 * env + 0.03 * Math.sin(2 * Math.PI * 2 * g) * Math.exp(-2.2 * g);
    }
    return {o, breath: b};
  }

  reduced.addEventListener('change', () => { paused = reduced.matches; });

  drawPendants();
  // Compile every shader up front, in parallel where the GPU driver allows
  // (KHR_parallel_shader_compile), instead of stalling the first frame.
  try { await renderer.compileAsync(scene, camera); } catch (e) {}
  // Render the assembled pose, shadows and floor reflection before revealing it.
  // A separate HTML portrait must never morph/jump into the held photo.
  studio.reflect(camera, [robot.root, ...pendants.flatMap(p => [p.group, ...p.links])]);
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  host.classList.add('ready'); host.setAttribute('aria-busy', 'false');
  document.body.classList.add('studio-ready');

  // ---- loop ----
  let last = performance.now(), acc = 0, tick = 0;
  const STEP = 1 / 120;
  addEventListener('visibilitychange', () => { last = performance.now(); acc = 0; });
  // The floor reflection is already warm when the complete scene is revealed.
  const reflectReady = true;
  // Stop rendering entirely while the hero is scrolled out of view.
  let onScreen = true;
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; last = performance.now(); }).observe(hero);
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden || !onScreen) return;
    const delta = Math.min((now - last) / 1000, 0.05); last = now;
    let moving = false, breath = 0;
    acc += delta;
    while (acc >= STEP) {
      acc -= STEP;
      if (paused) { jointSpeed *= 0.95; continue; }
      simTime += STEP;
      const beh = behaviour(simTime);
      breath = beh.breath;
      springStep(offset, offVel, beh.o, STEP, 30, 11);
      applyPose(STEP);
      pendants.forEach((p, i) => p.sim.step(anchorAt(i), STEP));
      separate(pendants.map(p => p.sim), drops);
      moving = moving || offVel.some(v => Math.abs(v) > 2e-4) || pendants.some(p => p.sim.energy() > 2e-6);
    }
    // Light rings breathe with the idle sway and brighten with joint speed.
    led.emissiveIntensity = 0.35 + 0.45 * (0.5 + 0.5 * breath) + Math.min(1.1, jointSpeed * 1.4);
    tick++;
    // Idle breathing is slow: 30 fps is enough. Nothing moving: no frame at all.
    const quietNow = jointSpeed < 0.03 && !pendants.some(p => p.sim.energy() > 4e-5);
    if (needsRender <= 0 && (!moving || (quietNow && tick % 2))) return;
    // Idle breathing moves millimetres: refresh shadows/reflection only every
    // few frames then; real motion (hover, greeting, swinging) refreshes every frame.
    const quiet = jointSpeed < 0.03 && !pendants.some(p => p.sim.energy() > 4e-5);
    const geometryChanged = needsRender > 0 || (moving && (!quiet || tick % 6 === 0));
    needsRender = Math.max(0, needsRender - 1);
    drawPendants();
    if (geometryChanged && reflectReady) studio.reflect(camera, [robot.root, ...pendants.flatMap(p => [p.group, ...p.links])]);
    renderer.shadowMap.needsUpdate = geometryChanged;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
}

start().catch(error => {
  console.error('Unable to initialise the interactive scene', error);
  host.classList.add('load-error'); host.setAttribute('aria-busy', 'false');
  document.querySelector('#load-message').textContent = 'The interactive scene couldn’t load. Please refresh to try again.';
});
