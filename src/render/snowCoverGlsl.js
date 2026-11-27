// @ts-check
// Ground snow chunk for both terrain programs, after the ecotone border. Fragments read the snowline lattice with
// the same bilinear as weather/snowCoverHost.js lineAt. The snowCoverAt function below repeats the shader cover
// on the CPU for grass and feet, so the GPU and CPU paths must change together.

// No slope term: a steep face keeps the snow its height lays, as Daggerfall Unity's winter set dresses every tile.
export const SNOW_GROUND = Object.freeze({
  patch: Object.freeze([Object.freeze({ cell: 1, weight: 0.35 }), Object.freeze({ cell: 4, weight: 0.4 }), Object.freeze({ cell: 16, weight: 0.25 })]),
  edge: 0.07,
  salt: 0x534e4f57,
  fade: Object.freeze([2, 2]),
});
export const TWIN_LAYERS = 56;
export const SNOW_LINES_UNIT = 23;
export const SNOW_TILE_M = 6.4;
const TILE_M = SNOW_TILE_M;
// Must match world/ecotone.js ecoOrigin: a pixel's first tile north is (SNOW_TILE_ROW0 - py) * 128.
export const SNOW_TILE_ROW0 = 512;

const f = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

// Reads the draw's first world tile from uEcoOrigin, which must be declared before this chunk.
export function snowCoreGlsl() {
  const e = SNOW_GROUND.edge, P = SNOW_GROUND.patch;
  return `// PRECIP4 (render/snowCoverGlsl.js; the law is systems/weather/snowpack.js)
uniform highp sampler2D uSnowLines;   // the window's lattice of snowlines: texel (i, j) the point i east and j south of its first, rgb h10/h50/h90 (m above the sea)
uniform vec4 uSnowSet;                // x: world y -> metres above the sea; y: 1 on; z: the lattice's spacing (world tiles)
uniform highp ivec3 uSnowWin;         // the window's first point's world tile (x east, z north - the ecotone's frame), its side (points)
uniform highp ivec4 uSnowArr;         // the bound arrays' winter halves: x the draw's own (uTileArr), y-w uEcoArr1-3 (0 none)
float snowHash(highp ivec2 c, highp uint salt) {
  highp uint h = (uint(c.x) * 0x8da6b343u) ^ (uint(c.y) * 0xd8163841u) ^ (salt * 0xcb1ab31fu);
  h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u;
  return float(h >> 8u) * (1.0 / 16777216.0);
}
float snowNoise(vec2 lt, highp int cell, highp uint salt) {
  vec2 q = lt / float(cell);
  vec2 fl = floor(q);
  highp ivec2 i = uEcoOrigin.xy / cell + ivec2(fl);
  vec2 fr = q - fl;
  vec2 u = fr * fr * (3.0 - 2.0 * fr);
  float a = snowHash(i, salt), b = snowHash(i + ivec2(1, 0), salt), c = snowHash(i + ivec2(0, 1), salt), d = snowHash(i + ivec2(1, 1), salt);
  float top = a + (b - a) * u.x, bot = c + (d - c) * u.x;
  return top + (bot - top) * u.y;
}
// snowpack.js coverAtHeight: piecewise linear through (h10, 0.1), (h50, 0.5), (h90, 0.9), out to 0 and 1 a quarter span on
float snowAtHeight(vec3 line, float h) {
  float lo = max(1.0, line.y - line.x), hi = max(1.0, line.z - line.y);
  if (h <= line.x) return max(0.0, 0.1 + 0.1 * (h - line.x) / (0.25 * lo));
  if (h <= line.y) return 0.1 + 0.4 * (h - line.x) / lo;
  if (h <= line.z) return 0.5 + 0.4 * (h - line.y) / hi;
  return min(1.0, 0.9 + 0.1 * (h - line.z) / (0.25 * hi));
}
vec3 snowLineAt(highp ivec2 p) {
  highp int s = uSnowWin.z - 1;
  return texelFetch(uSnowLines, clamp(p, ivec2(0), ivec2(s)), 0).rgb;
}
// the snowline at a pixel-local point: the lattice's bilinear between the four points about it (snowCoverHost.js lineAt)
vec3 snowLine(vec2 local) {
  vec2 rel = vec2(uEcoOrigin.xy - uSnowWin.xy) + local / ${f(TILE_M)};   // world tiles from the window's first point, x east, z north
  vec2 q = vec2(rel.x, -rel.y) / uSnowSet.z;
  vec2 fl = floor(q);
  highp ivec2 i = ivec2(fl);
  vec2 u = q - fl;
  vec3 a = snowLineAt(i), b = snowLineAt(i + ivec2(1, 0)), c = snowLineAt(i + ivec2(0, 1)), d = snowLineAt(i + ivec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float snowCover(vec2 local, float y, vec2 gx, vec2 gy) {
  if (uSnowSet.y < 0.5) return 0.0;   // off the lane: one uniform test
  float c = snowAtHeight(snowLine(local), y + uSnowSet.x);   // SNOW-FACE: a steep face keeps it (SNOW_GROUND)
  if (c <= 0.0 || c >= 1.0) return c;
  vec2 lt = local / ${f(TILE_M)};
  // AUDIT PRECIP GROUND-8: the patches band-limited by the fragment's footprint (gx, gy: tiles a screen pixel - the
  // tile's own gradient, GRAIN1's) - an octave whose cell the footprint reaches is its mean, and what the patches no
  // longer resolve is their mean, the share itself: the distant snowline stands still as the eye moves
  float fw = max(length(gx), length(gy)), p = 0.0, keep = 0.0;
${P.map((o, k) => `  { float a = clamp(${f(SNOW_GROUND.fade[0])} - ${f(SNOW_GROUND.fade[1])} * fw / ${f(o.cell)}, 0.0, 1.0); p += ${f(o.weight)} * mix(0.5, snowNoise(lt, ${o.cell}, ${SNOW_GROUND.salt + k}u), a); keep += ${f(o.weight)} * a; }`).join('\n')}
  if (keep <= 0.0) return c;
  p = clamp((p - 0.5) * 2.2 + 0.5, 0.0, 1.0);   // the sum's middle widened, so a half cover is half the ground
  return mix(c, smoothstep(${f(-e)}, ${f(e)}, ${f(-e)} + ${f(1 + 2 * e)} * c - p), keep);
}
// AUDIT PRECIP GROUND-9: the share of the ground a snow lying ON it may take (the Snowfall mod's surface,
// render/snowfallGlsl.js): the ground's own cover on the snow lane - never a drift on green grass - and the whole ground
// off it, where DFU's winter dresses every tile and the mod's own gate asks the season
float snowLaid(vec2 local, float y, vec2 gx, vec2 gy) {
  return uSnowSet.y < 0.5 ? 1.0 : snowCover(local, y, gx, gy);
}
`;
}

// Include after ecotoneGlsl, which declares uEcoOrigin.
/** @param {string} decode */
export function snowCoverGlsl(decode = '') {
  return `${snowCoreGlsl()}
vec3 snowGround(vec3 bare, vec4 ew, float c, vec3 tl, vec2 gx, vec2 gy) {
  if (c <= 0.0) return bare;
  vec3 white = ${decode}(textureGrad(uTileArr, vec3(tl.xy, tl.z + float(uSnowArr.x)), gx, gy).rgb);
  if (ew.x < 1.0) {
    vec3 cw = white * ew.x;
    if (ew.y > 0.0) cw += ew.y * ${decode}(textureGrad(uEcoArr1, vec3(tl.xy, tl.z + float(uSnowArr.y)), gx, gy).rgb);
    if (ew.z > 0.0) cw += ew.z * ${decode}(textureGrad(uEcoArr2, vec3(tl.xy, tl.z + float(uSnowArr.z)), gx, gy).rgb);
    if (ew.w > 0.0) cw += ew.w * ${decode}(textureGrad(uEcoArr3, vec3(tl.xy, tl.z + float(uSnowArr.w)), gx, gy).rgb);
    white = cw;
  }
  return mix(bare, white, c);
}
`;
}

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function snowHash(cx, cy, salt) {
  let h = (Math.imul(cx, 0x8da6b343) ^ Math.imul(cy, 0xd8163841) ^ Math.imul(salt >>> 0, 0xcb1ab31f)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0; h ^= h >>> 16;
  return (h >>> 8) * (1 / 16777216);
}
function snowNoise(ltx, ltz, ox, oz, cell, salt) {
  const qx = ltx / cell, qz = ltz / cell, flx = Math.floor(qx), flz = Math.floor(qz);
  const ix = Math.trunc(ox / cell) + flx, iz = Math.trunc(oz / cell) + flz;
  const fx = qx - flx, fz = qz - flz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = snowHash(ix, iz, salt), b = snowHash(ix + 1, iz, salt), c = snowHash(ix, iz + 1, salt), d = snowHash(ix + 1, iz + 1, salt);
  const top = a + (b - a) * ux, bot = c + (d - c) * ux;
  return top + (bot - top) * uz;
}
// Matches snowCover in the shader term for term below one cell of footprint; keep the two in sync.
export function snowCoverAt(cover, lx, lz, ox, oz) {
  const e = SNOW_GROUND.edge, c = cover;
  if (c <= 0 || c >= 1) return Math.max(0, Math.min(1, c));
  const ltx = lx / TILE_M, ltz = lz / TILE_M;
  let p = 0;
  SNOW_GROUND.patch.forEach((o, k) => { p += o.weight * snowNoise(ltx, ltz, ox, oz, o.cell, (SNOW_GROUND.salt + k) >>> 0); });
  p = Math.min(1, Math.max(0, (p - 0.5) * 2.2 + 0.5));
  return smooth(-e, e, -e + (1 + 2 * e) * c - p);
}
