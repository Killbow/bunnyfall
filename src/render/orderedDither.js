// @ts-check

export const BAYER_GLSL = `
// Bayer 4x4, the ordered dither a 256-colour gradient used.
// LA-COST4 (2026-09-27, Mac: "performance improvements"): THE MATRIX BY ITS BITS, NOT BY A TABLE. This built a
// sixteen-float local array in every fragment that dithers - the lane's five programs, the resolve, the AO's
// rotation, the glow's jitter, the skies' band - to read one element of it. A 4x4 Bayer matrix IS a bit interleave:
// with z = x ^ y its value's four bits, high to low, are z's low bit, y's low bit, z's high bit, y's high bit. The same
// sixteen numbers the table held (0 8 2 10 / 12 4 14 6 / 3 11 1 9 / 15 7 13 5), which test/render/la_cost.test.js checks cell
// by cell by running this very text.
float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int z = x ^ y;
  return float(((z & 1) << 3) | ((y & 1) << 2) | (z & 2) | ((y >> 1) & 1)) / 16.0;
}
`;

// A cut of 0, the uniform's default, draws everything. Needs BAYER_GLSL above it.
export const DISSOLVE_GLSL = `
uniform float uDissolveCut;
void dissolveCut() {
  if (uDissolveCut > 0.0 && bayer4(gl_FragCoord.xy) + 0.03125 >= 1.0 - uDissolveCut) discard;
}
`;

export const DITHER_GLSL = `
// A world-fixed cell: rings of constant elevation, each one stepRad tall,
// each holding as many cells as fit at one stepRad wide. No faces, so no
// edge; the ring count falls toward the pole, so no pinwheel either.
// cellOut is CONTINUOUS: floor() is the cell's id and fract() is where
// the fragment sits inside it.
// (The parameter is stepRad, not step: \`step\` is a GLSL built-in and
// shadowing it is a compile risk nothing here can test.)
vec3 ringSnap(vec3 dir, float stepRad, out vec2 cellOut) {
  float el = asin(clamp(dir.y, -1.0, 1.0));
  // The ring count is ROUNDED, never truncated. PI / stepRad lands exactly
  // on an integer here, and GLSL ES allows a divide to be 2.5 ULP out, so
  // floor() would answer 512 on one GPU and 511 on another.
  float rings = floor(3.14159265 / stepRad + 0.5);
  float ring = min(floor((el + 1.57079633) / stepRad), rings - 1.0);
  float elC = (ring + 0.5) * stepRad - 1.57079633;
  float ce = cos(elC);
  // As many cells as fit at one stepRad wide, ROUNDED TO A MULTIPLE OF
  // FOUR: the ordered dither is a 4x4 tile indexed by the cell, so a ring
  // whose count is not a multiple of 4 steps its Bayer phase across the
  // azimuth wrap - a dislocation running up the az = 0 meridian.
  float m = max(4.0, 4.0 * floor(6.28318531 * ce / stepRad * 0.25 + 0.5));
  // atan(0, 0) is UNDEFINED in GLSL and the exact zenith and nadir reach
  // it; a NaN there would poison the direction and the cell id both.
  float az = (dir.x == 0.0 && dir.z == 0.0) ? 0.0 : atan(dir.x, dir.z);
  az -= 6.28318531 * floor(az / 6.28318531);                 // [0, 2PI) - and the wrap is a cell boundary, not a seam
  float g = az * m / 6.28318531;
  float azC = (floor(g) + 0.5) * 6.28318531 / m;
  cellOut = vec2(g, ring + fract((el + 1.57079633) / stepRad));   // id and interior off ONE value, and the clamped top ring keeps its own id
  return vec3(sin(azC) * ce, sin(elC), cos(azC) * ce);       // already unit: ce is cos(elC)
}

${BAYER_GLSL}`;

// bayer4's mean is 7.5/16, so code that must keep a quantizer's mean subtracts this rather than 0.5.
export const BAYER_MEAN = 0.46875;

// Needs BAYER_GLSL beside it. `cell` is a texel of the surface's own grid, not a screen pixel.
export const SD_PIXEL_GLSL = `
vec3 sdPixel(vec3 c, vec2 cell, float steps) {
  float l = max(max(c.r, c.g), c.b);
  if (l <= 1e-5) return vec3(0.0);
  float q = floor(l * steps + bayer4(cell) + 0.03125) / steps;
  return c * (q / l);
}
`;
