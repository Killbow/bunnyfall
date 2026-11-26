// @ts-check
// GLSL twin of world/ecotone.js for both terrain programs: the same hash, lattices, and ECOTONE constants.
import { ECOTONE, ECOTONE_REACH } from '../world/ecotone.js';

// Free in every terrain program: unit 0 holds the pixel's set, 2 its tilemap, and 8 to 15 belong to other passes.
export const ECO_UNITS = Object.freeze([3, 4, 5]);

const f = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

/** @param {string} decode */
export function ecotoneGlsl(decode = '') {
  const [w0, w1] = ECOTONE.warp, [p0, p1] = ECOTONE.patch, e = ECOTONE.edge;
  return `// ECOTONE1 (render/ecotoneGlsl.js; the law is world/ecotone.js)
uniform sampler2DArray uEcoArr1;
uniform sampler2DArray uEcoArr2;
uniform sampler2DArray uEcoArr3;
uniform highp ivec4 uEcoSide;     // the W, E, S, N neighbours' sets: 0 the pixel's own, 1-3 uEcoArr1-3
uniform highp ivec4 uEcoCorner;   // the SW, SE, NW, NE neighbours'
uniform highp ivec3 uEcoOrigin;   // the pixel's first world tile (x east, z north of row ${ECOTONE.row0}); z 1 when a neighbour's set differs
// HIGHP, every integer here: a fragment stage's ints and uints are mediump unless they say, and a phone's mediump int is
// sixteen bits - a world tile runs to 128,000 and the hash wraps at 2^32
float ecoHash(highp ivec2 c, highp uint salt) {
  highp uint h = (uint(c.x) * 0x8da6b343u) ^ (uint(c.y) * 0xd8163841u) ^ (salt * 0xcb1ab31fu);
  h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u;
  return float(h >> 8u) * (1.0 / 16777216.0);
}
float ecoNoise(vec2 lt, highp int cell, highp uint salt) {
  vec2 q = lt / float(cell);
  vec2 fl = floor(q);
  highp ivec2 i = uEcoOrigin.xy / cell + ivec2(fl);
  vec2 fr = q - fl;
  vec2 u = fr * fr * (3.0 - 2.0 * fr);
  float a = ecoHash(i, salt), b = ecoHash(i + ivec2(1, 0), salt), c = ecoHash(i + ivec2(0, 1), salt), d = ecoHash(i + ivec2(1, 1), salt);
  float top = a + (b - a) * u.x, bot = c + (d - c) * u.x;
  return top + (bot - top) * u.y;
}
float ecoShare(float u, vec2 lt, highp uint salt) {
  float d = u + ${f(w0.amp)} * (2.0 * ecoNoise(lt, ${w0.cell}, salt) - 1.0) + ${f(w1.amp)} * (2.0 * ecoNoise(lt, ${w1.cell}, salt + 1u) - 1.0);
  float p = clamp(0.5 + d / ${f(2 * ECOTONE.band)}, 0.0, 1.0);
  float n0 = ${f(p0.weight)} * ecoNoise(lt, ${p0.cell}, salt + 2u) + ${f(p1.weight)} * ecoNoise(lt, ${p1.cell}, salt + 3u);
  float n = clamp((n0 - 0.5) * ${f(ECOTONE.stretch)} + 0.5, 0.0, 1.0);
  return smoothstep(${f(-e)}, ${f(e)}, ${f(-e)} + ${f(1 + 2 * e)} * p - n);
}
void ecoAdd(inout vec4 w, int slot, float v) {
  if (slot == 1) w.y += v; else if (slot == 2) w.z += v; else if (slot == 3) w.w += v; else w.x += v;
}
// the shares of the pixel's own set and of uEcoArr1-3 at a fragment (x own; summing to 1) - PRECIP4's winter texel
// (render/snowCoverGlsl.js) crosses the border by the same weights
vec4 ecoWeights(vec2 local) {
  if (uEcoOrigin.z == 0) return vec4(1.0, 0.0, 0.0, 0.0);   // every neighbour wears the pixel's own set
  float sx = local.x < 409.6 ? -1.0 : 1.0, sz = local.y < 409.6 ? -1.0 : 1.0;
  float ux = sx < 0.0 ? local.x : local.x - 819.2, uz = sz < 0.0 ? local.y : local.y - 819.2;
  // the three neighbours of the nearer corner, and which of the two seams can move a weight (world/ecotone.js
  // ecotoneOwner's rule: a seam with the pixel's own set across it and one set along the far row moves none)
  int nx = sx < 0.0 ? uEcoSide.x : uEcoSide.y, nz = sz < 0.0 ? uEcoSide.z : uEcoSide.w;
  int nd = sz < 0.0 ? (sx < 0.0 ? uEcoCorner.x : uEcoCorner.y) : (sx < 0.0 ? uEcoCorner.z : uEcoCorner.w);
  float ox = 1.0, oz = 1.0;
  vec2 lt = local / 6.4;
  if (abs(ux) < ${f(ECOTONE_REACH)} && !(nx == 0 && nd == nz)) { float s = ecoShare(ux, lt, ${ECOTONE.saltX}u); ox = sx < 0.0 ? s : 1.0 - s; }
  if (abs(uz) < ${f(ECOTONE_REACH)} && !(nz == 0 && nd == nx)) { float s = ecoShare(uz, lt, ${ECOTONE.saltZ}u); oz = sz < 0.0 ? s : 1.0 - s; }
  vec4 w = vec4(ox * oz, 0.0, 0.0, 0.0);
  if (ox * oz >= 1.0) return w;
  ecoAdd(w, nx, (1.0 - ox) * oz);
  ecoAdd(w, nz, ox * (1.0 - oz));
  ecoAdd(w, nd, (1.0 - ox) * (1.0 - oz));
  return w;
}
vec3 ecotone(vec3 own, vec4 w, vec3 tl, vec2 gx, vec2 gy) {
  if (w.x >= 1.0) return own;
  vec3 c = own * w.x;
  if (w.y > 0.0) c += w.y * ${decode}(textureGrad(uEcoArr1, tl, gx, gy).rgb);
  if (w.z > 0.0) c += w.z * ${decode}(textureGrad(uEcoArr2, tl, gx, gy).rgb);
  if (w.w > 0.0) c += w.w * ${decode}(textureGrad(uEcoArr3, tl, gx, gy).rgb);
  return c;
}
`;
}
