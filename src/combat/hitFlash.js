export const HIT_FLASH_S = 0.3;
export const HIT_FLASH_HOLD_S = 0.08;
export const HIT_FLASH_PEAK = 0.85;
const RESYNC_S = 0.5;

export function hitFlashStrength(age) {
  if (!(age >= 0) || age >= HIT_FLASH_S) return 0;
  if (age <= HIT_FLASH_HOLD_S) return HIT_FLASH_PEAK;
  return HIT_FLASH_PEAK * (1 - (age - HIT_FLASH_HOLD_S) / (HIT_FLASH_S - HIT_FLASH_HOLD_S));
}

// A health drop since the last drawn frame counts as a hit, so every damage source flashes without its own hook.
// An enemy unseen for RESYNC_S resyncs silently, so an old wound never flashes on its return.
export function foeHitFlash(f, now) {
  if (!f) return 0;
  const hp = f.entity?.health;
  if (Number.isFinite(hp)) {
    const fresh = f._hfSeen != null && now - f._hfSeen <= RESYNC_S;
    if (fresh && f._hfHp != null && hp < f._hfHp) f._hfAt = now;
    f._hfHp = hp;
    f._hfSeen = now;
  }
  return f._hfAt == null ? 0 : hitFlashStrength(now - f._hfAt);
}

export function setBatchHitFlash(batch, k) {
  if (!batch) return;
  const v = k > 0 ? k : 0;
  if ((batch.hitFlash || 0) !== v) batch.hitFlash = v;
}

// Both billboard shaders and the sprite quad share this term, so the flash layers over concealment.
export const HIT_FLASH_GLSL = `
vec3 hitFlashLit(vec3 lit, vec3 albedo, float k) {
  if (k <= 0.0) return lit;
  const vec3 LUM = vec3(0.299, 0.587, 0.114);
  float l = dot(albedo, LUM);
  // as bright as the sprite already is in strong light, never darker than a glow in the dark (a dungeon's foe)
  vec3 red = vec3(1.0, 0.09, 0.06) * max(dot(lit, LUM) * 1.5, 0.45 + 0.8 * l);
  return mix(lit, red, clamp(k, 0.0, 1.0));
}`;

// The sprite refuses the hurt state mid-attack, so a puppet holds the streamed hurt until its sprite enters it.
export const PUPPET_HURT_HOLD_S = 0.35;

export function puppetHurtStep(p, mobile, now) {
  if (!p) return false;
  if (p.hurt) { p.hurtUntil = now + PUPPET_HURT_HOLD_S; p.hurt = false; }
  if (p.hurtUntil && mobile?.state === 'hurt') p.hurtUntil = 0;
  return !!p.hurtUntil && now < p.hurtUntil;
}

// The rim and embers draw inside the sprite's own quad, which an elite batch widens with elitePad: no second draw.
export const ELITE_GLOW_GLSL = `
const vec3 ELITE_GOLD = vec3(1.0, 0.68, 0.16);
const vec3 ELITE_RIM = vec3(0.35, 0.75, 1.0);   // the outline: a bright blue
// EXACT TEXELS (Mac's screenshot, 2026-10-01: thin lines over an elite's corpse): the sprites are MIPMAPPED and wrap
// REPEAT, so a filtered texture() read just past the top edge blended in the opaque BOTTOM row (a body lying on the
// floor is opaque all along it) and drew a line the corpse's width. The outline and the embers now read the base
// level's own texels with texelFetch - no filtering, no mip, no wrap; outside the sprite is empty.
float eliteAlphaAt(sampler2D t, ivec2 p) {
  ivec2 ts = textureSize(t, 0);
  if (p.x < 0 || p.y < 0 || p.x >= ts.x || p.y >= ts.y) return 0.0;
  return texelFetch(t, p, 0).a;
}
// THE OUTLINE'S WIDTH (Mac: "make it like it was before without lines"): every texel within 2 of the silhouette
// (dx*dx + dy*dy <= 4) - the eight round it plus a second texel straight out on each axis, the ~1.5-texel weight
// the filtered reads used to give it, now from exact texels.
float eliteRim(sampler2D t, vec2 uv) {
  ivec2 p = ivec2(floor(uv * vec2(textureSize(t, 0))));
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      if ((dx == 0 && dy == 0) || dx * dx + dy * dy > 4) continue;
      if (eliteAlphaAt(t, p + ivec2(dx, dy)) >= 0.5) return 1.0;
    }
  }
  return 0.0;
}
// THE OUTLINE'S PULSE (Mac: "the outline to have the same effect as yellow just more visible and the max brightness it
// should reach is what we have right now"): it breathes with the body's warmth, on the same pulse (k 0.55..1) but
// deeper - from a dim blue at the pulse's low to the outline's full brightness at its peak, and never past it.
// A corpse's batch is static - nothing writes its pulse each frame - so a NEGATIVE glow carries its phase instead
// (-0.05..-1) and the shader runs the same pulse off the clock (Mac: "corpses need to pulse too").
// STAFF-EVENT: a staff event's MINI BOSS glows YELLOW (mob: "instead of the blue elite glow lets make the mini boss
// have a yellow glow") - its glow is an elite's past STAFF_BOSS_GLOW (systems/eliteFoes.js), kept through the pulse here
// so the colour reads it: a living one's 2.55..3, a corpse's -2.05..-3.
const vec3 STAFF_BOSS_RIM = vec3(1.0, 0.82, 0.18);   // the outline: a bright yellow
// SIFRIT (2026-11-13): a necromancer's mini boss glows PURPLE - the glow's offset 4 (systems/eliteFoes.js SIFRIT_GLOW), its pulse 4.55..5
const vec3 SIFRIT_RIM = vec3(0.72, 0.28, 1.0);
float eliteRimK(float g, float secs) {
  if (g > 0.0) return g;
  float boss = -g >= 4.0 ? 4.0 : (-g >= 2.0 ? 2.0 : 0.0);
  return boss + 0.775 + 0.225 * sin(secs * 3.2 + (-g - boss) * 6.2831853);
}
vec3 eliteRimColor(float k) {
  bool purple = k >= 4.0;
  if (purple) k -= 4.0;
  bool boss = !purple && k >= 2.0;
  if (boss) k -= 2.0;
  vec3 full = min((purple ? SIFRIT_RIM : boss ? STAFF_BOSS_RIM : ELITE_RIM) * 2.0, vec3(1.0));   // the brightest it reaches: the outline as it was
  float s = clamp((k - 0.55) / 0.45, 0.0, 1.0);
  return full * mix(0.4, 1.0, s);
}
// THE EMBERS (Mac: "make the outline flow into the air a bit ... pixels that fly in the air"): single pixels of the
// outline's colour rising off the top of the silhouette. Each texel column holds at most one ember a cycle; whether it
// burns, how fast it climbs and when it starts are hashes of the column and the cycle, so nothing is stored and nothing
// is sent online. A fragment finds the body under it by scanning down its own column (a transparent elite fragment only).
const float ELITE_RISE = 18.0;   // how high an ember climbs, texels
float eliteHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float eliteEmber(sampler2D t, vec2 uv, float secs) {
  vec2 ts = vec2(textureSize(t, 0));
  vec2 tp = floor(uv * ts);
  // straight up its own column: a sideways sway mapped two columns onto one ember and drew short dashes
  float c = tp.x;
  float d = -1.0;
  for (int i = 1; i <= 18; i++) {
    float y = tp.y - float(i);
    if (y < 0.0) break;
    if (eliteAlphaAt(t, ivec2(int(c), int(y))) >= 0.5) { d = float(i); break; }   // exact texels (see eliteAlphaAt)
  }
  if (d < 3.0) return 0.0;   // nothing below in reach, or this texel is the rim's (2 wide)
  float speed = 5.0 + 7.0 * eliteHash(vec2(c, 1.7));   // texels a second
  float cyc = secs * speed / ELITE_RISE + eliteHash(vec2(c, 9.1));
  float n = floor(cyc);
  if (eliteHash(vec2(c, n + 3.0)) > 0.3) return 0.0;   // most columns rest this cycle
  float h = 3.0 + floor(fract(cyc) * ELITE_RISE);
  if (d != h) return 0.0;
  return 1.0 - fract(cyc);   // fades as it climbs
}
// A NEGATIVE glow is an elite's corpse: the rim alone at |k| - no embers, no gold (systems/eliteFoes.js).
// The body (Mac: "the yellow glow is too much make the enemy glow from normal to a bit yellow"): the pulse runs from
// the sprite's own colours (k at its low, 0.55) to a light yellow warmth (k at 1) - a tint, never a wash.
vec3 eliteGlowLit(vec3 lit, vec3 albedo, float k) {
  if (k <= 0.0) return lit;
  bool purple = k >= 4.0;
  if (purple) k -= 4.0;
  else if (k >= 2.0) k -= 2.0;   // STAFF-EVENT: a mini boss's pulse, warmed as an elite's
  const vec3 LUM = vec3(0.299, 0.587, 0.114);
  float l = dot(albedo, LUM);
  float s = clamp((k - 0.55) / 0.45, 0.0, 1.0);
  if (purple) return lit * mix(vec3(1.0), vec3(1.04, 0.86, 1.14), s) + vec3(0.42, 0.12, 0.62) * (0.05 * s * l);   // SIFRIT: a tint of violet, never a wash
  return lit * mix(vec3(1.0), vec3(1.10, 1.04, 0.82), s) + ELITE_GOLD * (0.035 * s * l);
}`;

export const GLINT_GLSL = `
vec3 glintRimColor(vec4 g) { return min(g.rgb * (0.55 + 0.75 * g.a), vec3(1.0)); }
vec3 glintLit(vec3 lit, vec3 albedo, vec4 g) {
  if (g.a <= 0.0) return lit;
  const vec3 LUM = vec3(0.299, 0.587, 0.114);
  float l = dot(albedo, LUM);
  vec3 c = g.rgb * max(dot(lit, LUM) * 1.4, 0.35 + 0.8 * l);
  return mix(lit, c, clamp(g.a, 0.0, 1.0) * 0.45);
}`;
// Any positive pad works: the vertex shader floors it at two texels a side for the outline.
export const TELL_GLINT_PAD = Object.freeze([0.001, 0.001, 0.001, 0.001]);
export function setBatchGlint(batch, g) {
  if (!batch) return;
  const cur = batch.glint;
  if (!g || !(g[3] > 0)) { if (cur) batch.glint = undefined; return; }
  if (cur && cur[0] === g[0] && cur[1] === g[1] && cur[2] === g[2] && cur[3] === g[3]) return;
  // Rewritten in place so a glint that changes every frame allocates nothing.
  if (cur) { cur[0] = g[0]; cur[1] = g[1]; cur[2] = g[2]; cur[3] = g[3]; return; }
  batch.glint = [g[0], g[1], g[2], g[3]];
}
let _reducedAt = -Infinity, _reduced = false;
export function prefersReducedMotion(nowMs = Date.now()) {
  if (nowMs - _reducedAt < 1000) return _reduced;
  _reducedAt = nowMs;
  try { _reduced = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch { _reduced = false; }
  return _reduced;
}
