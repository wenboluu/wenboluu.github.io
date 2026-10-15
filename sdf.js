// Signed-distance modelling + surface-nets meshing.
// Shapes are written as distance functions and blended with smooth unions, so
// cast shells and stuffed toys come out as one continuous surface rather than
// a pile of intersecting primitives. Pure JS (no three.js) so Node can test it.

export const smin = (a, b, k) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a, b, k) => -smin(-a, -b, k);

// Round cone between points a,b with radii ra, rb (Inigo Quilez).
export function roundCone(p, a, b, ra, rb) {
  const bax = b[0]-a[0], bay = b[1]-a[1], baz = b[2]-a[2];
  const l2 = bax*bax + bay*bay + baz*baz, rr = ra - rb, a2 = l2 - rr*rr, il2 = 1 / l2;
  const pax = p[0]-a[0], pay = p[1]-a[1], paz = p[2]-a[2];
  const y = pax*bax + pay*bay + paz*baz, z = y - l2;
  const xx = (pax*l2 - bax*y), xy = (pay*l2 - bay*y), xz = (paz*l2 - baz*y);
  const x2 = xx*xx + xy*xy + xz*xz, y2 = y*y*l2, z2 = z*z*l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
}
export const sphere = (p, c, r) => Math.hypot(p[0]-c[0], p[1]-c[1], p[2]-c[2]) - r;
export function ellipsoid(p, c, r) {     // approximate, good near surface
  const x = (p[0]-c[0])/r[0], y = (p[1]-c[1])/r[1], z = (p[2]-c[2])/r[2];
  const k0 = Math.hypot(x, y, z), k1 = Math.hypot(x/r[0], y/r[1], z/r[2]);
  return k0 < 1e-9 ? -Math.min(...r) : k0 * (k0 - 1) / k1;
}
// Cylinder along z, centred at c, radius r, half-length h, edge fillet f.
export function cylZ(p, c, r, h, f = 0) {
  const dx = Math.hypot(p[0]-c[0], p[1]-c[1]) - (r - f), dz = Math.abs(p[2]-c[2]) - (h - f);
  return Math.min(Math.max(dx, dz), 0) + Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) - f;
}
// Cylinder along y.
export function cylY(p, c, r, h, f = 0) {
  const dx = Math.hypot(p[0]-c[0], p[2]-c[2]) - (r - f), dy = Math.abs(p[1]-c[1]) - (h - f);
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - f;
}
export function box(p, c, s, f = 0) {
  const q = [Math.abs(p[0]-c[0]) - s[0] + f, Math.abs(p[1]-c[1]) - s[1] + f, Math.abs(p[2]-c[2]) - s[2] + f];
  return Math.hypot(Math.max(q[0],0), Math.max(q[1],0), Math.max(q[2],0)) + Math.min(Math.max(q[0], q[1], q[2]), 0) - f;
}
// Capsule through a list of points with per-point radii (a soft tube).
export function tube(p, pts, radii, k = 0) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = smin(d, roundCone(p, pts[i], pts[i+1], radii[i], radii[i+1]), k);
  return d;
}

// Surface nets over an axis-aligned box. Returns {positions, normals, indices}
// plus an optional per-vertex attribute computed by `shade(p, n)` (e.g. colour).
export function mesh(sdf, min, max, h, {shade = null, project = 2} = {}) {
  const nx = Math.ceil((max[0]-min[0]) / h) + 1, ny = Math.ceil((max[1]-min[1]) / h) + 1, nz = Math.ceil((max[2]-min[2]) / h) + 1;
  const field = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const P = [0, 0, 0], B = 6, reach = B * h * 0.87 * 1.35 + h;
  // Evaluate in blocks; a block whose centre is far from the surface cannot
  // contain a sign change, so it is filled with the centre value (sign only).
  for (let bk = 0; bk < nz; bk += B) for (let bj = 0; bj < ny; bj += B) for (let bi = 0; bi < nx; bi += B) {
    const ek = Math.min(bk + B, nz - 1), ej = Math.min(bj + B, ny - 1), ei = Math.min(bi + B, nx - 1);
    P[0] = min[0] + (bi + ei) / 2 * h; P[1] = min[1] + (bj + ej) / 2 * h; P[2] = min[2] + (bk + ek) / 2 * h;
    const dc = sdf(P), far = Math.abs(dc) > reach;
    for (let k = bk; k <= ek; k++) for (let j = bj; j <= ej; j++) for (let i = bi; i <= ei; i++) {
      if (far) { field[idx(i, j, k)] = dc; continue; }
      P[0] = min[0] + i*h; P[1] = min[1] + j*h; P[2] = min[2] + k*h;
      field[idx(i, j, k)] = sdf(P);
    }
  }
  const cellVert = new Int32Array((nx-1) * (ny-1) * (nz-1)).fill(-1);
  const cidx = (i, j, k) => i + (nx-1) * (j + (ny-1) * k);
  const positions = [], normals = [], extra = [], indices = [];
  const grad = (p) => {
    const e = h * 0.25;
    const g = [
      sdf([p[0]+e, p[1], p[2]]) - sdf([p[0]-e, p[1], p[2]]),
      sdf([p[0], p[1]+e, p[2]]) - sdf([p[0], p[1]-e, p[2]]),
      sdf([p[0], p[1], p[2]+e]) - sdf([p[0], p[1], p[2]-e])];
    const n = Math.hypot(...g) || 1; return g.map(v => v / n);
  };
  const corners = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz-1; k++) for (let j = 0; j < ny-1; j++) for (let i = 0; i < nx-1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { v[c] = field[idx(i+corners[c][0], j+corners[c][1], k+corners[c][2])]; if (v[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += corners[a][0] + t * (corners[b][0] - corners[a][0]);
      sy += corners[a][1] + t * (corners[b][1] - corners[a][1]);
      sz += corners[a][2] + t * (corners[b][2] - corners[a][2]);
      n++;
    }
    let p = [min[0] + (i + sx/n) * h, min[1] + (j + sy/n) * h, min[2] + (k + sz/n) * h];
    let g = grad(p);
    for (let s = 0; s < project; s++) {      // pull the vertex onto the true surface
      const d = sdf(p); p = [p[0] - g[0]*d, p[1] - g[1]*d, p[2] - g[2]*d]; g = grad(p);
    }
    cellVert[cidx(i, j, k)] = positions.length / 3;
    positions.push(...p); normals.push(...g);
    if (shade) extra.push(...shade(p, g));
  }
  // quads across every sign-changing grid edge
  for (let k = 1; k < nz-1; k++) for (let j = 1; j < ny-1; j++) for (let i = 1; i < nx-1; i++) {
    const a = field[idx(i, j, k)];
    const tryEdge = (b, c0, c1, c2, c3) => {
      if ((a < 0) === (b < 0)) return;
      const q = [cellVert[c0], cellVert[c1], cellVert[c2], cellVert[c3]];
      if (q.some(x => x < 0)) return;
      if (a < 0) indices.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      else indices.push(q[0], q[2], q[1], q[0], q[3], q[2]);
    };
    if (i < nx-1) tryEdge(field[idx(i+1, j, k)], cidx(i, j-1, k-1), cidx(i, j, k-1), cidx(i, j, k), cidx(i, j-1, k));
    if (j < ny-1) tryEdge(field[idx(i, j+1, k)], cidx(i-1, j, k-1), cidx(i-1, j, k), cidx(i, j, k), cidx(i, j, k-1));
    if (k < nz-1) tryEdge(field[idx(i, j, k+1)], cidx(i-1, j-1, k), cidx(i, j-1, k), cidx(i, j, k), cidx(i-1, j, k));
  }
  return {positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices), extra: shade ? new Float32Array(extra) : null};
}
