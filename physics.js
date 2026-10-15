export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Critically-damped-ish spring used to smooth the pointer goal before IK.
export function springStep(position, velocity, target, dt, k = 38, c = 12) {
  for (let i = 0; i < position.length; i++) {
    velocity[i] += (k * (target[i] - position[i]) - c * velocity[i]) * dt;
    position[i] += velocity[i] * dt;
  }
}

// A charm on a short chain. Particle 0 is pinned to the anchor on the frame,
// the intermediate particles are chain links (light), the last one is the
// charm's hang point carrying the charm's mass. Verlet integration + distance
// constraints (position-based dynamics). Motion comes only from the anchor
// being carried by the arm; gravity and damping bring it back to rest.
export class ChainPendant {
  constructor(anchor, length, {links = 4, charmMass = 6, damping = 1.6, radius = 0.08} = {}) {
    this.n = links + 1;
    this.seg = length / links;
    this.radius = radius;
    this.damping = damping;
    this.w = Array.from({length: this.n}, (_, i) => i === 0 ? 0 : (i === this.n - 1 ? 1 / charmMass : 1));
    this.twist = 0; this.twistV = 0;
    this.reset(anchor);
  }
  reset(anchor) {
    this.p = Array.from({length: this.n}, (_, i) => [anchor[0], anchor[1] - i * this.seg, anchor[2]]);
    this.prev = this.p.map(v => [...v]);
    this.twist = 0; this.twistV = 0;
  }
  get end() { return this.p[this.n - 1]; }
  step(anchor, dt) {
    const keep = Math.exp(-this.damping * dt), g = 9.81 * dt * dt;
    const endBefore = [...this.end], endPrev = [...this.prev[this.n - 1]];
    for (let i = 1; i < this.n; i++) {
      const p = this.p[i], q = this.prev[i], old = [...p];
      for (let k = 0; k < 3; k++) p[k] += (p[k] - q[k]) * keep;
      p[1] -= g;
      this.prev[i] = old;
    }
    this.p[0] = [...anchor];
    for (let it = 0; it < 4 * this.n; it++) {
      for (let i = 0; i < this.n - 1; i++) {
        const a = this.p[i], b = this.p[i + 1], wa = this.w[i], wb = this.w[i + 1];
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d) || 1e-9;
        const corr = (len - this.seg) / len / (wa + wb);
        for (let k = 0; k < 3; k++) { a[k] += d[k] * corr * wa; b[k] -= d[k] * corr * wb; }
      }
    }
    // Twist about the hanging axis: a damped torsion spring (the chain resists
    // twisting), excited by the charm's sideways acceleration.
    const v0 = [endBefore[0] - endPrev[0], endBefore[2] - endPrev[2]];
    const v1 = [this.end[0] - endBefore[0], this.end[2] - endBefore[2]];
    const ax = (v1[0] - v0[0]) / (dt * dt), az = (v1[1] - v0[1]) / (dt * dt);
    this.twistV += (-26 * this.twist - 2.6 * this.twistV + 1.1 * ax - 0.6 * az) * dt;
    this.twist = clamp(this.twist + this.twistV * dt, -0.9, 0.9);
    return this.end;
  }
  energy() {
    let e = 0;
    for (let i = 1; i < this.n; i++) e += Math.hypot(...this.p[i].map((v, k) => v - this.prev[i][k]));
    return e + Math.abs(this.twistV) * 1e-3;
  }
}

// Keep charms from passing through each other (sphere proxies at the charm
// centre, which hangs `drop` below the hang point).
export function separate(pendants, drops) {
  for (let i = 0; i < pendants.length; i++) for (let j = i + 1; j < pendants.length; j++) {
    const a = pendants[i].end, b = pendants[j].end;
    const ca = [a[0], a[1] - drops[i], a[2]], cb = [b[0], b[1] - drops[j], b[2]];
    const d = [cb[0] - ca[0], cb[1] - ca[1], cb[2] - ca[2]], len = Math.hypot(...d) || 1e-9;
    const min = pendants[i].radius + pendants[j].radius;
    if (len >= min) continue;
    const push = (min - len) / 2 / len;
    for (const k of [0, 2]) { a[k] -= d[k] * push; b[k] += d[k] * push; }
  }
}
