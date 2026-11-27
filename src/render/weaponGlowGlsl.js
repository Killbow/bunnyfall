// @ts-check
// Weapon glow shaders and their numbers, a leaf with no imports. renderer.js builds the programs and issues the
// draws, and weaponGlow.js decides what a weapon shows.

// Every rate is whole over this period, and the renderer wraps its seconds here, so the wrap never jumps a flame.
export const GLOW_CLOCK_PERIOD = 240;
export const GLOW_UNIT_ROWS = 200;
export const GLOW_UNIT_MIN = 0.5;
export const GLOW_UNIT_MAX = 8;
export const glowUnit = (rows) => Math.min(GLOW_UNIT_MAX, Math.max(GLOW_UNIT_MIN, rows / GLOW_UNIT_ROWS));
export const GLOW_RINGS = Object.freeze([4.75, 3.25, 2, 1]);
export const GLOW_DIRS = 12;
export const GLOW_FIRE_UP = 1.8;
export const GLOW_FIRE_DOWN = 0.6;
export const GLOW_EMBER_RISE = Object.freeze([6, 7.5, 9]);
export const glowReach = (look) => (look === 'fire' ? Math.max(GLOW_RINGS[0] * GLOW_FIRE_UP, ...GLOW_EMBER_RISE) : GLOW_RINGS[0]);
// The drawn weapon often sits on the picture's edge, so the picture needs this pad or the outline is cut flat.
export function glowPad(look, rows) {
  const reach = glowReach(look);
  let pad = 0;
  for (let i = 0; i < 4; i++) pad = Math.ceil(reach * glowUnit(rows + 2 * pad)) + 1;
  return pad;
}
// Rings sit at the back of the pass, outer ones farther, so the inner rings and the body cover them. Neighbors stay at
// least GLOW_DEPTH_STEPS steps of a 16-bit depth buffer apart.
export const GLOW_RING_FAR = 0.999;
export const GLOW_RING_STEP = 1e-4;
export const GLOW_DEPTH_STEPS = 2;
// The charge pulls toward the eye because its vertex shader is another program, and LEQUAL alone loses texels
// where the two round apart.
export const GLOW_CHARGE_PULL = -1e-5;
// A picture texel at or past this window depth is a ring's or an ember's, never the body's.
export const GLOW_DEPTH_FLOOR = (GLOW_RING_FAR + 1) / 2 - GLOW_DEPTH_STEPS / 65535;
export const GLOW_DRAWS_MAX = 64;
// The most each look's band reaches at level 3, in glow cells. The sprite clamps its reach here, and its search
// window holds every cell within it.
export const GLOW_REACH_MAX = Object.freeze({ fire: 7.35, frost: 6.1, shock: 10, arcane: 2.8 });
export const GLOW_EMBER_SLACK = 3;
export const glowFieldReach = (look) => GLOW_REACH_MAX[/** @type {keyof typeof GLOW_REACH_MAX} */ (look)] + (look === 'fire' ? GLOW_EMBER_SLACK : 0);
export const GLOW_SPRITE_WINDOW = Object.freeze(Object.fromEntries(['fire', 'frost', 'shock', 'arcane'].map((look) => {
  const r = GLOW_REACH_MAX[/** @type {keyof typeof GLOW_REACH_MAX} */ (look)], e = glowFieldReach(look);
  return [look, Object.freeze(look === 'fire' ? [Math.floor(e), Math.floor(r * GLOW_FIRE_DOWN), Math.floor(e * GLOW_FIRE_UP)] : [Math.floor(e), Math.floor(e), Math.floor(e)])];
})));
export const GLOW_FIELDS_MAX = 128;

export const GLOW_LOOK_GLSL = `
uniform vec3 uRamp[4];
float gwHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
// value noise, periodic in y over py lattice rows - a scroll of exactly py rows a clock period wraps seamlessly
float gwNoise(vec2 x, float py) {
  vec2 i = floor(x);
  vec2 f = x - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  float y0 = mod(i.y, py);
  float y1 = mod(i.y + 1.0, py);
  float a = gwHash(vec2(i.x, y0));
  float b = gwHash(vec2(i.x + 1.0, y0));
  float c = gwHash(vec2(i.x, y1));
  float d = gwHash(vec2(i.x + 1.0, y1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// the distance a texel is from a solid one, in the look's own metric (o: from the texel to the solid, y up)
float gwMetric(int look, vec2 o) {
  if (look == 1) return length(vec2(o.x, o.y * (o.y < 0.0 ? ${(1 / GLOW_FIRE_UP).toFixed(6)} : ${(1 / GLOW_FIRE_DOWN).toFixed(6)})));
  if (look == 2) return max(abs(o.x), abs(o.y));
  if (look == 3) return abs(o.x) + abs(o.y);
  return length(o);
}
// how far the band stands off the edge here, now
float gwReach(int look, vec2 c, float t, float lv) {
  if (look == 1) {
    float n1 = gwNoise(vec2(c.x * 0.45, c.y * 0.3 - t * 2.0), 480.0);
    float n2 = gwNoise(vec2(c.x * 0.9 + 17.0, c.y * 0.6 - t * 4.0), 960.0);
    return (1.2 + 1.0 * lv) * (0.5 + n1 * (0.75 + 0.5 * n2));
  }
  if (look == 2) {
    float spike = step(0.86, gwHash(floor(c) + 31.0));
    float breath = 0.5 + 0.5 * sin(t * 2.0943951);
    return 0.8 + 0.8 * lv + spike * (0.6 + 0.6 * lv) + 0.5 * breath;
  }
  if (look == 3) {
    float s = floor(t * 12.0);
    float arc = gwNoise(floor(c * 0.5) * 0.9 + vec2(s * 3.7, s * 1.3), 4096.0);
    float surge = step(0.8, gwHash(vec2(floor(t * 3.0), 7.0)));
    return 1.6 + 0.3 * lv + smoothstep(0.55, 0.85, arc) * (2.0 + 1.5 * lv) + surge;
  }
  float w = 0.5 + 0.5 * sin(t * 1.5707963 + c.x * 0.15 + c.y * 0.1);
  return 1.6 + 0.6 * lv * (0.7 + 0.3 * w);
}
// the band's colour at h (1 at the edge, 0 at the reach) - four steps of the ramp; alpha 0 is a gap
vec4 gwShade(int look, float h, vec2 c, float t, float lv) {
  int q = int(clamp(floor(h * 4.0 - 0.5), 0.0, 3.0));
  vec3 col = uRamp[q];
  float a = 0.55 + 0.45 * h;
  if (look == 2 && gwHash(floor(c) + floor(t * 5.0) * 7.31) > 0.972) { col = uRamp[3]; a = 1.0; }
  if (look == 3 && gwHash(floor(c * 0.5) + floor(t * 12.0) * 13.0) < 0.18) return vec4(0.0);
  return vec4(col, a * (0.75 + 0.083 * lv));
}
// an ember over a flame: rising a cell a step, six steps a second
bool gwEmber(vec2 c, float t, float lv) {
  return gwHash(vec2(floor(c.x), mod(floor(c.y) - floor(t * 6.0), 1440.0))) > 0.993 - 0.002 * lv;
}
// the weapon's own edge, lit by its element: x the colour's share
vec4 gwRim(int look, vec2 c, float t, float lv) {
  float k = 0.3;
  if (look == 1) k = 0.25 + 0.35 * gwNoise(vec2(c.x * 0.6, c.y * 0.6 - t * 3.0), 720.0);
  else if (look == 2) k = 0.3 + 0.2 * (0.5 + 0.5 * sin(t * 2.0943951));
  else if (look == 3) k = gwHash(floor(c * 0.5) + floor(t * 12.0) * 5.0) > 0.5 ? 0.65 : 0.15;
  return vec4(uRamp[2], k * (0.7 + 0.1 * lv));
}
// the Morrowind charge's pattern on the surface, 0..1: fire boils up the screen, frost is facets that glint in turn,
// shock is veins that jump twelve times a second, arcane a slow swirl
float gwSurface(int look, vec2 uv, vec2 c, float t) {
  if (look == 1) return smoothstep(0.4, 0.95, gwNoise(vec2(c.x * 0.5, c.y * 0.35 - t * 2.5), 600.0));
  if (look == 2) {
    float f = gwHash(floor(uv * 24.0));
    return pow(0.5 + 0.5 * sin(t * 2.0943951 + f * 6.2831853), 6.0);
  }
  if (look == 3) {
    float s = floor(t * 12.0);
    return 1.0 - smoothstep(0.0, 0.07, abs(gwNoise(c * 0.6 + vec2(s * 5.1, s * 2.3), 4096.0) - 0.5));
  }
  float a = t * 0.2617994;
  return gwNoise(uv * 8.0 + vec2(sin(a), cos(a)) * 2.0, 4096.0);
}
`;

export const GLOW_SPRITE_VS = `#version 300 es
layout(location=0) in vec2 aPos;
uniform vec4 uDst;
uniform vec2 uCanvas;
uniform vec4 uPad;
uniform ivec2 uArt;
out vec2 vQ;
void main() {
  vec2 p = aPos * 0.5 + 0.5;
  vec2 art = vec2(uArt);
  vec2 q = mix(-uPad.xy / art, 1.0 + uPad.zw / art, p);
  vQ = q;
  vec2 px = uDst.xy + q * uDst.zw;
  gl_Position = vec4(px.x / uCanvas.x * 2.0 - 1.0, 1.0 - px.y / uCanvas.y * 2.0, 0.0, 1.0);
}`;

export const GLOW_FIELD_VS = `#version 300 es
layout(location=0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const GLOW_FIELD_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uTex;
uniform ivec2 uArt;
uniform ivec4 uFieldPad;
uniform ivec3 uWin;
uniform ivec3 uCut;
uniform int uLook;
uniform float uDmax;
out vec4 outColor;
${GLOW_LOOK_GLSL}
bool gwCell(ivec2 a) {
  if (uCut.x == 1 && a.x < 0) a.x = 0;
  if (uCut.y == 1 && a.x >= uArt.x) a.x = uArt.x - 1;
  if (uCut.z == 1 && a.y >= uArt.y) a.y = uArt.y - 1;
  if (a.x < 0 || a.y < 0 || a.x >= uArt.x || a.y >= uArt.y) return false;
  vec2 k = vec2(textureSize(uTex, 0)) / vec2(uArt);
  return texelFetch(uTex, ivec2((vec2(a) + 0.5) * k), 0).a >= 0.5;
}
void main() {
  ivec2 a = ivec2(gl_FragCoord.xy) - uFieldPad.xy;
  if (gwCell(a)) {
    bool inner = gwCell(a + ivec2(1, 0)) && gwCell(a - ivec2(1, 0)) && gwCell(a + ivec2(0, 1)) && gwCell(a - ivec2(0, 1));
    outColor = vec4(1.0, 0.0, inner ? 1.0 : 0.5, 1.0);
    return;
  }
  float d = uDmax;
  bool below = false;
  for (int y = -uWin.y; y <= uWin.z; y++) {
    for (int x = -uWin.x; x <= uWin.x; x++) {
      if (!gwCell(a + ivec2(x, y))) continue;
      float m = gwMetric(uLook, vec2(float(x), -float(y)));
      if (m < d) { d = m; below = y > 0; }
    }
  }
  outColor = vec4(d / uDmax, below ? 1.0 : 0.0, 0.0, 1.0);
}`;

export const GLOW_SPRITE_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vQ;
uniform sampler2D uTex;
uniform sampler2D uField;
uniform vec4 uSrc;
uniform ivec2 uArt;
uniform ivec2 uFieldAt;
uniform int uLook;
uniform float uLevel;
uniform float uTime;
uniform float uDmax;
uniform float uReachMax;
out vec4 outColor;
${GLOW_LOOK_GLSL}
void main() {
  vec2 uv = mix(uSrc.xy, uSrc.zw, vQ);
  ivec2 ts = textureSize(uTex, 0);
  ivec2 tc = ivec2(floor(uv * vec2(ts)));
  bool solid = tc.x >= 0 && tc.y >= 0 && tc.x < ts.x && tc.y < ts.y && texelFetch(uTex, tc, 0).a >= 0.5;
  ivec2 a = ivec2(floor(uv * vec2(uArt)));
  vec4 f = texelFetch(uField, clamp(a + uFieldAt, ivec2(0), textureSize(uField, 0) - 1), 0);
  vec2 c = vec2(float(a.x), -float(a.y));
  float t = uTime;
  float lv = uLevel;
  if (solid) {
    if (f.b < 0.25 || f.b > 0.75) discard;
    vec4 r = gwRim(uLook, c, t, lv);
    outColor = vec4(r.rgb * r.a, r.a * 0.5);
    return;
  }
  if (f.b > 0.25 || f.r >= 0.999) discard;
  float d = f.r * uDmax;
  float reach = min(gwReach(uLook, c, t, lv), uReachMax);
  float h = 1.0 - d / max(reach, 0.25);
  if (h <= 0.0) {
    if (uLook == 1 && f.g > 0.5 && d < reach + ${GLOW_EMBER_SLACK.toFixed(1)} && gwEmber(c, t, lv)) { outColor = vec4(uRamp[2], 1.0); return; }
    discard;
  }
  vec4 s = gwShade(uLook, h, c, t, lv);
  if (s.a <= 0.0) discard;
  outColor = vec4(s.rgb * s.a, s.a);
}`;

// Throws unless the source holds exactly one of each needle, because a silent no-op would draw the glow nowhere.
export function glowMeshVs(charSkinVs) {
  const decl = 'out vec3 vEmissive;';
  const pos = 'gl_Position = uProj * uView * world;';
  const n = (needle) => charSkinVs.split(needle).length - 1;
  if (n(decl) !== 1 || n(pos) !== 1) {
    throw new Error(`WEAPON-GLOW1: the character vertex shader needs one "${decl}" and one "${pos}" (has ${n(decl)} and ${n(pos)})`);
  }
  return charSkinVs
    .replace(decl, `${decl}\nout vec3 vViewPos;\nflat out float vRingD;\nuniform vec4 uGlowDraw[${GLOW_DRAWS_MAX}];\nuniform int uGlowInstanced;\nuniform float uGlowPull;`)
    .replace(pos, `${pos}\n  vViewPos = (uView * world).xyz;\n  vec4 gwD = uGlowInstanced == 1 ? uGlowDraw[gl_InstanceID] : vec4(0.0);\n  gl_Position.xy += gwD.xy * gl_Position.w;\n  gl_Position.z = gwD.z > 0.0 ? gwD.z * gl_Position.w : gl_Position.z + uGlowPull * gl_Position.w;\n  vRingD = gwD.w;`);
}

// The charge takes its derivatives first, in uniform control flow, before any discard.
export const GLOW_MESH_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
in vec3 vViewPos;
flat in float vRingD;
uniform sampler2D uTex;
uniform float uUseTex;
uniform float uAlphaCut;
uniform int uLook;
uniform float uLevel;
uniform float uTime;
uniform float uMode;
uniform float uUnit;
uniform vec2 uGlowOrigin;
out vec4 outColor;
${GLOW_LOOK_GLSL}
void main() {
  vec3 dx = dFdx(vViewPos);
  vec3 dy = dFdy(vViewPos);
  if (uUseTex > 0.5 && uAlphaCut > 0.0 && texture(uTex, vUV).a < uAlphaCut) discard;
  vec2 c = (gl_FragCoord.xy - uGlowOrigin) / uUnit;
  float t = uTime;
  float lv = uLevel;
  if (uMode < 0.5) {
    if (vRingD < 0.0) {
      if (!gwEmber(c, t, lv)) discard;
      outColor = vec4(uRamp[2], 1.0);
      return;
    }
    float h = 1.0 - vRingD / max(gwReach(uLook, c, t, lv), 0.25);
    if (h <= 0.0) discard;
    vec4 s = gwShade(uLook, h, c, t, lv);
    if (s.a <= 0.0) discard;
    outColor = vec4(s.rgb, 1.0);
    return;
  }
  vec3 n = normalize(cross(dx, dy));
  vec3 v = normalize(-vViewPos);
  float rim = pow(1.0 - abs(dot(n, v)), 2.0);
  float pat = gwSurface(uLook, vUV, c, t);
  float k = (0.06 + 0.4 * rim + 0.3 * pat) * (0.45 + 0.12 * lv);
  outColor = vec4(mix(uRamp[1], uRamp[3], pat) * k, 0.0);
}`;

/** @param {string} look */
export function glowRingDraws(look) {
  const out = [];
  for (const ring of GLOW_RINGS) {
    for (let i = 0; i < GLOW_DIRS; i++) {
      const a = (i * 2 * Math.PI) / GLOW_DIRS;
      let x = Math.cos(a), y = Math.sin(a);
      if (look === 'fire') y *= y > 0 ? GLOW_FIRE_UP : GLOW_FIRE_DOWN;
      out.push(Object.freeze({ shift: Object.freeze([x * ring, y * ring]), ring, far: GLOW_RING_FAR + ring * GLOW_RING_STEP }));
    }
  }
  if (look === 'fire') {
    for (const up of GLOW_EMBER_RISE) for (const side of [-0.6, 0, 0.6]) {
      out.push(Object.freeze({ shift: Object.freeze([side, up]), ring: -1, far: GLOW_RING_FAR }));
    }
  }
  return Object.freeze(out);
}
