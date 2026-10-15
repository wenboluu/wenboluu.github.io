import * as THREE from 'three';
import {JOINTS, TCP_OFFSET, BASE, KNUCKLE} from './kinematics.js';
import * as S from './sdf.js';
import {SHAPES, D, R, upperR, foreR, J3Y, J5Y, FINGER, ARM_RESOLUTION} from './robot-shapes.js';


// Shell meshes are generated from the SDFs in parallel Web Workers, then
// kept in the Cache API so repeat visits skip meshing entirely. Without
// workers (e.g. the single-file build) it meshes on the main thread.
const ARM_SIGNATURE = JSON.stringify([JOINTS.map(j => j.offset), KNUCKLE, R, D, ARM_RESOLUTION, 1]);
const CACHE_KEY = './__arm-mesh?' + encodeURIComponent(ARM_SIGNATURE).length + '-' + [...ARM_SIGNATURE].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
const PARTS = [...SHAPES.map((_, i) => ({name: 'link' + i, index: i})), {name: 'finger', index: -1}];

function toGeometry({positions, normals, indices}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeBoundingSphere();
  return g;
}
function pack(meshes) {      // {name: {positions, normals, indices}} -> ArrayBuffer
  const head = [], bufs = []; let off = 0;
  for (const [name, m] of Object.entries(meshes)) {
    const e = {name};
    for (const k of ['positions', 'normals', 'indices']) { e[k] = [off, m[k].length]; bufs.push(m[k]); off += m[k].byteLength; }
    head.push(e);
  }
  const hj = new TextEncoder().encode(JSON.stringify(head)), pad = (4 - (hj.length % 4)) % 4;
  const out = new Uint8Array(4 + hj.length + pad + off);
  new DataView(out.buffer).setUint32(0, hj.length + pad, true); out.set(hj, 4); out.fill(32, 4 + hj.length, 4 + hj.length + pad);
  let o = 4 + hj.length + pad; for (const b of bufs) { out.set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength), o); o += b.byteLength; }
  return out.buffer;
}
function unpack(buf) {
  const n = new DataView(buf).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
  const base = 4 + n, out = {};
  for (const e of head) out[e.name] = {
    positions: new Float32Array(buf, base + e.positions[0], e.positions[1]),
    normals: new Float32Array(buf, base + e.normals[0], e.normals[1]),
    indices: new Uint32Array(buf, base + e.indices[0], e.indices[1])};
  return out;
}
async function meshInWorkers() {
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
  const url = new URL('./arm-worker.js', import.meta.url);
  const workers = Array.from({length: n}, () => new Worker(url, {type: 'module'}));
  // largest parts first, dealt round-robin
  const order = [3, 1, 2, 5, 4, 0, 6, 7, -1].map(i => PARTS.find(p => p.index === i));
  const out = {};
  await Promise.all(workers.map((w, k) => new Promise((resolve, reject) => {
    const jobs = order.filter((_, j) => j % n === k);
    let left = jobs.length;
    if (!left) return resolve();
    w.onmessage = ({data}) => { out[data.name] = data; if (--left === 0) resolve(); };
    w.onerror = reject;
    w.postMessage({jobs});
  })).map(p => p.finally(() => {})));
  workers.forEach(w => w.terminate());
  return out;
}
// Start as early as possible (scene.js calls this before setting up lights).
let armPromise = null;
export const prefetchArm = () => (armPromise ??= armMeshes());
async function armMeshes() {
  let cache = null;
  try { cache = await caches.open('wl-arm-mesh'); const hit = await cache.match(CACHE_KEY); if (hit) return unpack(await hit.arrayBuffer()); } catch (e) { cache = null; }
  let out = null;
  try { out = await meshInWorkers(); } catch (e) { out = null; }
  if (!out) {
    out = {};
    for (const p of PARTS) {
      const s = p.index < 0 ? FINGER : SHAPES[p.index];
      out[p.name] = S.mesh(s.sdf, s.bounds[0], s.bounds[1], p.index < 0 ? FINGER.h : ARM_RESOLUTION);
      await new Promise(r => setTimeout(r, 0));
    }
  }
  if (cache) try { await cache.put(CACHE_KEY, new Response(pack(out))); } catch (e) {}
  return out;
}

export async function buildRobot({metal, seam, led, pad}) {
  const raw = await prefetchArm();
  const meshes = Object.fromEntries(Object.entries(raw).map(([k, m]) => [k, toGeometry(m)]));
  const root = new THREE.Group();
  root.position.set(...BASE);
  const joints = [];
  const add = (parent, geo, mat, pos = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(...pos);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const ring = (parent, r, t, mat, pos, axis) => {
    const m = add(parent, new THREE.TorusGeometry(r, t, 10, 96), mat, pos);
    if (axis === 'y') m.rotation.x = Math.PI / 2; return m;
  };
  const shell = i => meshes['link' + i];
  add(root, shell(0), metal);
  let parent = root;
  for (const [i, j] of JOINTS.entries()) {
    const g = new THREE.Group();
    g.position.set(...j.offset);
    g.userData.axis = j.axis;
    parent.add(g); joints.push(g);
    add(g, shell(i + 1), metal);
    parent = g;
  }
  // Seams and light rings. Each sits exactly on a joint, so every visible
  // break in the shell corresponds to a real axis.
  const [g1, g2, g3, g4, g5, g6, g7] = joints;
  ring(g1, R.col + 0.011, 0.0035, seam, [0, 0, 0], 'y');                 // J1 turntable seam
  ring(g3, upperR(J3Y) - 0.003, 0.0065, led, [0, 0, 0], 'y');            // J3 roll light
  ring(g5, foreR(J5Y) - 0.003, 0.006, led, [0, 0, 0], 'y');             // J5 roll light
  ring(g7, R.wr - 0.002, 0.003, seam, [0, 0, 0], 'y');                   // J7 flange seam
  // Knuckle seams: the gap between the two drums, plus a cap line on the outer face.
  const knuckle = (child, d, k, sign) => {
    ring(child, d.r - 0.006, 0.0032, seam, [0, 0, -sign * (d.w + 0.002)]);       // drum gap
    ring(child, d.r * 0.74, 0.0022, seam, [0, 0, sign * (d.w + 0.0005)]);       // child outer cap
    ring(child, d.r * 0.74, 0.0022, seam, [0, 0, -sign * (k + d.w + 0.0005)]);  // parent outer cap
  };
  knuckle(g2, D.J2, KNUCKLE.J2, 1); knuckle(g4, D.J4, KNUCKLE.J4, -1); knuckle(g6, D.J6, KNUCKLE.J6, 1);

  // Parallel gripper. Finger travel is along the flange x axis, which the grasp
  // aligns with the card normal; while holding, the opening is fixed at the
  // frame thickness (a prismatic DOF at rest).
  const tcp = new THREE.Group(); tcp.position.set(...TCP_OFFSET); g7.add(tcp);
  const fingerGeo = meshes.finger;
  const fingers = [-1, 1].map(s => {
    // fingers close on the acrylic's front and back faces (thickness 0.012)
    const f = new THREE.Group(); f.position.set(s * 0.025, 0, 0); tcp.add(f);
    add(f, fingerGeo, metal);
    const padMesh = add(f, new THREE.BoxGeometry(0.008, 0.05, 0.05), pad, [-s * 0.014, 0.0, 0]);
    padMesh.castShadow = false;
    return f;
  });

  return {
    root, joints, tcp, fingers,
    set(q) { joints.forEach((g, i) => g.rotation[g.userData.axis] = q[i]); },
  };
}
