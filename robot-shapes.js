// Arm shell shapes as signed-distance functions (pure JS, no three.js), so
// they can be meshed in a Web Worker (arm-worker.js) as well as on the page.
import {JOINTS} from './kinematics.js';
import * as S from './sdf.js';

// Shell dimensions. A pitch knuckle is two coaxial drums: the parent's drum
// (centred on the parent's centreline) and the child's drum beside it, offset
// by KNUCKLE along the shared axis. Roll joints are a flat seam across a tube
// whose radius is identical on both sides, so rotation never changes the
// silhouette. All shells share one satin aluminium material.
export const D = {
  J2: {r: 0.166, w: 0.124},  // drum radius, half width
  J4: {r: 0.142, w: 0.110},
  J6: {r: 0.114, w: 0.092},
};
export const R = {base: 0.225, col: 0.142, up0: 0.122, up1: 0.112, fo0: 0.103, fo1: 0.090, wr: 0.082};
const SEAM = 0.006;          // gap at roll joints (LED or groove sits inside)

const cutBelow = (d, p, y, f = 0.012) => S.smax(d, y - p[1], f);   // keep p.y >= y
const cutAbove = (d, p, y, f = 0.012) => S.smax(d, p[1] - y, f);   // keep p.y <= y
const along = (y0, y1, t) => y0 + (y1 - y0) * t;

// Radius of the upper arm / forearm tubes at height y (smooth waist).
export const upperR = y => { const t = y / 1.25; return along(R.up0, R.up1, t) - 0.012 * Math.sin(Math.PI * t); };
export const foreR = y => { const t = y / 1.0; return along(R.fo0, R.fo1, t) - 0.006 * Math.sin(Math.PI * t); };
export const J3Y = JOINTS[2].offset[1], J5Y = JOINTS[4].offset[1];

export const SHAPES = [
  { // L0 pedestal (fixed to the floor)
    bounds: [[-.26, 0, -.26], [.26, .17, .26]],
    sdf: p => {
      let d = S.roundCone(p, [0, -0.02, 0], [0, 0.16, 0], R.base, R.col + 0.012);
      d = S.smin(d, S.cylY(p, [0, 0.012, 0], R.base + 0.012, 0.012, 0.006), 0.02);
      return cutAbove(cutBelow(d, p, 0, 0.004), p, JOINTS[0].offset[1] - SEAM / 2, 0.01);
    }},
  { // L1 column + parent drum of J2
    bounds: [[-.22, -.01, -.17], [.22, .66, .17]],
    sdf: p => {
      const top = JOINTS[1].offset[1];
      let d = S.roundCone(p, [0, 0, 0], [0, top, 0], R.col + 0.012, R.col - 0.004);
      d = S.smin(d, S.cylZ(p, [0, top, 0], D.J2.r, D.J2.w, 0.03), 0.09);
      return cutBelow(d, p, SEAM / 2, 0.01);
    }},
  { // L2 child drum of J2 + upper arm up to the J3 roll seam
    bounds: [[-.2, -.2, -.15], [.2, .64, .15]],
    sdf: p => {
      let d = S.cylZ(p, [0, 0, 0], D.J2.r, D.J2.w, 0.03);
      const r = upperR(Math.max(0, p[1]));
      d = S.smin(d, S.cylY(p, [0, J3Y / 2, 0], r, J3Y / 2 + 0.05, 0), 0.10);
      return cutAbove(d, p, J3Y - SEAM / 2, 0.008);
    }},
  { // L3 upper arm after J3 + parent drum of J4
    bounds: [[-.18, -.01, -.14], [.18, 1.17, .14]],
    sdf: p => {
      const L = JOINTS[3].offset[1], y = p[1] + J3Y, r = upperR(Math.min(1.25, y));
      let d = S.cylY(p, [0, L / 2 - 0.05, 0], r, L / 2 + 0.05, 0);
      d = cutAbove(d, p, L - 0.02, 0.02);
      d = S.smin(d, S.cylZ(p, [0, L, 0], D.J4.r, D.J4.w, 0.028), 0.09);
      return cutBelow(d, p, SEAM / 2, 0.008);
    }},
  { // L4 child drum of J4 + forearm to J5
    bounds: [[-.17, -.17, -.13], [.17, .5, .13]],
    sdf: p => {
      let d = S.cylZ(p, [0, 0, 0], D.J4.r, D.J4.w, 0.028);
      d = S.smin(d, S.cylY(p, [0, J5Y / 2, 0], foreR(Math.max(0, p[1])), J5Y / 2 + 0.05, 0), 0.09);
      return cutAbove(d, p, J5Y - SEAM / 2, 0.008);
    }},
  { // L5 forearm after J5 + parent drum of J6
    bounds: [[-.14, -.01, -.11], [.14, .84, .11]],
    sdf: p => {
      const L = JOINTS[5].offset[1], y = p[1] + J5Y, r = foreR(Math.min(1.0, y));
      let d = S.cylY(p, [0, L / 2 - 0.04, 0], r, L / 2 + 0.04, 0);
      d = cutAbove(d, p, L - 0.02, 0.02);
      d = S.smin(d, S.cylZ(p, [0, L, 0], D.J6.r, D.J6.w, 0.024), 0.08);
      return cutBelow(d, p, SEAM / 2, 0.008);
    }},
  { // L6 child drum of J6 + short wrist to J7
    bounds: [[-.13, -.13, -.11], [.13, .2, .11]],
    sdf: p => {
      let d = S.cylZ(p, [0, 0, 0], D.J6.r, D.J6.w, 0.024);
      d = S.smin(d, S.cylY(p, [0, 0.09, 0], R.wr, 0.09, 0), 0.07);
      return cutAbove(d, p, JOINTS[6].offset[1] - SEAM / 2, 0.006);
    }},
  { // L7 flange + parallel gripper housing (fingers are separate bodies)
    bounds: [[-.14, -.01, -.09], [.14, .2, .09]],
    sdf: p => {
      let d = S.cylY(p, [0, 0.03, 0], R.wr, 0.03, 0.006);
      d = S.smin(d, S.roundCone(p, [0, 0.05, 0], [0, 0.095, 0], R.wr, 0.062), 0.02);
      d = S.smin(d, S.box(p, [0, 0.135, 0], [0.105, 0.035, 0.05], 0.028), 0.05);
      return cutBelow(d, p, SEAM / 2, 0.006);
    }},
];


// Gripper finger (one of two, mirrored by placement).
export const FINGER = {
  bounds: [[-.03, -.13, -.05], [.03, .04, .05]], h: 0.004,
  sdf: p => S.smin(S.box(p, [0, -0.07, 0], [0.016, 0.05, 0.034], 0.012), S.box(p, [0, 0.0, 0], [0.012, 0.03, 0.03], 0.01), 0.02),
};
export const ARM_RESOLUTION = 0.0075;
