// @ts-check
import {
  KT_CRADLES, KT_BRIDGE_CRADLES, KT_SOCKETS, KT_HAMMER, KT_STEAM, KT_ARCS, KT_SECTIONS, KT_LIFT, KT_LIFT_CYCLE, KT_HATCH, KT_HOLD_HATCH,
  KT_CABIN, KT_GANGWAY, liftYAt, deckZoneAt, hammerPhase,
} from '../../net/ketch/ketchDeck.js';
import { KT_STAGE, ketchVoyageOf } from '../../net/ketch/ketchLaw.js';
import { KT_CELL_LIES_MS, KT_CRADLE_BACK_MS, KT_BRIDGE_CRADLE_BACK_MS, KT_SPIDER_EVERY_MS, KT_WAVE_GAP_MS, spidersMaxFor } from '../../net/ketch/ketchBrain.js';
import { KW_SECTION_WARN_MS } from '../../net/ketch/ketchWarden.js';
import { KT_KIND_BY_K } from '../../net/ketch/ketchConstructs.js';
import { hazardState } from './ketchPose.js';

export const KT_SHIP = Object.freeze({ asleep: 0, awake: 1, singing: 2 });
export const KT_LIFT_PART = Object.freeze({ foot: 0, rising: 1, top: 2, falling: 3 });
// Must equal KT_LOOSE_MAX in ketchDeckHost.js, which draws this many loose cells.
export const KT_STATES_LOOSE = 16;

const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const _hz = { live: false, warn: false, k: 0 };

export function ketchStatesRecord() {
  return {
    ship: /** @type {number} */ (KT_SHIP.asleep), sg: /** @type {number} */ (KT_STAGE.watch), sga: 0, n: -1,
    cradles: new Float32Array(KT_CRADLES.length), bcradles: new Float32Array(KT_BRIDGE_CRADLES.length),
    sockets: new Uint8Array(KT_SOCKETS.length), loose: new Float32Array(KT_STATES_LOOSE), looseN: 0, carried: 0,
    banked: 0, need: 0, appetite: 0, wakeAge: -1,
    lift: { y: /** @type {number} */ (KT_LIFT.y0), phase: 0, part: /** @type {number} */ (KT_LIFT_PART.foot), runs: false, gateHold: false, gateTop: false },
    hammers: new Float32Array(KT_HAMMER.rows.length * KT_HAMMER.lanes.length), steam: new Float32Array(KT_STEAM.z.length), arcs: new Float32Array(KT_ARCS.z.length),
    pourAt: 0, wave: 0, waveAt: 0, waveGap: 1,
    secWarn: new Float32Array(KT_SECTIONS), secGone: new Uint8Array(KT_SECTIONS), secBack: new Float32Array(KT_SECTIONS),
    resonators: new Int8Array(4), discordAt: 0, songAt: 0, forks: new Float32Array(8), forksN: 0,
    stunFrom: 0, stunUntil: 0, turnUntil: 0, ends: 0, fellAt: 0, lostAt: 0,
    voyage: null, crew: 0, chest: 0,
  };
}

/**
 * Pure except for two moments saved in `out`: when a stun began and when the Watch's wave last moved.
 * @param {any} V
 * @param {number} t
 * @param {number} now
 * @param {{ owed?: number } | null} [me]
 */
export function ketchStatesOf(V, t, now, me = null, out = ketchStatesRecord()) {
  const sg = V?.n >= 0 ? V.sg : KT_STAGE.watch, ws = V?.n >= 0 ? V.ws : null, cl = V?.n >= 0 ? V.cl : null;
  out.n = V?.n ?? -1; out.sg = sg; out.sga = V?.sga ?? 0;
  const singing = !!ws && now >= (ws.op ?? Infinity) && !ws.fell && !ws.lost;
  out.ship = singing ? KT_SHIP.singing : sg >= KT_STAGE.sailwalk ? KT_SHIP.awake : KT_SHIP.asleep;
  const fill = (v, ms) => (v === 1 ? 1 : clamp01(1 - (v - now) / ms));
  for (let j = 0; j < out.cradles.length; j++) out.cradles[j] = cl?.cr ? fill(cl.cr[j], KT_CRADLE_BACK_MS) : 1;
  for (let j = 0; j < out.bcradles.length; j++) out.bcradles[j] = cl?.br ? fill(cl.br[j], KT_BRIDGE_CRADLE_BACK_MS) : 1;
  for (let j = 0; j < out.sockets.length; j++) out.sockets[j] = cl?.sk?.[j] ? 1 : 0;
  out.looseN = 0;
  for (const l of cl?.lo ?? []) { if (out.looseN >= KT_STATES_LOOSE) break; out.loose[out.looseN++] = clamp01((l[4] - now) / KT_CELL_LIES_MS); }
  for (let j = out.looseN; j < KT_STATES_LOOSE; j++) out.loose[j] = 0;
  out.carried = cl?.ca?.length ?? 0;
  out.banked = cl?.bk ?? 0; out.need = cl?.nd ?? 0; out.appetite = out.need > 0 ? clamp01(out.banked / out.need) : 0;
  out.wakeAge = sg >= KT_STAGE.sailwalk && out.sga > 0 ? Math.max(0, now - out.sga) : -1;
  const runs = sg >= KT_STAGE.sailwalk, L = out.lift;
  L.runs = runs; L.y = liftYAt(t, runs);
  L.phase = runs ? ((t % KT_LIFT_CYCLE) + KT_LIFT_CYCLE) % KT_LIFT_CYCLE : 0;
  const W = KT_LIFT.wait, R = KT_LIFT.rise;
  L.part = !runs || L.phase < W ? KT_LIFT_PART.foot : L.phase < W + R ? KT_LIFT_PART.rising : L.phase < 2 * W + R ? KT_LIFT_PART.top : KT_LIFT_PART.falling;
  L.gateHold = runs && L.y <= KT_LIFT.y0 + 0.05; L.gateTop = runs && L.y >= KT_LIFT.y1 - 0.05;
  const H = KT_HAMMER, c = H.cycle, wu = H.wu / 1000;
  for (let ri = 0; ri < H.rows.length; ri++) for (let li = 0; li < H.lanes.length; li++) {
    const u = (((t - hammerPhase(ri, li)) % c) + c) % c;
    out.hammers[ri * H.lanes.length + li] = u >= c - wu ? (u - (c - wu)) / wu : 0;
  }
  for (let j = 0; j < out.steam.length; j++) { const s = hazardState('steam', j, t, _hz); out.steam[j] = s.live ? 1 : s.warn ? s.k : 0; }
  for (let j = 0; j < out.arcs.length; j++) { const s = hazardState('arc', j, t, _hz); out.arcs[j] = s.live ? 1 : s.warn ? s.k : 0; }
  out.pourAt = 0;
  if (sg === KT_STAGE.engine && out.sga > 0) {
    let alive = 0;
    for (const B of V.bodies ?? []) if (B.h > 0 && KT_KIND_BY_K[B.k]?.key === 'spider') alive++;
    const first = out.sga + KT_SPIDER_EVERY_MS / 2;
    if (alive < spidersMaxFor(V.crew?.length ?? 1)) out.pourAt = now < first ? first : first + Math.ceil((now - first) / KT_SPIDER_EVERY_MS) * KT_SPIDER_EVERY_MS;
  }
  const wave = V?.n >= 0 ? V.wv ?? 0 : 0;
  if (wave !== out.wave) { out.wave = wave; out.waveAt = now; }
  out.waveGap = out.waveAt > 0 ? clamp01((now - out.waveAt) / KT_WAVE_GAP_MS) : 1;
  for (let k = 0; k < KT_SECTIONS; k++) { out.secWarn[k] = 0; out.secGone[k] = 0; out.secBack[k] = 0; }
  for (const e of ws?.sec ?? []) {
    const k = e[0], at = e[1], back = e[2];
    if (!(k >= 0 && k < KT_SECTIONS) || now >= back) continue;
    if (now < at) out.secWarn[k] = clamp01(1 - (at - now) / KW_SECTION_WARN_MS);
    else { out.secGone[k] = 1; out.secBack[k] = clamp01((now - at) / Math.max(1, back - at)); }
  }
  for (let j = 0; j < out.resonators.length; j++) out.resonators[j] = ws?.rs?.[j] ? 1 : 0;
  out.discordAt = ws?.da ?? 0; out.songAt = ws?.fk?.at ?? 0;
  out.forksN = 0;
  for (const q of ws?.fk?.c ?? []) { if (out.forksN >= out.forks.length) break; out.forks[out.forksN++] = clamp01(q[2] / Math.max(1, ws.fk.m)); }
  for (let j = out.forksN; j < out.forks.length; j++) out.forks[j] = 0;
  const su = ws?.su ?? 0;
  if (su > now) { if (out.stunUntil !== su) { out.stunUntil = su; out.stunFrom = now; } } else { out.stunUntil = 0; out.stunFrom = 0; }
  out.turnUntil = ws?.ou ?? 0; out.ends = ws?.ends ?? 0; out.fellAt = ws?.fell?.at ?? V?.fell?.at ?? 0; out.lostAt = ws?.lost ?? 0;
  out.voyage = out.n >= 0 ? ketchVoyageOf(out.n) : null;
  out.crew = V?.n >= 0 ? V.crew?.length ?? 0 : 0;
  out.chest = me?.owed ?? 0;
  return out;
}

export const KT_GROUP = Object.freeze({ decks: 'decks', aloft: 'aloft', sailwalk: 'sailwalk', gundeck: 'gundeck', hold: 'hold', bridge: 'bridge', cabin: 'cabin' });
export const KT_PVS = Object.freeze({
  decks: Object.freeze(['decks', 'aloft', 'sailwalk']),
  aloft: Object.freeze(['decks', 'aloft', 'sailwalk', 'bridge']),
  below: Object.freeze(['gundeck', 'hold']),
  bridge: Object.freeze(['bridge', 'decks', 'aloft', 'sailwalk']),
  cabin: Object.freeze(['cabin', 'bridge']),
});
export const KT_PVS_DOOR_M = 6;
export const KT_PVS_HOLD_M = 4;
export const KT_PVS_HATCH_M = 14;
const HOLD_STEPS = Object.freeze([[KT_PVS_HOLD_M, 0], [-KT_PVS_HOLD_M, 0], [0, KT_PVS_HOLD_M], [0, -KT_PVS_HOLD_M]]);
export const KT_PVS_DOORS = /** @type {ReadonlyArray<Readonly<{ at: ReadonlyArray<number>, join: ReadonlyArray<string>, r?: number }>>} */ (Object.freeze([
  Object.freeze({ at: Object.freeze([(KT_HATCH.x0 + KT_HATCH.x1) / 2, -3, (KT_HATCH.z0 + KT_HATCH.z1) / 2]), join: Object.freeze(['decks', 'below']), r: KT_PVS_HATCH_M }),
  Object.freeze({ at: Object.freeze([(KT_HOLD_HATCH.x0 + KT_HOLD_HATCH.x1) / 2, -9, (KT_HOLD_HATCH.z0 + KT_HOLD_HATCH.z1) / 2]), join: Object.freeze(['below']) }),
  Object.freeze({ at: Object.freeze([KT_LIFT.x, KT_LIFT.y0 + 1.6, KT_LIFT.z]), join: Object.freeze(['below', 'decks', 'aloft']) }),
  Object.freeze({ at: Object.freeze([(KT_CABIN.x0 + KT_CABIN.x1) / 2, 1.6, KT_CABIN.z0]), join: Object.freeze(['cabin', 'bridge']) }),
  Object.freeze({ at: Object.freeze([KT_GANGWAY.bx, 1.6, KT_GANGWAY.bz]), join: Object.freeze(['aloft', 'bridge']) }),
]));
export function pvsViewOf(zone) {
  switch (zone) {
    case 'anchor': case 'waist': return 'decks';
    case 'lift': return 'decks';
    case 'top': case 'sailwalk': case 'gangway': return 'aloft';
    case 'gallery': case 'landing': case 'hold': return 'below';
    case 'bridge': return 'bridge';
    case 'cabin': return 'cabin';
    default: return null;
  }
}
/**
 * @param {ArrayLike<number>} p
 * @param {string | null} keep
 * @param {Set<string>} out
 */
export function pvsGroupsAt(p, keep, out) {
  out.clear();
  const here = pvsViewOf(deckZoneAt(p[0], p[1], p[2]));
  let view = here;
  if (keep && view !== keep) {
    for (const [dx, dz] of HOLD_STEPS) if (pvsViewOf(deckZoneAt(p[0] + dx, p[1], p[2] + dz)) === keep) { view = keep; break; }
  }
  view ??= keep ?? (p[1] < -1 ? 'below' : 'decks');
  for (const g of KT_PVS[view]) out.add(g);
  if (here && here !== view) for (const g of KT_PVS[here]) out.add(g);
  for (const d of KT_PVS_DOORS) {
    if (Math.hypot(p[0] - d.at[0], p[1] - d.at[1], p[2] - d.at[2]) <= (d.r ?? KT_PVS_DOOR_M)) for (const v of d.join) for (const g of KT_PVS[v]) out.add(g);
  }
  return view;
}
