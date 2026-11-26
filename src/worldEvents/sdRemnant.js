// @ts-check
import { SD_ARENA, SD_REALM_ORIGIN, realmToDungeon } from '../net/sdBrain.js';
import { SD_REM, SD_ECHO, SD_HEART, SD_REM_START, SD_BREAK_MS, SD_BLOWS, SD_BLOW_BY_ID, SD_BODY, SD_HEARTS_CLOSE_MS, SD_HEARTS, SD_STUN_MS, SD_PULSE_EVERY_MS, SD_ECHO_PAIR_MS, inArena, atkWindup, blowShape, sdProfileOf } from '../net/sdRemnant.js';
import { HIT_KINDS, wrapYaw } from '../net/gateBrain.js';
import { sdBodyAt, sdHeartsOf, sdHourOver, SD_FIGHT_EMPTY } from '../net/sdFightLink.js';
import { SD_REALM_ARCHIVE, SD_REALM_BRASS_RECORD } from '../world/sdRealm.js';
import { remnantArt, remnantLookArt, SD_REMNANT_ARCHIVE, SD_REMNANT_TELL_RECORD, SD_REMNANT_WHITE_RECORD, SD_REMNANT_HUSK_RECORD, SD_REMNANT_HAND_RECORD, SD_REMNANT_LAMP_RECORD, SD_REMNANT_GATHER_RECORD } from '../world/sdRemnantArt.js';
import { ensureSdHallArt } from './sdHall.js';
import { buildRemnantParts, buildHeartModel, buildGearModel, buildBackDialModel, buildDialHandModel, buildRibLampsModel, buildTornHeartModel, heartRecordOf, remnantMatrix, remnantScale, SD_REMNANT_BODY } from '../world/sdRemnantModel.js';
import { SD_ENDINGS } from '../net/sdMarks.js';
import { sdTick, handToTwelve } from '../world/sdLook.js';
import { SD_BLOW_COLOR } from './sdRemnantBlows.js';
import { remnantRig, rigMatrices, restRig, sdGearsAt, sdGatherGearsAt, gearMatrix, gatherGearMatrix, gearFlightOf, sdKeptList, dialHandMatrix, dialFallMatrix, heartFallMatrix, SD_RIG_PARTS, SD_REM_HAND } from './sdRemnantRig.js';
import { bossStandIn, crystalStandIn, hostStandIn } from '../world/gateBoss.js';
import { wordShare } from '../combat/healthShare.js';

export const SD_REMNANT_MOBILE = 36;
export const SD_REMNANT_NAMES = Object.freeze({ remnant: 'The Brass Remnant', echoes: Object.freeze(['The Gold Echo', 'The Silver Echo']), heart: 'Heart of the Hour' });
export const SD_KNEEL_M = 1.6;
export const SD_REM_SINK_MS = 4000;
export const SD_ECHO_SINK_MS = 1500;
export const SD_HEART_SPIN = 0.9;
export const SD_KNEEL_EASE_MS = 400;
// `SD_TURN_RATE` gives a half-turn in about 0.9 s, inside the shortest wind-up of a facing-aimed blow, so the drawn
// facing reaches the server facing before the blow lands.
export const SD_TURN_RATE = 3.5;
export const sdTurnToward = (was, to, dt, rate = SD_TURN_RATE) => {
  if (was == null || !Number.isFinite(was)) return to;
  const d = wrapYaw(to - was), step = rate * Math.max(0, dt || 0);
  return Math.abs(d) <= step ? to : wrapYaw(was + Math.sign(d) * step);
};
// Keep `hz` at or below 3: the heart light flashes at this rate, and faster flashing is a photosensitivity hazard.
export const SD_HEART_LIGHT = Object.freeze({ range: 9, rest: 0.7, beat: 0.45, flare: 2.5, hz: Object.freeze([0.6, 2.5]), echo: Object.freeze([Object.freeze([1.0, 0.8, 0.42]), Object.freeze([0.8, 0.86, 1.0])]) });
const MANTELLA_LIGHT = Object.freeze([0.45, 1.0, 0.6]);
export function sdHeartBeat(s, t, pulseAt) {
  const from = Number.isFinite(pulseAt) && pulseAt <= t ? pulseAt : (s?.op ?? 0), tau = Math.max(0, (t - from) / 1000);
  const h0 = SD_HEART_LIGHT.hz[0], h1 = SD_HEART_LIGHT.hz[1], T = SD_PULSE_EVERY_MS / 1000, k = Math.min(tau, T);
  const phase = h0 * k + ((h1 - h0) * k * k) / (2 * T) + h1 * (tau - k);
  const f = phase - Math.floor(phase);
  return f < 0.15 ? f / 0.15 : Math.exp(-(f - 0.15) * 5);
}
export const SD_GEAR_DRAWS = SD_BLOWS.volley.max * 3;
export const SD_DECOR_DRAWS = Object.freeze(['dial', 'hand', 'dial', 'hand', 'dial', 'hand', 'lamps', 'torn']);
const ZERO = new Float32Array(16);
const NONE = Object.freeze([]);
// Shared by every hidden heart, so nothing may write to it; it stays unfrozen to keep the same object shape as the
// pose scratch objects.
const HIDDEN = { x: 0, z: 0, yw: 0, sink: 0, shown: false };
const _remPose = { x: 0, z: 0, yw: 0, sink: 0, shown: false };
const _bodyAt = [0, 0];
const _gears = sdKeptList();
const _forming = sdKeptList();
const _echoPose = { x: 0, z: 0, yw: 0, sink: 0, shown: false };
const _heartPose = { x: 0, z: 0, yw: 0, sink: 0, shown: true };
const ECHO_SCALE = remnantScale(true);
const posed = (out, x, z, yw, sink, shown) => { out.x = x; out.z = z; out.yw = yw; out.sink = sink; out.shown = shown; return out; };

const _uploaded = new WeakSet();
export function ensureSdRemnantArt(renderer) {
  if (!renderer || _uploaded.has(renderer) || typeof renderer.uploadTexture !== 'function') return;
  _uploaded.add(renderer);
  for (const [rec, art] of remnantArt()) { renderer.uploadTexture(SD_REALM_ARCHIVE, rec, art.albedo); renderer.uploadEmissionTexture?.(SD_REALM_ARCHIVE, rec, art.emission, { white: true }); }
  for (const [rec, art] of remnantLookArt(SD_BLOW_COLOR)) { renderer.uploadTexture(SD_REMNANT_ARCHIVE, rec, art.albedo); renderer.uploadEmissionTexture?.(SD_REMNANT_ARCHIVE, rec, art.emission, { white: true }); }
}

export const SD_TELLS = Object.freeze(['stomp', 'hand', 'volley', 'pulse', 'reset']);
export const SD_TELL_HEAT = Object.freeze([0.1, 0.6]);
export const SD_TELL_AFTER_MS = Object.freeze({ stomp: 300, pulse: 600 });
const T_STOMP = 0, T_HAND = 1, T_VOLLEY = 2, T_PULSE = 3, T_RESET = 4;
/**
 * @param {any} s
 * @param {number} who
 * @param {number} t
 * @param {Uint8Array} [out]
 */
export function sdTellsAt(s, who, t, out = new Uint8Array(SD_TELLS.length)) {
  const k = _share;
  k.fill(-1);
  if (live(s) && !s.fell) {
    const Bd = who < 0 ? s.rem : s.ec?.[who] ?? null;
    if (Bd && (who < 0 ? s.ph !== 2 : Bd.h > 0)) {
      const C = s.clk;
      if (C && C.a === SD_BLOWS.pulse.id && Number.isFinite(C.at)) {
        const w = SD_BLOWS.pulse.windup;
        k[T_PULSE] = t < C.at ? (t >= C.at - w ? (t - (C.at - w)) / w : -1) : t < C.at + SD_TELL_AFTER_MS.pulse ? 1 : -1;
      }
      const a = Bd.atk, A = a ? SD_BLOW_BY_ID[a.a] : null;
      if (A && Number.isFinite(a.at) && !(who < 0 && t < s.su)) {
        const w = atkWindup(a, A, s.ph, who >= 0 ? SD_BODY.gold + who : SD_BODY.remnant), t0 = a.at - w, f = t < t0 ? -1 : w > 0 ? (t - t0) / w : 1;
        if (A === SD_BLOWS.stomp) k[T_STOMP] = t < a.at ? f : t < a.at + SD_TELL_AFTER_MS.stomp ? 1 : -1;
        else if (A === SD_BLOWS.hand) k[T_HAND] = t < a.at ? f : t < a.at + activeOf(a) ? 1 : -1;
        else if (A === SD_BLOWS.volley) { const go = a.at - gearFlightOf(w); k[T_VOLLEY] = t < t0 || t >= go ? -1 : (t - t0) / Math.max(1, go - t0); }
        else if (A === SD_BLOWS.reset) k[T_RESET] = t < a.at ? f : -1;
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = k[i] >= SD_TELL_HEAT[1] ? 2 : k[i] >= SD_TELL_HEAT[0] ? 1 : 0;
  return out;
}
const _share = new Float64Array(SD_TELLS.length);
export const SD_DIAL_LOOK = Object.freeze(['cold', 'ember', 'gold', 'silver', 'white']);
export const SD_DIAL_TURNS = Object.freeze({ hand: 4, reset: 3 });
const TAU = Math.PI * 2;
let _pairMk = /** @type {any} */ (undefined), _pairMs = SD_ECHO_PAIR_MS;
const pairMsOf = (s) => { if (s.mk !== _pairMk) { _pairMk = s.mk; _pairMs = sdProfileOf(s).pairMs; } return _pairMs; };
let _spanAtk = /** @type {any} */ (null), _spanMs = 0;
const activeOf = (a) => { if (a !== _spanAtk) { _spanAtk = a; _spanMs = blowShape(a).active; } return _spanMs; };
/**
 * @param {any} s
 * @param {number} who
 * @param {number} t
 * @param {Float64Array} [out]
 */
export function sdDialHandAt(s, who, t, out = new Float64Array(2)) {
  const tk = who < 0 && s.fell && s.fell.at < t ? sdTick(s.fell.at / 1000) : sdTick(t / 1000);
  // Reduce the tick count modulo 60 before scaling; the raw count is large enough to lose precision in the angle.
  out[0] = (-TAU / 60) * (tk % 60); out[1] = 0;
  if (!live(s) || (who < 0 && s.fell)) return out;
  const Bd = who < 0 ? s.rem : s.ec?.[who] ?? null;
  if (!Bd) return out;
  if (who < 0 && t < s.su) { out[0] = TAU * handToTwelve(s.su - t, SD_STUN_MS); out[1] = 1; return out; }
  const a = Bd.atk, A = a ? SD_BLOW_BY_ID[a.a] : null, w = A ? atkWindup(a, A, s.ph, who >= 0 ? SD_BODY.gold + who : SD_BODY.remnant) : 0;
  if (A === SD_BLOWS.reset && t >= a.at - w && t < a.at) { out[0] = TAU * SD_DIAL_TURNS.reset * handToTwelve(a.at - t, w); out[1] = 4; return out; }
  if (who >= 0 && Bd.h > 0) {
    const P = s.ec[1 - who], ms = P ? pairMsOf(s) : 0;
    if (P && !(P.h > 0) && P.dn > 0 && t < P.dn + ms) { out[0] = TAU * handToTwelve(P.dn + ms - t, ms); out[1] = who === 0 ? 3 : 2; return out; }
  }
  if (A === SD_BLOWS.hand && Number.isFinite(a.at)) {
    const span = w + activeOf(a), k = (t - (a.at - w)) / span;
    if (k > 0 && k < 1) out[0] -= TAU * SD_DIAL_TURNS.hand * k * k;
  }
  return out;
}
export function sdRibLampsLit(s, t) {
  const cx = live(s) && !s.fell ? sdHeartsOf(s, t) : null;
  if (!cx) return 0;
  let n = 0;
  for (let c = 0; c < cx.c.length; c++) if (cx.c[c][2] > 0) n++;
  return Math.min(SD_REMNANT_LAMP_RECORD.length - 1, n);
}
// Matches the renderer texture key (archive and record joined by an underscore), so a remap entry finds its
// texture.
const recKey = (archive, rec) => `${archive}_${rec}`;
const remapOf = (pairs) => (pairs.length ? new Map(pairs.map(([a, b]) => [recKey(a[0], a[1]), recKey(b[0], b[1])])) : null);

export const arenaToDungeon = (x, z) => realmToDungeon(SD_ARENA.x + x, 0, SD_ARENA.z + z);
const live = (s) => s.fi > 0 && !s.lost;

/**
 * @param {any} s
 * @param {number} now
 * @param {any} [out]
 */
export function remnantPose(s, now, out = { x: 0, z: 0, yw: 0, sink: 0, shown: false }) {
  if (s.fi > 0 && s.lost > 0 && !s.fell) {
    const since = Math.max(0, now - s.lost);
    if (since < SD_REM_SINK_MS) {
      const [x, z] = s.rem ? sdBodyAt(s.rem, s.lost) : SD_REM_START;
      return posed(out, x, z, s.rem?.yw ?? Math.PI, (since / SD_REM_SINK_MS) * SD_REM.h, s.ph !== 2);
    }
    const up = since - SD_REM_SINK_MS;
    return posed(out, SD_REM_START[0], SD_REM_START[1], Math.PI, up < SD_BREAK_MS ? (1 - up / SD_BREAK_MS) * SD_REM.h : 0, true);
  }
  if (!live(s)) return posed(out, SD_REM_START[0], SD_REM_START[1], Math.PI, 0, true);
  const B = s.rem;
  if (s.fell) {
    const sink = (Math.max(0, now - s.fell.at) / SD_REM_SINK_MS) * SD_REM.h;
    return posed(out, B.x, B.z, B.yw, Math.min(SD_REM.h, sink), sink < SD_REM.h);
  }
  if (s.ph === 2) return posed(out, B.x, B.z, B.yw, 0, false);
  const at = sdBodyAt(B, now, _bodyAt), x = at[0], z = at[1];
  const rising = now < s.ou ? Math.min(1, (s.ou - now) / SD_BREAK_MS) * SD_REM.h : 0;
  const kneel = now < s.su ? SD_KNEEL_M * Math.max(0, Math.min(1, (now - (s.su - SD_STUN_MS)) / SD_KNEEL_EASE_MS, (s.su - now) / SD_KNEEL_EASE_MS)) : 0;
  return posed(out, x, z, B.yw, Math.max(rising, kneel), true);
}
/**
 * @param {any} s
 * @param {number} e
 * @param {number} now
 * @param {any} [out]
 */
export function echoPose(s, e, now, out = { x: 0, z: 0, yw: 0, sink: 0, shown: false }) {
  const L = s.fi > 0 && s.lost > 0 && !s.fell && s.ph === 2 ? s.ec?.[e] ?? null : null;
  if (L && L.h > 0) {
    const sink = (Math.max(0, now - s.lost) / SD_ECHO_SINK_MS) * SD_ECHO.h, [x, z] = sdBodyAt(L, s.lost);
    return posed(out, x, z, L.yw, Math.min(SD_ECHO.h, sink), sink < SD_ECHO.h);
  }
  const E = live(s) && !s.fell && s.ph === 2 ? s.ec?.[e] ?? null : null;
  if (!E) return posed(out, 0, 0, 0, SD_ECHO.h, false);
  if (!(E.h > 0)) {
    const sink = E.dn > 0 ? (Math.max(0, now - E.dn) / SD_ECHO_SINK_MS) * SD_ECHO.h : SD_ECHO.h;
    return posed(out, E.x, E.z, E.yw, Math.min(SD_ECHO.h, sink), sink < SD_ECHO.h);
  }
  const at = sdBodyAt(E, now, _bodyAt);
  return posed(out, at[0], at[1], E.yw, now < E.up ? Math.min(1, (E.up - now) / SD_BREAK_MS) * SD_ECHO.h : 0, true);
}
// Mirrors `heartsOpen` in net/sdRemnant.js on the client fight state; keep the two checks in sync.
export function heartsOpenAt(s, now) {
  return live(s) && !s.fell && !!sdHeartsOf(s, now) && now < s.rem.atk.at - SD_HEARTS_CLOSE_MS;
}
// Mirrors `remnantOpen` in net/sdRemnant.js on the client fight state; keep the two checks in sync.
export function remnantOpenAt(s, now) {
  return live(s) && !s.fell && !sdHourOver(s, now) && now >= s.op && s.ph !== 2 && now >= s.ou;
}

/** @param {{ renderer?: any, link?: () => any, sendIn?: () => boolean, sendBlow?: (k: string, fields: any) => boolean, alive?: () => boolean, ending?: string|null }} deps */
export function createSdRemnant({ renderer = null, link = () => null, sendIn = () => false, sendBlow = () => false, alive = () => true, ending = null }) {
  /** @type {any[]|null} */
  let draws = null;
  const meshes = [];
  let remDraw = null;
  const echoDraws = [], heartDraws = [];
  const heartLights = Array.from({ length: 3 }, () => ({ x: 0, y: 0, z: 0, range: 0, color: [0, 0, 0] })), litList = [];
  const heartColor = SD_ENDINGS.find((E) => E.id === ending)?.light ?? MANTELLA_LIGHT;
  let pulseAt = -Infinity;
  const partDraws = [[], [], []], gearDraws = [];
  const _rig = restRig(), _parts = SD_RIG_PARTS.map(() => new Float32Array(16));
  const dialDraws = [], handDraws = [];
  let lampDraw = null, tornDraw = null;
  const heartRec = heartRecordOf(ending);
  const tellMaps = ['brass', 'gold', 'silver'].map((m) => { const T = SD_REMNANT_TELL_RECORD[m]; return [0, 1, 2].map((h) => remapOf(h ? [[[SD_REMNANT_ARCHIVE, T[0]], [SD_REMNANT_ARCHIVE, T[h]]]] : [])); });
  const torsoMaps = ['brass', 'gold', 'silver'].map((m) => {
    const T = SD_REMNANT_TELL_RECORD[m], out = [];
    for (let p = 0; p < 3; p++) for (let h = 0; h < 4; h++) {
      const pairs = [];
      if (p) pairs.push([[SD_REMNANT_ARCHIVE, T[0]], [SD_REMNANT_ARCHIVE, T[p]]]);
      if (h) pairs.push([[SD_REALM_ARCHIVE, heartRec], [SD_REMNANT_ARCHIVE, h === 3 ? SD_REMNANT_HUSK_RECORD : SD_REMNANT_WHITE_RECORD[h - 1]]]);
      out.push(remapOf(pairs));
    }
    return out;
  });
  const handMaps = SD_DIAL_LOOK.map((look) => remapOf(look === 'cold' ? [] : [[[SD_REMNANT_ARCHIVE, SD_REMNANT_HAND_RECORD.cold], [SD_REMNANT_ARCHIVE, SD_REMNANT_HAND_RECORD[look]]]]));
  const lampMaps = SD_REMNANT_LAMP_RECORD.map((rec, n) => remapOf(n ? [[[SD_REMNANT_ARCHIVE, SD_REMNANT_LAMP_RECORD[0]], [SD_REMNANT_ARCHIVE, rec]]] : []));
  const gatherMap = remapOf([[[SD_REALM_ARCHIVE, SD_REALM_BRASS_RECORD], [SD_REMNANT_ARCHIVE, SD_REMNANT_GATHER_RECORD]]]);
  const _tells = new Uint8Array(SD_TELLS.length), _hand = new Float64Array(2), _fellBase = new Float32Array(16);
  let fellOf = null;
  const _fellHand = new Float64Array(2);
  const standIn = bossStandIn({ mobile: SD_REMNANT_MOBILE }, SD_REMNANT_NAMES.remnant, () => { const { s } = read(); return wordShare(s.h, s.m); });
  const echoIns = [0, 1].map((e) => hostStandIn({ mobile: SD_REMNANT_MOBILE, name: SD_REMNANT_NAMES.echoes[e] }, e, () => { const E = read().s.ec?.[e]; return wordShare(E?.h, E?.m); }));
  const heartIns = Array.from({ length: SD_HEARTS[1] }, (_, c) => { const h = crystalStandIn({ mobile: SD_REMNANT_MOBILE }, c, () => { const { s } = read(); return wordShare(s.cx?.c?.[c]?.[2], s.cx?.m); }); h.name = SD_REMNANT_NAMES.heart; return h; });
  let blowSeq = 0;
  const blowMet = new Set();
  const facing = new Float64Array(3).fill(NaN);
  const turn = (p, k, dt) => {
    if (!p.shown) facing[k] = NaN;
    else if (facing[k] !== p.yw) facing[k] = p.yw = sdTurnToward(facing[k], p.yw, dt);
    return p;
  };
  // Bodies hit by one attack in the same frame share a sequence number, which `spendBlow` charges as one blow. A
  // repeat hit on a body already hit opens a new sequence.
  function blowQ(who) {
    if (!blowMet.size || blowMet.has(who)) { blowSeq = (blowSeq + 1) & 0x7fffffff; blowMet.clear(); }
    blowMet.add(who);
    return blowSeq;
  }
  const make = (model) => { if (!model || !renderer?.createMesh) return null; try { const m = renderer.createMesh(model); if (m) meshes.push(m); return m; } catch (e) { console.warn('[sd] the Remnant would not build', e?.message ?? e); return null; } };
  const drop = (mesh) => { if (mesh) { try { renderer?.destroyMesh?.(mesh); } catch { } } };
  const hide = (d) => { if (d && !d.hidden) { d.object.matrix.set(ZERO); d.hidden = true; } };
  const place = (d, p, scale) => {
    if (!d) return;
    if (!p.shown) { hide(d); return; }
    const was = d.posed;
    if (!d.hidden && was[0] === p.x && was[1] === p.z && was[2] === p.yw && was[3] === p.sink && was[4] === scale) return;
    was[0] = p.x; was[1] = p.z; was[2] = p.yw; was[3] = p.sink; was[4] = scale;
    remnantMatrix(SD_REALM_ORIGIN[0] + SD_ARENA.x + p.x, SD_REALM_ORIGIN[1] - p.sink, SD_REALM_ORIGIN[2] + SD_ARENA.z + p.z, p.yw, scale, d.object.matrix);
    d.hidden = false;
  };
  const limbs = (list, body, who, s, t) => {
    if (!body || body.hidden) { for (const d of list) hide(d); return; }
    rigMatrices(body.object.matrix, remnantRig(s, who, t, _rig), _parts);
    for (let i = 0; i < list.length; i++) { const d = list[i]; if (!d) continue; d.object.matrix.set(_parts[i]); d.hidden = false; }
  };
  const formAt = (f) => {
    const arm = partDraws[f.who + 1]?.[4 + f.h];
    if (!arm || arm.hidden) return false;
    const m = arm.object.matrix, p = SD_REM_HAND[f.h];
    f.x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]; f.y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]; f.z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
    return true;
  };
  const decor = (b, s, t) => {
    const list = partDraws[b], torso = list[2], dial = dialDraws[b], hand = handDraws[b], who = b - 1;
    const shown = !!torso && !torso.hidden;
    if (shown) {
      const tl = sdTellsAt(s, who, t, _tells), fellNow = b === 0 && !!s.fell && t >= s.fell.at, T = tellMaps[b];
      if (list[0]) list[0].texRemap = T[tl[T_STOMP]];
      if (list[4]) list[4].texRemap = T[tl[T_HAND]];
      if (list[5]) list[5].texRemap = T[tl[T_VOLLEY]];
      torso.texRemap = torsoMaps[b][tl[T_PULSE] * 4 + (fellNow ? 3 : tl[T_RESET])];
    }
    const fallen = shown && b === 0 && !!s.fell;
    if (shown && !fallen) sdDialHandAt(s, who, t, _hand);
    let on = null;
    if (fallen) {
      if (s.fell !== fellOf) { const B = s.rem; fellOf = s.fell; remnantMatrix(SD_REALM_ORIGIN[0] + SD_ARENA.x + B.x, SD_REALM_ORIGIN[1], SD_REALM_ORIGIN[2] + SD_ARENA.z + B.z, B.yw, 1, _fellBase); sdDialHandAt(s, who, t, _fellHand); }
      _hand.set(_fellHand);
      on = dial ? dialFallMatrix(_fellBase, s.fell, t, dial.object.matrix) : null;
      if (tornDraw) { if (heartFallMatrix(_fellBase, s.fell, t, tornDraw.object.matrix)) tornDraw.hidden = false; else hide(tornDraw); }
    } else {
      if (b === 0) hide(tornDraw);
      if (shown && dial) { dial.object.matrix.set(torso.object.matrix); on = dial.object.matrix; }
    }
    if (dial) { if (on) dial.hidden = false; else hide(dial); }
    if (hand) { if (on) { dialHandMatrix(on, _hand, hand.object.matrix); hand.texRemap = handMaps[_hand[1]]; hand.hidden = false; } else hide(hand); }
    if (b === 0 && lampDraw) {
      if (shown) { lampDraw.object.matrix.set(torso.object.matrix); lampDraw.texRemap = lampMaps[sdRibLampsLit(s, t)]; lampDraw.hidden = false; } else hide(lampDraw);
    }
  };
  const read = () => { const L = link(); return L ? { L, s: L.state(), t: L.now() } : { L: null, s: SD_FIGHT_EMPTY, t: 0 }; };

  return {
    stand({ dynamicDraws }) {
      if (draws) return false;
      draws = dynamicDraws;
      ensureSdHallArt(renderer);
      ensureSdRemnantArt(renderer);
      const add = (mesh, noShadow = false) => { if (!mesh) return null; const d = { gpu: mesh, object: { matrix: new Float32Array(ZERO) }, hidden: true, posed: new Float64Array(5), texRemap: null, noShadow }; draws.push(d); return d; };
      const bodies = ['brass', 'gold', 'silver'].map((metal) => buildRemnantParts(metal, ending).map(make));
      const heartMesh = make(buildHeartModel(ending));
      remDraw = add(bodies[0][0]);
      echoDraws.push(add(bodies[1][0]), add(bodies[2][0]));
      for (let c = 0; c < SD_HEARTS[1]; c++) heartDraws.push(add(heartMesh));
      bodies.forEach((parts, b) => { for (const m of parts.slice(1)) partDraws[b].push(add(m)); });
      const gearMesh = make(buildGearModel());
      for (let g = 0; g < SD_GEAR_DRAWS; g++) gearDraws.push(add(gearMesh));
      const handMesh = make(buildDialHandModel());
      ['brass', 'gold', 'silver'].forEach((metal) => { dialDraws.push(add(make(buildBackDialModel(metal)), true)); handDraws.push(add(handMesh, true)); });
      lampDraw = add(make(buildRibLampsModel()), true);
      tornDraw = add(make(buildTornHeartModel(ending)), true);
      return true;
    },
    frame(dt, feet) {
      if (blowMet.size) blowMet.clear();
      const L = link(), s = L ? L.state() : SD_FIGHT_EMPTY, t = L ? L.now() : 0;
      if (L && feet && alive()) {
        const ax = feet[0] - SD_REALM_ORIGIN[0] - SD_ARENA.x, az = feet[2] - SD_REALM_ORIGIN[2] - SD_ARENA.z;
        if (inArena(ax, az) && L.inDue(t) && sendIn()) L.sentIn(t);
      }
      if (!draws) return;
      place(remDraw, turn(remnantPose(s, t, _remPose), 0, dt), 1);
      limbs(partDraws[0], remDraw, -1, s, t);
      decor(0, s, t);
      for (let e = 0; e < echoDraws.length; e++) { place(echoDraws[e], turn(echoPose(s, e, t, _echoPose), 1 + e, dt), ECHO_SCALE); limbs(partDraws[1 + e], echoDraws[e], e, s, t); decor(1 + e, s, t); }
      const gears = live(s) ? sdGearsAt(s, t, _gears) : NONE;
      for (let g = 0; g < gearDraws.length; g++) {
        const d = gearDraws[g], q = gears[g];
        if (!d) continue;
        if (!q) { hide(d); continue; }
        gearMatrix(q.x, q.y, q.z, q.spin, d.object.matrix, q.yaw); d.hidden = false; d.texRemap = null;
      }
      const forming = live(s) ? sdGatherGearsAt(s, t, _forming) : NONE;
      for (let i = 0, g = gears.length; i < forming.length && g < gearDraws.length; i++) {
        const d = gearDraws[g], f = forming[i];
        if (d && formAt(f)) { gatherGearMatrix(f, d.object.matrix); d.texRemap = gatherMap; d.hidden = false; g++; }
      }
      const cx = live(s) && !s.fell ? sdHeartsOf(s, t) : null;
      for (let c = 0; c < heartDraws.length; c++) {
        const q = cx?.c[c];
        place(heartDraws[c], q && q[2] > 0 ? posed(_heartPose, q[0], q[1], (t / 1000) * SD_HEART_SPIN + c, 0, true) : HIDDEN, 1);
      }
    },
    // Height and radius come from `SD_REM` because the server measures melee reach against the same body.
    target() {
      const { L, s, t } = read();
      if (!L?.joined() || s.fell || sdHourOver(s, t) || s.ph === 2) return null;
      const p = remnantPose(s, t);
      return { feet: arenaToDungeon(p.x, p.z), yaw: p.yw, height: SD_REM.h, radius: SD_REM.r, warded: !remnantOpenAt(s, t), entity: standIn, mobile: SD_REMNANT_MOBILE };
    },
    hit({ d, r } = /** @type {any} */ ({})) {
      const { L, s, t } = read();
      if (!L?.joined() || !remnantOpenAt(s, t) || !Object.values(HIT_KINDS).includes(r)) return false;
      const dmg = Math.round(d);
      if (!(dmg >= 1)) return false;
      return !!sendBlow('hit', { q: blowQ('b'), d: dmg, r });
    },
    echoTargets() {
      const { L, s, t } = read();
      if (!L?.joined() || s.ph !== 2 || !s.ec) return NONE;
      const out = [];
      for (let e = 0; e < s.ec.length; e++) {
        const E = s.ec[e];
        if (!(E.h > 0) || t < E.up) continue;
        const [x, z] = sdBodyAt(E, t);
        out.push({ i: e, m: E.m, feet: arenaToDungeon(x, z), height: SD_ECHO.h, radius: SD_ECHO.r, entity: echoIns[e], mobile: SD_REMNANT_MOBILE });
      }
      return out;
    },
    echoHit({ i, d, r } = /** @type {any} */ ({})) {
      const { L, s, t } = read();
      const E = Number.isInteger(i) ? s.ec?.[i] : null;
      if (!L?.joined() || s.ph !== 2 || !E || !(E.h > 0) || t < E.up || !Object.values(HIT_KINDS).includes(r)) return false;
      const dmg = Math.round(d);
      if (!(dmg >= 1)) return false;
      return !!sendBlow('ehit', { e: i, q: blowQ(`e${i}`), d: dmg, r });
    },
    heartTargets() {
      const { L, s, t } = read();
      if (!L?.joined() || !heartsOpenAt(s, t)) return NONE;
      const out = [];
      s.cx.c.forEach((q, c) => { if (q[2] > 0 && heartIns[c]) out.push({ c, feet: arenaToDungeon(q[0], q[1]), height: SD_HEART.h, radius: SD_HEART.r, entity: heartIns[c] }); });
      return out;
    },
    heartHit({ c, d, r } = /** @type {any} */ ({})) {
      const { L, s, t } = read();
      const q = Number.isInteger(c) ? s.cx?.c[c] : null;
      if (!L?.joined() || !heartsOpenAt(s, t) || !q || !(q[2] > 0) || !Object.values(HIT_KINDS).includes(r)) return false;
      const dmg = Math.round(d);
      if (!(dmg >= 1)) return false;
      return !!sendBlow('xhit', { c, q: blowQ(`x${c}`), d: dmg, r });
    },
    lights() {
      let n = 0;
      if (!draws) { if (litList.length) litList.length = 0; return litList; }
      const L = link(), s = L ? L.state() : SD_FIGHT_EMPTY, t = L ? L.now() : 0, H = SD_HEART_LIGHT;
      const clk = s.clk;
      if (clk && clk.a === SD_BLOWS.pulse.id && clk.at <= t && clk.at > pulseAt) pulseAt = clk.at;
      const flare = (clk && clk.a === SD_BLOWS.pulse.id && t >= clk.at - SD_BLOWS.pulse.windup && t < clk.at + 600)
        || (s.rem?.atk?.a === SD_BLOWS.reset.id && t < s.rem.atk.at && !(s.su > t)) ? H.flare : 1;
      const k = (H.rest + H.beat * sdHeartBeat(s, t, pulseAt)) * flare;
      for (let b = 0; b < heartLights.length; b++) {
        const d = b === 0 ? remDraw : echoDraws[b - 1], torso = partDraws[b]?.[2];
        if (!d || d.hidden || !torso || torso.hidden) continue;
        const torn = b === 0 && s.fell ? tornDraw : null;
        if (b === 0 && s.fell && (!torn || torn.hidden)) continue;
        const m = torn ? torn.object.matrix : torso.object.matrix, y = torn ? 0 : SD_REMNANT_BODY.heartY, o = heartLights[b], c = b === 0 ? heartColor : H.echo[b - 1];
        o.x = m[4] * y + m[12]; o.y = m[5] * y + m[13]; o.z = m[6] * y + m[14];
        o.range = H.range * (b === 0 ? 1 : ECHO_SCALE);
        o.color[0] = c[0] * k; o.color[1] = c[1] * k; o.color[2] = c[2] * k;
        litList[n++] = o;
      }
      if (litList.length !== n) litList.length = n;
      return litList;
    },
    clear() {
      for (const m of meshes) drop(m);
      meshes.length = 0;
      remDraw = null; echoDraws.length = 0; heartDraws.length = 0; draws = null;
      for (const l of partDraws) l.length = 0;
      gearDraws.length = 0;
      dialDraws.length = 0; handDraws.length = 0; lampDraw = null; tornDraw = null;
    },
  };
}
