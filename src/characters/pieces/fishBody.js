// A fish body: it tapers to a tail and has fins instead of limbs.

import { HSCALE, quadder } from './pieceLoft.js';

export const SCALE_RAMP = [
  [46, 60, 54],
  [70, 92, 82],
  [98, 124, 110],
  [128, 154, 138],
  [158, 182, 166],
  [188, 208, 194],
];

/**
 * @param {number[][]} ramp
 * @param {object} s
 */
export function buildFishBody(ramp = SCALE_RAMP, s = {}) {
  const { len = 0.9, girth = 0.14, at = 0.5, from = 0, fin = 0.16, dorsal = 0.1, jaw = 0 } = s;

  const faces = [];
  const quad = quadder(faces, ramp);
  const y = at * HSCALE;
  const z0 = from;

  const RINGS = 6;
  const ringAt = (i) => {
    const t = i / RINGS;
    const w = girth * (0.45 + Math.sin((0.2 + t * 0.8) * Math.PI) * 0.75) * (1 - t * 0.72);
    return { z: z0 - len * t, w };
  };
  for (let i = 0; i < RINGS; i++) {
    const a = ringAt(i);
    const b = ringAt(i + 1);
    const shade = 0.92 - (i / RINGS) * 0.3;
    quad([0, y + a.w, a.z], [a.w, y, a.z], [b.w, y, b.z], [0, y + b.w, b.z], shade);
    quad([-a.w, y, a.z], [0, y + a.w, a.z], [0, y + b.w, b.z], [-b.w, y, b.z], shade * 0.82);
    quad([a.w, y, a.z], [0, y - a.w, a.z], [0, y - b.w, b.z], [b.w, y, b.z], shade * 0.5);
    quad([0, y - a.w, a.z], [-a.w, y, a.z], [-b.w, y, b.z], [0, y - b.w, b.z], shade * 0.44);
  }

  const tz = z0 - len;
  for (const up of [1, -1]) {
    quad(
      [0, y, tz],
      [0, y + up * fin, tz - fin * 1.1],
      [0, y + up * fin * 0.25, tz - fin * 1.5],
      [0, y, tz],
      up > 0 ? 0.9 : 0.6,
    );
  }

  if (dorsal > 0) {
    const dz = z0 - len * 0.3;
    quad(
      [0, y + girth * 0.5, dz + len * 0.16],
      [0, y + girth * 0.5 + dorsal, dz],
      [0, y + girth * 0.5, dz - len * 0.2],
      [0, y + girth * 0.5, dz + len * 0.16],
      0.86,
    );
  }

  if (jaw > 0) {
    const jw = girth * 0.5 * jaw;
    quad(
      [0, y + jw * 0.2, z0],
      [jw, y - jw * 0.6, z0 + jw * 1.6],
      [-jw, y - jw * 0.6, z0 + jw * 1.6],
      [0, y + jw * 0.2, z0],
      1,
    );
    quad(
      [0, y - jw * 0.4, z0],
      [-jw, y - jw * 1.1, z0 + jw * 1.3],
      [jw, y - jw * 1.1, z0 + jw * 1.3],
      [0, y - jw * 0.4, z0],
      0.42,
    );
  }

  return faces;
}
