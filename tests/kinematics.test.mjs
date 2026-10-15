import test from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../kinematics.js';
import {ChainPendant, separate} from '../physics.js';
import * as S from '../sdf.js';

const dist = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const home = () => K.solveIK(K.REST_GUESS, K.goalFrame([0, 0, 0, 0, 0]), {rest: K.REST_GUESS, iterations: 400, nullGain: 0.02});
const GRID = [[0, 0, 0, 0, 0], ...K.WORKSPACE_CORNERS];

test('links are rigid: joint-to-joint distances never change', () => {
  const ref = K.forward(new Array(7).fill(0)).frames.map(f => f.p);
  const lens = ref.slice(1).map((p, i) => dist(p, ref[i]));
  for (let n = 0; n < 200; n++) {
    const q = K.JOINTS.map(j => j.limit[0] + Math.random() * (j.limit[1] - j.limit[0]));
    const P = K.forward(q).frames.map(f => f.p);
    P.slice(1).forEach((p, i) => assert.ok(Math.abs(dist(p, P[i]) - lens[i]) < 1e-9));
  }
});

test('analytic Jacobian matches finite differences', () => {
  const q = home(), J = K.jacobian(K.forward(q)), h = 1e-6;
  for (let k = 0; k < 7; k++) {
    const qp = [...q]; qp[k] += h;
    const a = K.forward(q).tcp.p, b = K.forward(qp).tcp.p;
    for (let r = 0; r < 3; r++) assert.ok(Math.abs((b[r] - a[r]) / h - J[r][k]) < 1e-4);
  }
});

test('every behaviour goal is reached by the joint chain, within joint limits', () => {
  const rest = home();
  for (const o of GRID) {
    const T = K.goalFrame(o), [u, v, pr] = o;
    const q = K.solveIK(rest, T, {rest, iterations: 80});
    const e = K.poseError(K.forward(q), T);
    assert.ok(e.pos < 1e-3, `position error ${e.pos} at ${u},${v},${pr}`);
    assert.ok(e.rot < 3e-3, `orientation error ${e.rot} at ${u},${v},${pr}`);
    q.forEach((x, k) => assert.ok(x >= K.JOINTS[k].limit[0] && x <= K.JOINTS[k].limit[1]));
  }
});

test('the posture stays in the same branch (no elbow flips) across the workspace', () => {
  const rest = home();
  for (const o of GRID) {
    const q = K.solveIK(rest, K.goalFrame(o), {rest, iterations: 80});
    q.forEach((x, k) => assert.ok(Math.abs(x - rest[k]) < 1.2, `J${k+1} moved ${x - rest[k]}`));
    assert.ok(q[3] > 0.35, 'elbow keeps bending the same way, away from the straight-arm singularity');
  }
});

test('per-frame motion respects actuator velocity limits and stays continuous', () => {
  let q = home(); const dt = 1 / 120;
  for (let n = 0; n < 600; n++) {             // pointer jumps corner to corner
    const c = Math.floor(n / 150) % 2 ? [.1, .1, .3, .4, .2] : [-.1, -.1, 0, -.4, -.2];
    const T = K.goalFrame(c);
    const next = K.solveIK(q, T, {rest: home(), iterations: 4, dt});
    next.forEach((x, k) => assert.ok(Math.abs(x - q[k]) <= K.JOINTS[k].vmax * dt + 1e-12));
    q = next;
  }
});

test('the held card and its charms never touch the arm or the base', () => {
  const rest = home();
  for (const o of GRID) {
    const [u, v, pr] = o;
    const q = K.solveIK(rest, K.goalFrame(o), {rest, iterations: 80});
    const fk = K.forward(q), F = fk.frames;
    const segs = [
      [K.BASE, add(K.BASE, [0, 0.62, 0]), 0.16],                                                   // pedestal + column
      [F[1].p, add(F[2].p, K.apply3(F[2].R, [0, K.JOINTS[3].offset[1], 0])), 0.13],                // upper arm
      [F[3].p, add(F[4].p, K.apply3(F[4].R, [0, K.JOINTS[5].offset[1], 0])), 0.11],                // forearm
    ];
    // card + charm envelope, in card coordinates (charms hang ~0.45 below)
    for (let x = -K.CARD.w / 2; x <= K.CARD.w / 2; x += 0.03) for (let y = -K.CARD.h / 2 - 0.45; y <= K.CARD.h / 2; y += 0.03) {
      const p = K.cardToWorld(fk, [x, y, 0]);
      for (const [a, b, r] of segs) {
        const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], ap = [p[0]-a[0], p[1]-a[1], p[2]-a[2]];
        const t = Math.max(0, Math.min(1, (ab[0]*ap[0] + ab[1]*ap[1] + ab[2]*ap[2]) / (ab[0]**2 + ab[1]**2 + ab[2]**2)));
        const d = dist(p, [a[0]+ab[0]*t, a[1]+ab[1]*t, a[2]+ab[2]*t]);
        assert.ok(d > r + 0.04, `clearance ${d.toFixed(3)} at ${u},${v},${pr}`);
      }
    }
  }
});

test('charm chains keep their length, swing when the anchor moves, then settle', () => {
  const p = new ChainPendant([0, 0, 0], 0.17, {links: 10});
  let peak = 0;
  for (let i = 0; i < 2400; i++) {
    const a = [i < 60 ? 0.15 * Math.sin(i / 60 * Math.PI) : 0, 0, 0];
    p.step(a, 1 / 120);
    for (let k = 0; k < p.n - 1; k++) assert.ok(Math.abs(dist(p.p[k], p.p[k+1]) - p.seg) < 2e-3);
    peak = Math.max(peak, Math.abs(p.end[0] - a[0]));
  }
  assert.ok(peak > 0.02, 'anchor motion excites a swing');
  assert.ok(Math.abs(p.end[0]) < 2e-3 && Math.abs(p.twist) < 1e-3, 'damped back to rest');
});

test('charms are pushed apart instead of interpenetrating', () => {
  const a = new ChainPendant([0, 0, 0], 0.1, {radius: 0.08}), b = new ChainPendant([0.05, 0, 0], 0.1, {radius: 0.08});
  separate([a, b], [0.05, 0.05]);
  assert.ok(dist(a.end, b.end) >= 0.16 - 1e-9);
});

test('surface-nets mesher produces an outward, accurate surface', () => {
  const m = S.mesh(p => S.sphere(p, [0, 0, 0], 0.5), [-.6, -.6, -.6], [.6, .6, .6], 0.03);
  for (let i = 0; i < m.positions.length; i += 3) assert.ok(Math.abs(Math.hypot(m.positions[i], m.positions[i+1], m.positions[i+2]) - 0.5) < 1e-5);
  for (let i = 0; i < m.indices.length; i += 3) {
    const v = [0, 1, 2].map(j => Array.from(m.positions.slice(m.indices[i+j]*3, m.indices[i+j]*3 + 3)));
    const u = v[1].map((x, k) => x - v[0][k]), w = v[2].map((x, k) => x - v[0][k]);
    const n = [u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]];
    assert.ok(n[0]*v[0][0] + n[1]*v[0][1] + n[2]*v[0][2] > 0);
  }
});

test('the grasp is rigid and right-handed; the pinch point is the TCP', () => {
  const A = K.GRASP_A, det = A[0]*(A[4]*A[8]-A[5]*A[7]) - A[1]*(A[3]*A[8]-A[5]*A[6]) + A[2]*(A[3]*A[7]-A[4]*A[6]);
  assert.ok(Math.abs(det - 1) < 1e-12);
  const fk = K.forward(home());
  assert.ok(dist(K.cardToWorld(fk, K.GRASP.pinch), fk.tcp.p) < 1e-12);
  // finger travel (tool x) is along the card normal: fingers sit on the faces
  const n = K.apply3(K.mul3(fk.tcp.R, K.transpose3(K.GRASP_A)), [0, 0, 1]), x = K.apply3(fk.tcp.R, [1, 0, 0]);
  assert.ok(Math.abs(Math.abs(n[0]*x[0] + n[1]*x[1] + n[2]*x[2]) - 1) < 1e-9);
});
