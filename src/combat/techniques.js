// @ts-check
// Runs the weapon technique key for whichever weapon rig steps it this frame. Cooldowns belong to the player,
// not to a rig, so changing hosts neither resets one nor runs two; a new rig drops any aim or flight in progress.

import { techniqueById, techniqueMult, techniqueFamily, TECHNIQUE_MAX_SPEED, TECHNIQUES, TECHNIQUE_ACTION } from './technique/techniqueRoster.js';
import { signatureFor, signatureById, SIGNATURE_IDS, SIGNATURE_TECHNIQUES } from '../characters/martialPaths.js';
import { techniqueLineOf, lootRarityOn, rarityKnown } from '../items/lootRarity.js';
import { EQUIP_SLOTS } from '../characters/equip.js';
import { sigilDueling } from '../items/sigil.js';
import { FATIGUE_MULTIPLIER } from '../characters/statMods.js';
import { spendAmmoFor, ammoCountFor } from '../items/inventory.js';
import { tallySwingSkills, SWING_FATIGUE_COST } from './hostCombat.js';
import { playerDoor } from '../player/playerDoor.js';
import { GRAVITY } from '../player/motor.js';
import { rayHit } from '../player/groundRay.js';
import { restoresSoFar } from '../saves/save.js';
import { blowSchedule } from '../characters/weaponStates.js';
import { ARROW_FLIGHT_SPEED } from '../magic/spellcast.js';
import { WEAPON_REACH, friendlyProtected } from './playerWeapon.js';
import { playerBody, bodyRadius, tellTechniqueUsed } from './technique/techniqueBlow.js';
import { madeRuleHere, madeSaysHere, madeOnTraverse } from '../characters/madeLevel.js';
import { techniqueCue, resetTechniqueFx, TECH_FX } from './technique/techniqueFx.js';

export { TECHNIQUE_ACTION };
// Matches TECH_CHIP_COLOUR in technique/techniqueRoster.js.
export const TECH_COLOR = Object.freeze([0.35, 0.78, 1]);
export const TECH_BAD_COLOR = Object.freeze([0.95, 0.32, 0.3]);
export const TECH_DROP_MAX = 4;
export const TECH_RISE_MAX = 2.5;
const SWING_GIVE_UP_S = 3;

export const NO_TECHNIQUE_TEXT = 'This weapon has no technique.';
export const LADDER_OFF_TEXT = 'Weapon techniques need Loot rarity turned on.';
export const DUEL_TEXT = "Techniques can't be used in a duel.";
export const TIRED_TEXT = 'You are too tired.';
export const SHEATHED_TEXT = 'Draw your weapon first.';
export const NO_AMMO_TEXT = 'You have nothing to shoot.';
export const OUT_OF_REACH_TEXT = 'Out of reach.';
export const NO_FOE_TEXT = 'No foe there.';
export const CANNOT_LEAP_TEXT = 'You cannot leap from here.';
export const NOT_HERE_TEXT = 'Not here.';
export const BEAST_TEXT = "You can't use techniques in beast form.";
export const GAUNTLETS_TEXT = 'Your gauntlets\' technique is for bare hands.';
export const NO_ROOM_TEXT = 'No room to leap.';
// An unidentified item does not name its technique, but the technique still works.
export const UNKNOWN_TECHNIQUE = 'Your technique';
export const notReadyText = (name, s) => `${name} is not ready (${s}s).`;
export const readyAgainText = (name) => `${name} is ready again.`;

const SIGNATURE_PATHS = Object.freeze([...new Set(SIGNATURE_IDS.map((id) => SIGNATURE_TECHNIQUES[id].path))]);
// Cooldown slots: the roster's ids in order, then one shared slot per martial path for all its signature forms.
const TECH_IDS = Object.freeze([...Object.keys(TECHNIQUES), ...SIGNATURE_PATHS.map((p) => `sig:${p}`)]);
const TECH_INDEX = Object.freeze(Object.fromEntries([...TECH_IDS.map((id, i) => [id, i]),
  ...SIGNATURE_IDS.map((id) => [id, TECH_IDS.indexOf(`sig:${SIGNATURE_TECHNIQUES[id].path}`)])]));
const techOf = (id) => techniqueById(id) ?? signatureById(id);
const fresh = () => ({
  wait: new Float64Array(TECH_IDS.length),
  aim: null,
  act: null,
  prev: false,
  owner: null,
  say: null,
  restores: null,
});
let _s = fresh();

// With both hands armed, a technique uses the lead hand, so off-hand blows never swap the chip or cancel an aim.
export function techniqueItem(entity, pw) {
  const w = pw?.restingWeapon ?? pw?.weapon ?? null;
  if (w?.werecreatureClaws) return null;
  if (w) return w;
  return entity?.equip?.slots?.[EQUIP_SLOTS.Gloves] ?? null;
}
let _handMemo = null;
let _sigMemo = null;
export function techniqueInHand(entity, pw) {
  const item = techniqueItem(entity, pw);
  const line = techniqueLineOf(item);
  const tech = line ? techniqueById(line.param) : null;
  if (!tech) return signatureInHand(entity, pw, item);
  // A found line is inactive while Loot rarity is off, so a martial signature can take the key.
  if (!lootRarityOn()) { const sig = signatureInHand(entity, pw, item); if (sig) return sig; }
  const known = rarityKnown(item), h = _handMemo;
  if (h && h.item === item && h.line === line && h.id === line.param && h.value === line.value && h.known === known) return h.hand;
  const hand = { id: line.param, value: line.value, tech, item, known };
  _handMemo = { item, line, id: line.param, value: line.value, known, hand };
  return hand;
}
function signatureInHand(entity, pw, item) {
  const held = pw?.restingWeapon ?? pw?.weapon ?? null;
  const family = held ? (held.werecreatureClaws ? null : techniqueFamily(held)) : 'handToHand';
  const tech = family ? signatureFor(entity, family) : null;
  if (!tech) return null;
  const h = _sigMemo;
  if (h && h.item === item && h.tech === tech) return h.hand;
  const hand = { id: tech.id, value: 0, tech, item, known: true, signature: tech.path };
  _sigMemo = { item, tech, hand };
  return hand;
}
export const techniqueName = (hand) => (hand?.known === false ? UNKNOWN_TECHNIQUE : hand?.tech?.name ?? UNKNOWN_TECHNIQUE);
export const techniqueWait = (id) => Math.max(0, _s.wait[TECH_INDEX[id]] ?? 0);
// A technique is a deliberate burst, so FATIGUE_DRAIN_SCALE in characters/statMods.js does not apply to it.
export const techniqueFatigue = (tech) => Math.max(0, Math.round((tech?.fatigue ?? 0) * FATIGUE_MULTIPLIER));

const lookOf = (cam) => {
  const y = cam?.yaw ?? 0, p = cam?.pitch ?? 0;
  return [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
};
const flatOf = (yaw) => [Math.sin(yaw), 0, Math.cos(yaw)];
// The motor's feet are a Float32Array, so this cannot use Array.isArray.
const vec3 = (v) => v != null && v.length >= 3 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
function fxPlace(id, moment, ctx, extra = null, tech = techOf(id)) {
  const burst = TECH_FX[id]?.[moment]?.burst, f = ctx.cam?.feet;
  if (!burst || !vec3(f)) return null;
  const yaw = ctx.cam.yaw ?? 0, fw = flatOf(yaw);
  switch (burst) {
    case 'star': case 'chop': case 'punch':
      return { at: [f[0] + fw[0] * 1.2, f[1] + 1.1, f[2] + fw[2] * 1.2], ground: f[1], yaw, dir: [-fw[0], 0, -fw[2]] };
    case 'tracer': case 'flare': {
      const look = lookOf(ctx.cam), e = vec3(ctx.cam.pos) ? ctx.cam.pos : [f[0], f[1] + 1.6, f[2]];
      return { at: [e[0] + look[0] * 0.9, e[1] + look[1] * 0.9 - 0.15, e[2] + look[2] * 0.9], ground: f[1], yaw, dir: look, len: extra?.len ?? 0 };
    }
    case 'trail':
      return vec3(extra?.from) ? { at: extra.from, to: [f[0], f[1], f[2]], ground: f[1], yaw } : null;
    case 'shaft': case 'close':
      return vec3(extra?.at) ? { at: extra.at, ground: extra.at[1], yaw, r: extra.r ?? 2.5 } : null;
    default:
      return { at: [f[0], f[1], f[2]], ground: f[1], yaw, spin: tech?.strike === 'StrikeRight' ? -1 : 1, ...(typeof tech?.arc === 'number' ? { half: tech.arc } : {}) };
  }
}
const cue = (hand, moment, ctx, extra = null) => {
  const fx = hand.tech?.fx ?? hand.id;
  return techniqueCue(fx, moment, ctx.door, fxPlace(fx, moment, ctx, extra, hand.tech));
};
const at = (o, d, s) => [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s];
const flatDist = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]);

export function floorUnder(p, collider) {
  const o = [p[0], p[1] + 1, p[2]];
  try {
    const h = collider?.surfaceHit?.(o, [0, -1, 0], 41) ?? null;
    const d = h && Number.isFinite(h.dist) ? h.dist : collider?.raycast?.(o, [0, -1, 0], 41);
    return Number.isFinite(d) ? o[1] - d : null;
  } catch { return null; }
}

export function groundAim(eye, look, feet, collider, range) {
  let d = range + 2;
  const hit = rayHit(eye, look, range + 2, collider);
  if (Number.isFinite(hit)) d = Math.max(0, hit - 0.3);
  let p = at(eye, look, d);
  const h = flatDist(feet, p);
  if (h > range) {
    const k = range / h;
    p = [feet[0] + (p[0] - feet[0]) * k, p[1], feet[2] + (p[2] - feet[2]) * k];
  }
  const y = floorUnder(p, collider);
  if (y == null) return null;
  const point = [p[0], y, p[2]];
  return { point, dist: flatDist(feet, point) };
}

export function foeUnderLook(eye, look, range, collider, foes = playerDoor()?.foes?.() ?? []) {
  let best = null, score = Infinity;
  for (const f of foes) {
    if (!f || f.dead || !f.ai?.feet || playerBody(f) || f.companion != null || friendlyProtected(f)) continue;
    const c = [f.ai.feet[0], f.ai.feet[1] + (f.ai.height ?? 1.8) * 0.5, f.ai.feet[2]];
    const v = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
    const dist = Math.hypot(v[0], v[1], v[2]);
    if (!(dist > 0.1) || dist > range + 1.5) continue;
    const along = v[0] * look[0] + v[1] * look[1] + v[2] * look[2];
    if (along <= 0) continue;
    const perp = Math.sqrt(Math.max(0, dist * dist - along * along));
    if (perp > 0.6 + 0.06 * along) continue;
    const wall = rayHit(eye, [v[0] / dist, v[1] / dist, v[2] / dist], dist, collider);
    if (Number.isFinite(wall) && wall < dist - 0.4) continue;
    const s = perp + along * 0.05;
    if (s < score) { score = s; best = f; }
  }
  return best;
}

export function launchTo(from, to, apex, maxSpeed = TECHNIQUE_MAX_SPEED, g = GRAVITY) {
  const dx = to[0] - from[0], dz = to[2] - from[2], dy = to[1] - from[1];
  const h = Math.hypot(dx, dz);
  const timeAt = (top) => Math.sqrt((2 * top) / g) + Math.sqrt((2 * Math.max(0, top - dy)) / g);
  let top = Math.max(apex, dy + 0.4, 0.05);
  if (h / timeAt(top) > maxSpeed) {
    let lo = top, hi = top + 40;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (h / timeAt(mid) > maxSpeed) lo = mid; else hi = mid; }
    top = hi;
  }
  const time = timeAt(top);
  return { dir: h > 1e-6 ? [dx / h, 0, dz / h] : [0, 0, 0], along: h / time, up: Math.sqrt(2 * g * top), time };
}

export function volleyPoints(centre, radius, n, turn = 0) {
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const r = radius * Math.sqrt((i + 0.5) / n), a = i * golden + turn * Math.PI * 2;
    out.push([centre[0] + Math.cos(a) * r, centre[1], centre[2] + Math.sin(a) * r]);
  }
  return out;
}

export function swingBlow(id, value, cam, extra = {}) {
  const t = techOf(id);
  if (!t) return null;
  return {
    id, mult: techniqueMult(t.base, value), wounded: t.wounded ?? 0, toHit: t.toHit ?? 0,
    reach: t.mech === 'leap' ? t.radius : (t.reach ?? WEAPON_REACH), arc: t.mech === 'leap' ? 'all' : (t.arc ?? 'view'),
    single: !!t.single, lane: null, target: null, feet: cam?.feet ? [...cam.feet] : null, yaw: cam?.yaw ?? 0, ...extra,
  };
}

export const DASH_APEX = 0.25;
function flightFits(from, fl, bodyH, collider) {
  for (let i = 1; i < 8; i++) {
    const t = (fl.time * i) / 8;
    const p = [from[0] + fl.dir[0] * fl.along * t, from[1] + fl.up * t - 0.5 * GRAVITY * t * t, from[2] + fl.dir[2] * fl.along * t];
    if (Number.isFinite(rayHit([p[0], p[1] + 0.3, p[2]], [0, 1, 0], Math.max(0.1, bodyH - 0.2), collider))) return false;
  }
  return true;
}
// The motor reverses a rising body at a ceiling, so an arc that meets one lands short. This tries lower apexes,
// then refuses.
export function flightApex(from, to, apex, bodyH, collider) {
  for (const a of [apex, apex * 0.6, apex * 0.35, DASH_APEX]) {
    if (a > apex + 1e-9) continue;
    if (flightFits(from, launchTo(from, to, a), bodyH, collider)) return a;
  }
  return null;
}

export function aimFor(tech, cam, collider, foes = undefined) {
  const res = aimAt(tech, cam, collider, foes);
  if (!res.ok || !res.point || (tech.mech !== 'leap' && tech.mech !== 'dash') || !cam?.feet || !cam?.pos) return res;
  const apex = flightApex(cam.feet, res.point, tech.mech === 'leap' ? tech.apex : DASH_APEX, Math.max(1, cam.pos[1] - cam.feet[1] + 0.15), collider);
  return apex == null ? { ...res, ok: false, why: NO_ROOM_TEXT } : { ...res, apex };
}
function aimAt(tech, cam, collider, foes) {
  const eye = cam.pos, feet = cam.feet, look = lookOf(cam);
  if (!eye || !feet) return { ok: false, why: NOT_HERE_TEXT };
  const level = (p) => p[1] - feet[1] >= -TECH_DROP_MAX && p[1] - feet[1] <= TECH_RISE_MAX;
  if (tech.aim === 'ground') {
    const g = groundAim(eye, look, feet, collider, tech.range[1]);
    if (!g) return { ok: false, why: OUT_OF_REACH_TEXT };
    return { ok: g.dist >= tech.range[0] - 1e-6, point: g.point, why: OUT_OF_REACH_TEXT };
  }
  if (tech.aim === 'lane') {
    const yaw = cam.yaw ?? 0, way = flatOf(yaw);
    if (tech.mech === 'pierce') {
      let len = tech.length;
      const hit = rayHit(eye, look, tech.length, collider);
      if (Number.isFinite(hit)) len = Math.max(0.5, hit);
      return { ok: true, lane: { from: [feet[0], feet[2]], dir: [way[0], way[2]], len: len * Math.hypot(look[0], look[2]), halfW: 0.3, yaw, y: feet[1] }, point: null };
    }
    const chest = [feet[0], feet[1] + 1, feet[2]];
    let len = tech.length;
    const hit = rayHit(chest, way, tech.length + 0.6, collider);
    if (Number.isFinite(hit)) len = Math.max(0, hit - 0.6);
    const end = at(feet, way, len);
    const y = floorUnder([end[0], feet[1] + 0.6, end[2]], collider);
    const point = [end[0], y ?? feet[1], end[2]];
    return { ok: len >= 1 && y != null && level(point), point, lane: { from: [feet[0], feet[2]], dir: [way[0], way[2]], len, halfW: tech.halfW ?? 0.9, yaw, y: feet[1] }, why: CANNOT_LEAP_TEXT };
  }
  const foe = foeUnderLook(eye, look, tech.range[1], collider, foes);
  if (tech.aim === 'foe' && !foe) return { ok: false, why: NO_FOE_TEXT };
  if (foe) {
    const f = foe.ai.feet, r = bodyRadius(foe) + 0.55;
    const toward = flatDist(feet, f) > 1e-6 ? [(f[0] - feet[0]) / flatDist(feet, f), 0, (f[2] - feet[2]) / flatDist(feet, f)] : flatOf(cam.yaw ?? 0);
    const spots = tech.aim === 'foe'
      ? (() => { const fy = foe.ai.yaw ?? 0, back = flatOf(fy + Math.PI), side = flatOf(fy + Math.PI / 2); return [at(f, back, tech.behind ?? 1), at(f, side, tech.behind ?? 1), at(f, side, -(tech.behind ?? 1)), at(f, toward, -r)]; })()
      : [at(f, toward, -r)];
    for (const s of spots) {
      const chest = [f[0], f[1] + 1, f[2]], dir = [s[0] - f[0], 0, s[2] - f[2]], dl = Math.hypot(dir[0], dir[2]);
      if (dl > 1e-6) { const wall = rayHit(chest, [dir[0] / dl, 0, dir[2] / dl], dl + 0.4, collider); if (Number.isFinite(wall) && wall < dl + 0.35) continue; }
      const y = floorUnder([s[0], f[1] + 0.8, s[2]], collider);
      if (y == null) continue;
      const point = [s[0], y, s[2]];
      const d = flatDist(feet, point);
      return { ok: level(point) && d >= tech.range[0] - 1e-6 && d <= tech.range[1] + 1, point, foe, why: OUT_OF_REACH_TEXT };
    }
    return { ok: false, foe, why: OUT_OF_REACH_TEXT };
  }
  const g = groundAim(eye, look, feet, collider, tech.range[1]);
  if (!g) return { ok: false, why: OUT_OF_REACH_TEXT };
  return { ok: level(g.point) && g.dist >= tech.range[0] - 1e-6, point: g.point, why: OUT_OF_REACH_TEXT };
}

export function stepTechnique(dt, ctx) {
  if (!ctx || !ctx.entity || !ctx.pw) return;
  if (_s.owner !== ctx.rig) { _s.owner = ctx.rig; _s.aim = null; endAct(ctx.pw); }
  // The player entity is refilled in place on load, so the restore count is what marks a new load.
  const loads = restoresSoFar();
  if (_s.restores !== loads) {
    if (_s.restores != null) { _s.aim = null; endAct(ctx.pw); _s.wait.fill(0); }
    if (_s.restores != null) resetTechniqueFx();
    _s.restores = loads;
  }
  _s.say = ctx.say ?? _s.say;
  // While a window pauses the world, a key still held when it closes must be pressed again.
  if (ctx.blocked) { _s.aim = null; _s.prev = true; return; }
  const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
  const W = _s.wait;
  for (let i = 0; i < W.length; i++) {
    if (!(W[i] > 0)) continue;
    const next = W[i] - step;
    if (next > 0) { W[i] = next; continue; }
    W[i] = 0;
    const hand = techniqueInHand(ctx.entity, ctx.pw);
    // The classic HUD has no chips, so a message says the technique is ready.
    if (hand && TECH_INDEX[hand.id] === i) say(readyAgainText(hand.tech?.en ?? techniqueName(hand)));
  }
  const held = !!ctx.held, pressed = held && !_s.prev, released = !held && _s.prev;
  _s.prev = held;
  if (_s.act) stepAct(step, ctx);
  if (_s.aim) {
    const a = _s.aim;
    a.t += step;
    const hand = techniqueInHand(ctx.entity, ctx.pw);
    if (!hand || hand.id !== a.hand.id || hand.item !== a.hand.item || !ctx.ready || ctx.cancel) { _s.aim = null; return; }
    a.target = aimFor(hand.tech, ctx.cam, ctx.collider);
    if (!released) return;
    _s.aim = null;
    const why = refusal(hand, ctx);
    if (why) { if (why !== true) say(why); return; }
    if (!a.target?.ok) { say(a.target?.why ?? OUT_OF_REACH_TEXT); return; }
    execute(hand, ctx, a.target);
    return;
  }
  if (!pressed) return;
  const hand = techniqueInHand(ctx.entity, ctx.pw);
  const why = refusal(hand, ctx);
  if (why) { if (why !== true) say(why); return; }
  if (hand.tech.aim) { _s.aim = { hand, t: 0, target: aimFor(hand.tech, ctx.cam, ctx.collider) }; return; }
  execute(hand, ctx, null);
}

export function refusal(hand, ctx) {
  const pw = ctx.pw;
  if (pw?.weapon?.werecreatureClaws) return BEAST_TEXT;
  if (!hand) return pw?.weapon && techniqueLineOf(ctx.entity?.equip?.slots?.[EQUIP_SLOTS.Gloves]) ? GAUNTLETS_TEXT : NO_TECHNIQUE_TEXT;
  if (!hand.signature && !lootRarityOn()) return LADDER_OFF_TEXT;
  if (sigilDueling()) return DUEL_TEXT;
  if (pw.sheathed) return SHEATHED_TEXT;
  if (_s.act) return true;
  if (!ctx.ready || pw.machine?.state !== 'Idle' || (pw.machine.now < pw.machine.cooldownUntil)) return true;
  const left = techniqueWait(hand.id);
  if (left > 0) return notReadyText(hand.tech?.en ?? techniqueName(hand), Math.ceil(left));
  // Also leaves room for the fatigue a swing costs, so a technique never spends the last of the player's fatigue.
  if ((ctx.entity.fatigue ?? 0) <= techniqueFatigue(hand.tech) + SWING_FATIGUE_COST) return TIRED_TEXT;
  const t = hand.tech;
  if (t.mech === 'rain' || t.mech === 'pierce') {
    if (!ctx.door?.fireArrow) return NOT_HERE_TEXT;
    if (ammoCountFor(ctx.entity.items, pw.weapon) < 1) return NO_AMMO_TEXT;
  }
  if (t.mech === 'leap' || t.mech === 'dash') return techniqueFlightRefusal(ctx.door?.motor?.(), t.airborne);
  return null;
}

export function techniqueFlightRefusal(m, airborne = false) {
  if (!m) return NOT_HERE_TEXT;
  if (m.climb?.isClimbing || m._wall || m._pkMove || m.swimming || m.onExteriorWater || m.isPlayerSwimming || m.levitating || (m.slowFalling && !m.grounded) || m.riding || m.isDown?.() || (!m.grounded && !airborne)) return CANNOT_LEAP_TEXT;
  if (madeRuleHere('techFlight') === 'refused' && madeOnTraverse()) return madeSaysHere('techFlight');
  return null;
}

function pay(hand, ctx, use) {
  const n = techniqueFatigue(hand.tech);
  if (ctx.door?.drainFatigue) ctx.door.drainFatigue(n);
  else ctx.entity.fatigue = Math.max(0, (ctx.entity.fatigue ?? 0) - n);
  _s.wait[TECH_INDEX[hand.id]] = hand.tech.cooldown;
  tellTechniqueUsed(hand.id, use, ctx.entity);
}

function execute(hand, ctx, target) {
  const t = hand.tech, pw = ctx.pw;
  const use = { id: hand.id };
  if (t.mech === 'swing') {
    const blow = swingBlow(hand.id, hand.value, ctx.cam, { use });
    pw.techniqueBlow = blow;
    if (!ctx.startSwing?.(t.strike)) { pw.techniqueBlow = null; return; }
    pay(hand, ctx, use);
    _s.act = { kind: 'swing', hand, blow, pw, t: 0 };
    cue(hand, 'release', ctx);
    return;
  }
  if (t.mech === 'rain' || t.mech === 'pierce') {
    pw.techniqueBlow = null;
    if (!ctx.startSwing?.('StrikeDown')) return;
    pay(hand, ctx, use);
    _s.act = { kind: 'shot', hand, target, pw, t: 0, loosed: false, weapon: pw.weapon, use };
    cue(hand, 'release', ctx);
    return;
  }
  const m = ctx.door?.motor?.();
  const from = ctx.cam.feet;
  if (!m || !from || !target?.point) return;
  const apex = target.apex ?? (t.mech === 'leap' ? t.apex : DASH_APEX);
  const fl = launchTo(from, target.point, apex);
  if (!m.techniqueLaunch?.(fl.dir, fl.along, fl.up)) { say(CANNOT_LEAP_TEXT); return; }
  pay(hand, ctx, use);
  const lane = t.aim === 'lane' && target.lane ? { from: target.lane.from, dir: target.lane.dir, len: target.lane.len, halfW: target.lane.halfW } : null;
  _s.act = { kind: 'flight', hand, target, pw, t: 0, time: fl.time, struck: false, lane, foe: target.foe ?? null, from: [from[0], from[1], from[2]], use };
  cue(hand, 'release', ctx);
}

function stepAct(dt, ctx) {
  const a = _s.act;
  if (!a) return;
  // Paralysis stops the clock with the machine, so the give-up timer never hands this hit to a plain attack.
  if (ctx.paralyzed && (a.kind === 'swing' || a.kind === 'shot')) return;
  a.t += dt;
  const pw = ctx.pw;
  if (a.kind === 'swing') {
    if (a.blow && !a.blow.lane && ctx.cam?.feet) { a.blow.feet = [...ctx.cam.feet]; if (a.blow.arc !== 'all' && !a.blow.target) a.blow.yaw = ctx.cam.yaw ?? a.blow.yaw; }
    if ((a.t > 0 && pw.machine?.state === 'Idle') || a.t > SWING_GIVE_UP_S) endAct(pw);
    return;
  }
  if (a.kind === 'shot') {
    // The rig may hold the hit until the Morrowind arm releases the string, after the machine is idle.
    if (!a.loosed && !ctx.holding && ((pw.machine?.state === 'Idle' && a.t > 0.05) || a.t > SWING_GIVE_UP_S)) endAct(pw);
    return;
  }
  if (a.kind === 'rain') {
    while (a.lands && a.li < a.lands.length && (a.lands[a.li].t <= a.t || a.t >= a.until)) { cue(a.hand, 'shaft', ctx, { at: a.lands[a.li].at }); a.li++; }
    if (a.lands && a.li === a.lands.length && !a.closed) { a.closed = true; cue(a.hand, 'close', ctx, { at: a.point, r: a.hand.tech.radius }); }
    while (a.queue.length && a.queue[0].at <= a.t) {
      const q = a.queue.shift();
      ctx.door?.fireArrow?.(q.from, q.dir, { sky: true, weapon: a.weapon, technique: { id: a.hand.id, mult: a.mult, pierce: 1, use: a.use }, summoned: q.summoned });
    }
    if (!a.queue.length && a.t >= a.until) _s.act = null;
    return;
  }
  if (a.kind === 'flight') {
    const m = ctx.door?.motor?.();
    const landed = !m || (a.t > 0.08 && m.grounded);
    // The strike starts when the time left in the air equals the swing's time to its hit, so both arrive together.
    const hitAt = a.hitAt ??= strikeHitAt(pw, a.hand.tech.strike, dt);
    if (!a.struck && (landed || a.time - a.t <= hitAt || a.t > a.time + 0.6)) {
      a.struck = true;
      if (!ctx.ready || techniqueInHand(ctx.entity, pw)?.item !== a.hand.item) { endAct(pw); return; }
      if (a.foe && a.hand.tech.mech === 'dash' && !a.lane) ctx.door?.face?.(a.foe.ai?.feet ?? null, a.target?.point ?? null);
      const blow = swingBlow(a.hand.id, a.hand.value, ctx.cam, a.lane ? { lane: a.lane, arc: 'all', reach: a.lane.len, use: a.use }
        : a.hand.tech.mech === 'dash' && a.foe ? { target: a.foe, use: a.use } : { use: a.use });
      pw.techniqueBlow = blow;
      if (ctx.startSwing?.(a.hand.tech.strike)) _s.act = { kind: 'swing', hand: a.hand, blow, pw, t: 0, from: a.from };
      else { pw.techniqueBlow = null; _s.act = null; }
    }
  }
}
function strikeHitAt(pw, strike, dt) {
  try {
    const m = pw?.machine;
    if (!m) return 0;
    const s = blowSchedule({ ...m, state: strike ?? 'StrikeDown' }, pw.liveSpeed, pw.animCtx?.() ?? null, dt);
    return s?.hitAt ?? 0;
  } catch { return 0; }
}
function endAct(pw) {
  const a = _s.act;
  for (const w of [a?.pw, pw]) if (w && a?.blow && w.techniqueBlow === a.blow) w.techniqueBlow = null;
  _s.act = null;
}
function say(line) { try { _s.say?.(line); } catch { } }

// A bow technique takes its own hit frame, so no host looses a plain arrow on it.
export function claimShot(evs, ctx) {
  const a = _s.act;
  if (a?.kind === 'swing' && !a.hitCued && Array.isArray(evs) && evs.includes('hit')) { a.hitCued = true; cue(a.hand, 'hit', ctx, { from: a.from }); }
  if (!a || a.kind !== 'shot' || a.loosed || !Array.isArray(evs) || !evs.includes('hit')) return evs;
  a.loosed = true;
  loose(a, ctx);
  return evs.filter((e) => e !== 'hit');
}
function loose(a, ctx) {
  const { hand } = a, t = hand.tech, weapon = a.weapon ?? ctx.pw?.weapon ?? null, items = ctx.entity?.items;
  const mult = techniqueMult(t.base, hand.value);
  if (t.mech === 'pierce') {
    const shot = { summoned: false };
    if (!spendAmmoFor(items, weapon, shot)) { _s.act = null; return; }
    tallySwingSkills(ctx.entity, weapon);
    const look = lookOf(ctx.cam);
    ctx.door?.fireArrow?.(ctx.cam.pos, look, { sky: false, weapon, technique: { id: hand.id, mult, pierce: t.through, use: a.use }, speedScale: t.speed, summoned: shot.summoned });
    ctx.noteShot?.(weapon);
    const reach = rayHit(ctx.cam.pos, look, t.length, ctx.collider);
    cue(hand, 'loose', ctx, { len: Number.isFinite(reach) ? reach : t.length });
    _s.act = null;
    return;
  }
  let n = 0;
  const conjured = [];
  for (; n < t.arrows; n++) { const shot = { summoned: false }; if (!spendAmmoFor(items, weapon, shot)) break; conjured.push(shot.summoned); tallySwingSkills(ctx.entity, weapon); }
  if (!n || !a.target?.point) { _s.act = null; return; }
  ctx.noteShot?.(weapon);
  cue(hand, 'loose', ctx);
  const c = a.target.point, feet = ctx.cam.feet ?? c;
  let h = t.height;
  try { const up = ctx.collider?.raycast?.([c[0], c[1] + 0.3, c[2]], [0, 1, 0], t.height); if (Number.isFinite(up)) h = Math.max(1.6, up + 0.3 - 0.4); } catch { }
  const toMe = flatDist(c, feet) > 1e-6 ? [(feet[0] - c[0]) / flatDist(c, feet), (feet[2] - c[2]) / flatDist(c, feet)] : [0, 0];
  const queue = volleyPoints(c, t.radius, n, Math.random()).map((p, i) => {
    let from = [p[0] + toMe[0] * h * 0.25, c[1] + h, p[2] + toMe[1] * h * 0.25];
    // Each shaft starts short of any beam, wall, or ceiling on its own line, so none spawns inside geometry.
    const base = [p[0], p[1] + 0.3, p[2]], back = [from[0] - base[0], from[1] - base[1], from[2] - base[2]], bl = Math.hypot(back[0], back[1], back[2]) || 1;
    const blocked = rayHit(base, [back[0] / bl, back[1] / bl, back[2] / bl], bl, ctx.collider);
    if (Number.isFinite(blocked)) from = at(base, [back[0] / bl, back[1] / bl, back[2] / bl], Math.max(0.6, blocked - 0.4));
    const d = [p[0] - from[0], p[1] - from[1], p[2] - from[2]], l = Math.hypot(d[0], d[1], d[2]) || 1;
    return { at: t.delay + (n > 1 ? (t.spread * i) / (n - 1) : 0), from, dir: [d[0] / l, d[1] / l, d[2] / l], to: p, summoned: !!conjured[i] };
  });
  _s.act = { kind: 'rain', hand, point: c, t: 0, queue, mult, until: t.delay + t.spread + h / ARROW_FLIGHT_SPEED + 0.2, weapon, use: a.use };
  _s.act.lands = queue.map((q) => {
    const span = Math.hypot(q.to[0] - q.from[0], q.to[1] - q.from[1], q.to[2] - q.from[2]);
    const hit = rayHit(q.from, q.dir, span + 2, ctx.collider), d = Number.isFinite(hit) ? hit : span;
    return { t: q.at + d / ARROW_FLIGHT_SPEED, at: at(q.from, q.dir, d) };
  }).sort((x, y) => x.t - y.t);
  _s.act.li = 0;
}

const mark = (kind, origin, yaw, sizes, t, flash, ok = true) => ({
  blow: { kind, origin, yaw, start: 0, land: 1, color: ok ? TECH_COLOR : TECH_BAD_COLOR, technique: true, ...sizes },
  phase: { t, flash }, nearFloor: 0.6,
});
const NONE = Object.freeze([]);
export function techniqueMarks(now = 0) {
  if (!_s.aim && !_s.act) return NONE;
  const out = [];
  const pulse = 0.55 + 0.25 * Math.sin(now * 6);
  const a = _s.aim;
  if (a?.target) {
    const g = a.target, t = a.hand.tech;
    if (g.lane && t.mech === 'pierce') out.push(mark('aimed', [g.lane.from[0], g.lane.y, g.lane.from[1]], g.lane.yaw, { ahead: g.lane.len, halfW: g.lane.halfW }, pulse, 0, g.ok));
    else if (g.lane) out.push(mark('lunge', [g.lane.from[0], g.lane.y, g.lane.from[1]], g.lane.yaw, { len: g.lane.len, halfW: g.lane.halfW }, pulse, 0, g.ok));
    if (g.point && (t.mech === 'rain' || t.mech === 'leap')) out.push(mark('leap', g.point, 0, { ahead: 0, r: t.radius }, pulse, 0, g.ok));
    if (g.foe?.ai?.feet && t.aim === 'foe') out.push(mark('leap', g.foe.ai.feet, 0, { ahead: 0, r: 0.9 }, pulse, 0, g.ok));
  }
  const act = _s.act;
  if (act?.kind === 'rain') out.push(mark('leap', act.point, 0, { ahead: 0, r: act.hand.tech.radius }, Math.min(1, act.t / act.until), act.t > act.until - 0.25 ? 1 : 0));
  if (act?.kind === 'swing' && act.blow?.arc === 'all' && !act.blow.lane && act.blow.feet && act.t < 0.6) out.push(mark('leap', act.blow.feet, 0, { ahead: 0, r: act.blow.reach }, Math.min(1, act.t / 0.6), 0));
  return out;
}
export const techniqueMarksNow = (now = undefined) => (!_s.aim && !_s.act ? NONE : techniqueMarks(now ?? (typeof performance !== 'undefined' ? performance.now() / 1000 : 0)));
export const CHIP_UNBOUND = 'unbound';
const _chip = { key: 'technique', set: 'technique', name: '', text: '', state: 'active' };
const _chips = Object.freeze([_chip]);
let _chipSecs = -1, _chipSecsText = '';
/**
 * @param {any} entity
 * @param {any} pw
 * @param {string | (() => string)} [keyName]
 */
export function techniqueHudChips(entity, pw, keyName = '') {
  const hand = techniqueInHand(entity, pw);
  if (!hand || (!hand.signature && !lootRarityOn())) return NONE;
  if (sigilDueling()) return NONE;
  const left = techniqueWait(hand.id);
  _chip.name = techniqueName(hand);
  if (left > 0) {
    const secs = Math.ceil(left);
    if (secs !== _chipSecs) { _chipSecs = secs; _chipSecsText = `${secs}s`; }
    _chip.text = _chipSecsText; _chip.state = 'recovering';
  } else {
    _chip.text = (typeof keyName === 'function' ? keyName() : keyName) || CHIP_UNBOUND; _chip.state = 'active';
  }
  return _chips;
}
// A floating-origin recenter must move every stored point here: the aim, the flight, and each falling shaft.
export function offsetTechniques(offset) {
  if (!offset) return;
  const move = (p) => { if (p != null && p.length >= 3) { p[0] += offset[0]; p[1] += offset[1]; p[2] += offset[2]; } };
  const a = _s.aim?.target;
  if (a) { move(a.point); if (a.lane) { a.lane.from[0] += offset[0]; a.lane.from[1] += offset[2]; } }
  const act = _s.act;
  if (act) {
    move(act.point);
    if (act.target) move(act.target.point);
    if (act.lane) { act.lane.from[0] += offset[0]; act.lane.from[1] += offset[2]; }
    if (act.blow) { move(act.blow.feet); if (act.blow.lane) { act.blow.lane.from[0] += offset[0]; act.blow.lane.from[1] += offset[2]; } }
    for (const q of act.queue ?? []) { move(q.from); move(q.to); }
    move(act.from);
    for (const l of act.lands ?? []) move(l.at);
  }
}
// The rig ignores attack input while this is true, so a click in the air cannot start a plain swing.
export const techniqueFlying = () => _s.act?.kind === 'flight';
export function techniqueState() {
  const wait = new Map();
  for (let i = 0; i < TECH_IDS.length; i++) if (_s.wait[i] > 0) wait.set(TECH_IDS[i], _s.wait[i]);
  return { aiming: !!_s.aim, aim: _s.aim?.target ?? null, act: _s.act?.kind ?? null, wait };
}
export function _resetTechniquesForTests() { _s = fresh(); resetTechniqueFx(); _handMemo = null; _sigMemo = null; }
