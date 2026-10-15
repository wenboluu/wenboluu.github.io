import * as THREE from 'three';

// The NYU coin (built here from primitives) and the IKEA BLÅHAJ shark (third-party model converted by work/build-charm-models.py;
// credit in work/models/README.md and on the page). Each group's origin is its jump ring; the charm
// hangs along -y.
export async function buildCharms({metal, sunlit}) {
  function mesh(geo, mat, parent, pos = [0, 0, 0]) {
    if (mat && !mat.userData.sunlit) { sunlit(mat); mat.userData.sunlit = true; }
    const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function cylinder(parent, rTop, rBottom, height, mat, pos = [0, 0, 0]) { return mesh(new THREE.CylinderGeometry(rTop, rBottom, height, 48), mat, parent, pos); }
  function ring(parent, r, t, mat, pos = [0, 0, 0]) { return mesh(new THREE.TorusGeometry(r, t, 8, 48), mat, parent, pos); }
  metal.userData.sunlit = true;

  function nyuCharm() {
    const g=new THREE.Group();ring(g,.025,.006,metal);
    const body=cylinder(g,.145,.145,.035,metal,[0,-.15,0]);body.rotation.x=Math.PI/2;
    const c=document.createElement('canvas');c.width=512;c.height=512;const ctx=c.getContext('2d');
    const enamel=ctx.createRadialGradient(160,110,10,256,256,350);
    enamel.addColorStop(0,'#68489a');enamel.addColorStop(.6,'#482378');enamel.addColorStop(1,'#321551');
    ctx.fillStyle=enamel;ctx.fillRect(0,0,512,512);
    ctx.strokeStyle='rgba(236,225,255,.48)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(256,256,234,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#f8f5ff';ctx.font='600 92px Arial';ctx.textAlign='center';ctx.fillText('NYU',256,402);
    ctx.save();ctx.translate(102,32);ctx.scale(6.5,6.5);
    ctx.fill(new Path2D('M21.48,25.43c-5-3-4.5-7.24-2.43-10.37a.46.46,0,0,0,0-.3,12.07,12.07,0,0,0-1.24-3.14c-.09-.13-.17-.12-.17,0,0,.85-1,3-2.48,5.44-1.58,2.62-1.58,8.3,6.25,8.52.07,0,.09-.07,0-.12m1.34-.22c-3-6.39,3-10.51,4-11.4.14-.12.1-.24.1-.38A15,15,0,0,0,25.36,7.7c-.05-.07-.1,0-.12,0-.51,2-3.23,4.93-3.78,5.58-4.61,5.48-3.56,8.82,1.26,12,.06,0,.13,0,.1-.07m1-.27c1.41-6.77,6.92-6.94,7.41-8.22.77-2-.64-5.56-1-6,0,0-.08,0-.1,0a12,12,0,0,1-2.85,3.92c-1.25,1-6,4.55-3.59,10.26a.06.06,0,0,0,.12,0m1,.59c8.92.32,9.55-7.81,9.59-10.85,0-.18-.08-.19-.13-.07a8.52,8.52,0,0,1-4.64,4.28,8.39,8.39,0,0,0-4.9,6.54c0,.06,0,.09.08.1m2,1h-7v2h7ZM22.69,43.06a.52.52,0,0,0,1,0l1.7-13.51H21.22Z'));ctx.restore();
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
    const face=mesh(new THREE.CircleGeometry(.132,64),new THREE.MeshPhysicalMaterial({map:tex,roughness:.3,metalness:.08,clearcoat:.6,envMapIntensity:.45}),g,[0,-.15,.019]);
    return g;
  }
  // ---- model-based charms (see work/build-charm-models.py for sources) ----
  async function loadPacked(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    const n = new DataView(buf).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
    const base = 4 + n, T = {f32: Float32Array, u32: Uint32Array, u16: Uint16Array, u8: Uint8Array};
    const parts = {};
    for (const [name, attrs] of Object.entries(header)) {
      const g = new THREE.BufferGeometry();
      for (const [attr, d] of Object.entries(attrs)) {
        const arr = new T[d.type](buf, base + d.offset, d.count);
        if (attr === 'index') g.setIndex(new THREE.BufferAttribute(arr, 1));
        else g.setAttribute(attr, new THREE.BufferAttribute(arr, attr === 'uv' ? 2 : 3, d.type === 'u8'));
      }
      g.computeBoundingSphere(); parts[name] = g;
    }
    return parts;
  }
  const tex = async (url, srgb) => {
    const t = await new THREE.TextureLoader().loadAsync(url);
    t.flipY = false; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const [sharkParts, sharkColor, sharkNormal, teethTex] = await Promise.all([
    loadPacked('./assets/models/blahaj.bin'),
    tex('./assets/models/blahaj-color.jpg', true), tex('./assets/models/blahaj-normal.jpg', false), tex('./assets/models/blahaj-teeth.png', true)]);
  // The OBJ's UVs use a bottom-left origin; the textures are loaded unflipped
  // to match that, so flip v once in the geometry instead.
  for (const g of [sharkParts.body, sharkParts.teeth]) { const uv = g.attributes.uv; for (let i = 1; i < uv.array.length; i += 2) uv.array[i] = 1 - uv.array[i]; }
  const fabricSheen = {roughness: .9, sheen: 1, sheenRoughness: .45, sheenColor: new THREE.Color(0xffffff), envMapIntensity: .7};

  function sharkCharm() {   // BLÅHAJ by Kaine_G (Sketchfab, CC BY 4.0)
    const g = new THREE.Group(); ring(g, .023, .006, metal);
    mesh(sharkParts.body, new THREE.MeshPhysicalMaterial({map: sharkColor, normalMap: sharkNormal, normalScale: new THREE.Vector2(.8, .8), ...fabricSheen}), g);
    const t = mesh(sharkParts.teeth, new THREE.MeshStandardMaterial({map: teethTex, alphaTest: .5, roughness: .8, side: THREE.DoubleSide}), g);
    t.castShadow = false;
    return g;
  }
  const groups = [nyuCharm(), sharkCharm()];
  // collision proxies (in charm units, before scaling): centre drop, radius
  groups[0].userData = {drop: .15, radius: .15};
  groups[1].userData = {drop: .14, radius: .2};
  return groups;
}

// A chain of small oval links between two points.
export function buildChainLinks(metal, count, scale = 1) {
  const geo = new THREE.TorusGeometry(0.0085 * scale, 0.0019 * scale, 8, 24);
  geo.scale(1, 1.45, 1);
  return Array.from({length: count}, () => { const m = new THREE.Mesh(geo, metal); m.castShadow = true; return m; });
}
