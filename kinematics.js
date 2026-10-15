// Serial 7-DOF arm: fixed rigid links, revolute joints only.
//
// Layout (all angles zero = arm pointing straight up, every frame y-up):
//   J1 yaw   (y)  base turntable
//   J2 pitch (z)  shoulder knuckle      ─┐ pitch knuckles are side-by-side
//   J3 roll  (y)  upper-arm roll ring    │ coaxial drums, so each child link
//   J4 pitch (z)  elbow knuckle          │ is displaced along the joint axis
//   J5 roll  (y)  forearm roll ring      │ (Rizon/Franka style). The offset is
//   J6 pitch (z)  wrist knuckle          │ a constant translation along that
//   J7 roll  (y)  flange                ─┘ joint's own axis.
//
// The pose of every rigid body is produced ONLY by composing these fixed
// offsets with the joint rotations (forward kinematics). Nothing is scaled,
// stretched or placed from end points.

// Lateral distance between the two coaxial drum centres of each pitch knuckle
// (= drum width + seam gap). Drums are at least as wide as the tube they carry.
export const KNUCKLE = {J2: 0.260, J4: 0.232, J6: 0.196};
export const JOINTS = [
  {name: 'J1', axis: 'y', offset: [0, 0.16, 0],          limit: [-2.79, 2.79], vmax: 2.0},
  {name: 'J2', axis: 'z', offset: [0, 0.36, KNUCKLE.J2],    limit: [-2.27, 2.27], vmax: 2.0},
  {name: 'J3', axis: 'y', offset: [0, 0.50, 0],          limit: [-2.97, 2.97], vmax: 2.4},
  {name: 'J4', axis: 'z', offset: [0, 0.75, -KNUCKLE.J4],   limit: [-2.79, 2.79], vmax: 2.4},
  {name: 'J5', axis: 'y', offset: [0, 0.40, 0],          limit: [-2.97, 2.97], vmax: 2.9},
  {name: 'J6', axis: 'z', offset: [0, 0.60, KNUCKLE.J6],    limit: [-1.66, 3.32], vmax: 2.9},
  {name: 'J7', axis: 'y', offset: [0, 0.17, 0],          limit: [-2.97, 2.97], vmax: 2.9},
];
// Tool centre point: between the fingertips, measured from the J7 frame.
export const TCP_OFFSET = [0, 0.27, 0];
export const BASE = [1.5, 0, 0.2];      // robot base on the studio floor

// ---------- tiny rigid-transform algebra (row-major 3x3 + vec3) ----------
const I3 = () => [1,0,0, 0,1,0, 0,0,1];
export function mul3(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    r[i*3+j] = a[i*3]*b[j] + a[i*3+1]*b[3+j] + a[i*3+2]*b[6+j];
  return r;
}
export const apply3 = (m, v) => [
  m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
export const transpose3 = m => [m[0],m[3],m[6], m[1],m[4],m[7], m[2],m[5],m[8]];
function rot(axis, q) {
  const c = Math.cos(q), s = Math.sin(q);
  if (axis === 'y') return [c,0,s, 0,1,0, -s,0,c];
  if (axis === 'z') return [c,-s,0, s,c,0, 0,0,1];
  return [1,0,0, 0,c,-s, 0,s,c];
}
export function rotFromAxisAngle(k, a) {
  const n = Math.hypot(...k) || 1, x = k[0]/n, y = k[1]/n, z = k[2]/n;
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t*x*x+c, t*x*y-s*z, t*x*z+s*y,  t*x*y+s*z, t*y*y+c, t*y*z-s*x,  t*x*z-s*y, t*y*z+s*x, t*z*z+c];
}
// log map of a rotation matrix -> axis*angle vector
export function rotLog(R) {
  const tr = (R[0] + R[4] + R[8] - 1) / 2, a = Math.acos(Math.max(-1, Math.min(1, tr)));
  if (a < 1e-9) return [0, 0, 0];
  if (Math.PI - a < 1e-6) {               // near pi: pick the dominant column
    const d = [R[0], R[4], R[8]], i = d.indexOf(Math.max(...d));
    const v = [R[i], R[3+i], R[6+i]]; v[i] += 1;
    const n = Math.hypot(...v); return v.map(x => x / n * a);
  }
  const k = a / (2 * Math.sin(a));
  return [(R[7]-R[5])*k, (R[2]-R[6])*k, (R[3]-R[1])*k];
}

// Forward kinematics. Returns world frames for J1..J7 (joint origin, after the
// joint's own rotation) and the TCP frame. frame = {p:[3], R:[9]}.
export function forward(q, base = BASE) {
  let p = [...base], R = I3();
  const frames = [];
  JOINTS.forEach((j, i) => {
    const o = apply3(R, j.offset);
    p = [p[0]+o[0], p[1]+o[1], p[2]+o[2]];
    const axisWorld = apply3(R, j.axis === 'y' ? [0,1,0] : [0,0,1]);
    R = mul3(R, rot(j.axis, q[i]));
    frames.push({p, R, axis: axisWorld});
  });
  const t = apply3(R, TCP_OFFSET);
  return {frames, tcp: {p: [p[0]+t[0], p[1]+t[1], p[2]+t[2]], R}};
}

// Geometric Jacobian (6x7) for the TCP: rows vx vy vz wx wy wz.
export function jacobian(fk) {
  const J = Array.from({length: 6}, () => new Array(7).fill(0));
  const pe = fk.tcp.p;
  fk.frames.forEach((f, i) => {
    const z = f.axis, r = [pe[0]-f.p[0], pe[1]-f.p[1], pe[2]-f.p[2]];
    const v = [z[1]*r[2]-z[2]*r[1], z[2]*r[0]-z[0]*r[2], z[0]*r[1]-z[1]*r[0]];
    for (let k = 0; k < 3; k++) { J[k][i] = v[k]; J[3+k][i] = z[k]; }
  });
  return J;
}

function solve6(A, b) {             // Gaussian elimination with pivoting, 6x6
  const n = 6, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c+1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function poseError(fk, target) {
  const e = target.p.map((v, i) => v - fk.tcp.p[i]);
  const w = rotLog(mul3(target.R, transpose3(fk.tcp.R)));
  return {e, w, pos: Math.hypot(...e), rot: Math.hypot(...w)};
}

// Damped least-squares IK with joint limits and a null-space pull toward a
// preferred posture (resolves the 7th DOF: elbow stays up in an arch).
// Warm-started from q so successive frames stay continuous.
export function solveIK(q0, target, {rest, iterations = 24, damping = 0.04, rotWeight = 0.45, nullGain = 0.08, dt = null} = {}) {
  let q = [...q0];
  for (let it = 0; it < iterations; it++) {
    const fk = forward(q), err = poseError(fk, target);
    if (err.pos < 1e-5 && err.rot < 1e-5) break;
    const J = jacobian(fk);
    const W = [1,1,1, rotWeight,rotWeight,rotWeight];
    const Jw = J.map((row, r) => row.map(v => v * W[r]));
    const x = [...err.e, ...err.w].map((v, r) => v * W[r]);
    // dq = J^T (J J^T + λ² I)^-1 x
    const A = Jw.map((ri) => Jw.map(rj => ri.reduce((s, v, k) => s + v * rj[k], 0)));
    for (let k = 0; k < 6; k++) A[k][k] += damping * damping;
    const y = solve6(A, x);
    const dq = q.map((_, k) => Jw.reduce((s, row, r) => s + row[k] * y[r], 0));
    if (rest) {
      // null-space projection N = I - J⁺J applied to a posture gradient
      const g = q.map((v, k) => (rest[k] - v) * nullGain);
      const Jg = Jw.map(row => row.reduce((s, v, k) => s + v * g[k], 0));
      const yg = solve6(A, Jg);
      for (let k = 0; k < 7; k++) dq[k] += g[k] - Jw.reduce((s, row, r) => s + row[k] * yg[r], 0);
    }
    q = q.map((v, k) => clampJoint(k, v + dq[k]));
  }
  if (dt) {                          // actuator velocity limits
    q = q.map((v, k) => {
      const m = JOINTS[k].vmax * dt;
      return q0[k] + Math.max(-m, Math.min(m, v - q0[k]));
    });
  }
  return q;
}
export const clampJoint = (k, v) => Math.max(JOINTS[k].limit[0], Math.min(JOINTS[k].limit[1], v));

// ---------- the held card and how the gripper holds it ----------
// Card frame: x right, y up, z = normal toward the viewer, origin at the
// card centre. The card is a clear acrylic panel carrying the portrait. The
// parallel gripper pinches its top edge near the top-right corner from the side: fingers on the front and back faces
// (finger travel = card normal), approaching from the upper right at
// GRASP.angle from vertical. The grasp is rigid, so the card's pose is fully
// determined by the tool frame.
export const CARD = {w: 0.82, h: 0.92, depth: 0.012};   // clear acrylic panel
export const GRASP = {angle: 0.61, pinch: [0.22, CARD.h / 2 - 0.024, 0]};
// A: columns are the gripper axes (x finger travel, y approach, z) in card coords.
export const GRASP_A = (() => {
  const s = Math.sin(GRASP.angle), c = Math.cos(GRASP.angle);
  return [0, -s, c,  0, -c, -s,  1, 0, 0];
})();
// Card point (card coords) -> world, given the forward kinematics.
export function cardToWorld(fk, pc) {
  const Rc = mul3(fk.tcp.R, transpose3(GRASP_A));
  const d = apply3(Rc, [pc[0] - GRASP.pinch[0], pc[1] - GRASP.pinch[1], pc[2] - GRASP.pinch[2]]);
  return [fk.tcp.p[0] + d[0], fk.tcp.p[1] + d[1], fk.tcp.p[2] + d[2]];
}

// Tool target from a desired CARD orientation: upright and facing the
// viewer at zero, turned by yaw (about vertical), pitch, roll.
export function targetFrame(p, yaw = 0, pitch = 0, roll = 0) {
  let Rc = rotFromAxisAngle([0, 1, 0], yaw);
  Rc = mul3(rotFromAxisAngle([1, 0, 0], pitch), Rc);
  Rc = mul3(rotFromAxisAngle([0, 0, 1], roll), Rc);
  return {p, R: mul3(Rc, GRASP_A)};
}

// ---------- behaviour space ----------
// HOME is the pinch point (= TCP). The arm presents the card a little left
// of its base, turned slightly toward the text. Offsets from HOME are bounded
// by WORKSPACE; the scene chooses offsets (idle breathing, hover, greeting)
// and the joint chain reaches them through IK.
export const HOME = {p: [0.28, 1.86, 0.3], yaw: 0.2};
// z: the card rests set back (-0.8) and comes forward on hover (+0.55).
export const WORKSPACE = {x: [-0.08, 0.08], y: [-0.06, 0.08], z: [-0.8, 0.55], yaw: [-0.35, 0.35], pitch: [-0.15, 0.15]};
const cl = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
// offsets: [dx, dy, dz, dyaw, dpitch]
export function goalFrame(o) {
  const W = WORKSPACE;
  return targetFrame([HOME.p[0] + cl(o[0], W.x), HOME.p[1] + cl(o[1], W.y), HOME.p[2] + cl(o[2], W.z)],
    HOME.yaw + cl(o[3], W.yaw), cl(o[4], W.pitch), 0);
}
export const WORKSPACE_CORNERS = (() => {
  const W = WORKSPACE, out = [];
  for (const x of W.x) for (const y of W.y) for (const z of W.z) for (const yaw of [W.yaw[0], 0, -HOME.yaw, W.yaw[1]]) for (const pitch of W.pitch) out.push([x, y, z, yaw, pitch]);
  return out;
})();

// Preferred posture, as in the reference illustration: one continuous arc.
// Upper arm leaning toward the card, forearm leaning further and climbing,
// wrist at the top hooking down into the pinch.
export const REST_GUESS = [0.1, 0.23, 0, 0.66, 0, 1.64, -1.6];
