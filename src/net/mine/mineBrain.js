// @ts-check
// BUNNYFALL (2026-11-25, caverns): THE MINE'S SHARED BRAIN - pure, run by the relay (server/src/room/mine.js) for the one
// mine every player in it shares, and read by every page (systems/mine/mineClient.js).
//
// A mine has a STABILITY for each of its sections, 0 to its cap (100 fresh). Every pick strike wears its section a
// little - more for each weak wall of its chamber left unshored. A PLANK stood on a wall slot raises its section's cap
// and gives some stability back, by its wood (Pine the least, Ironwood and Ghostwood the most), twice over on a weak wall.
// As a section falls it WARNS: dust under 50, creaks under 30, a rumble under 15. At 0 the WHOLE mine collapses: it is
// SEALED for MINE_SEAL_S, refusing every act, and the first tick past the seal RESETS it - a new layout (the reset count
// one higher), full stability, no props. A mine nobody brings down turns over the same way after MINE_WEEK_S.
//
// The state is plain data the relay keeps in its room's storage; stepMine never changes the state it is handed.
// Imports only pure laws (ruling R2): no clock, no network.
import { mineLayout } from './mineLayout.js';
import { MINE_DRILL, drillHopper, drillRunning, drillSecondsBetween } from './mineDrill.js';

/** A pick strike's cost to its section, and how much each unshored weak wall of its chamber multiplies it. */
export const MINE_COST = Object.freeze({ strike: 0.6, weakMult: 1.5 });
/** A plank's raise of its section's cap and its refill, times its wood's strength (twice on a weak wall); the cap's top. */
export const MINE_PROP = Object.freeze({ cap: 4, fill: 6, capMax: 160 });
/** The woods a plank can be, and how much each shores (the spec's table). */
export const MINE_WOOD_STRENGTH = Object.freeze({ pine: 1, oak: 1.5, cherry: 1.75, teak: 2, mahogany: 2.25, ironwood: 3, ghostwood: 3 });
/** The warnings, from the first a falling section gives to the last, and where each sounds. */
export const MINE_WARNINGS = Object.freeze([Object.freeze({ name: 'warn:dust', under: 50 }), Object.freeze({ name: 'warn:creak', under: 30 }), Object.freeze({ name: 'warn:rumble', under: 15 })]);
/** How long a collapsed mine stays sealed (s), and how long a standing one lasts before it turns over (s). */
export const MINE_SEAL_S = 3600;
export const MINE_WEEK_S = 7 * 86400;
/** The most props a mine keeps (every wall slot of every chamber, with room to spare). */
export const MINE_PROPS_MAX = 400;
/** THE ALARM (the spec's section 8): each strike's noise in its section, and the noise a wave is called at (the drill's
 *  will be louder); how fast a quiet section forgets (a minute), and a wave's size - the first, and one more each two
 *  waves the mine has called, to the most. */
export const MINE_ALARM = Object.freeze({ strike: 1, wave: 24, forgetPerMin: 6, first: 2, most: 5 });
/** STRAYS: the chance a minute's tick sends one into an occupied mine (one or two creatures, a chamber of the tick's
 *  pick). */
export const MINE_STRAY = Object.freeze({ chance: 0.3, pair: 0.35 });

/**
 * @typedef {{ mine: number, reset: number, born: number, sealedUntil: number, stab: number[], cap: number[],
 *   warned: number[], weak: number[][][], walls: number[][], props: Array<{ s: number, c: number, w: number, wood: string, by: string }>,
 *   alarm?: number[], waves?: number, ticked?: number, drills?: import('./mineDrill.js').MineDrillState[], hauls?: number,
 *   lamps?: Array<{ s: number, c: number }> }} MineState
 */

/**
 * A fresh mine, as its layout stands.
 * @param {import('./mineLayout.js').MineLayout} layout
 * @param {number} nowS
 * @returns {MineState}
 */
export function createMineState(layout, nowS) {
  return {
    mine: layout.mineId, reset: layout.reset, born: nowS, sealedUntil: 0,
    stab: layout.sections.map(() => 100), cap: layout.sections.map(() => 100), warned: layout.sections.map(() => 0),
    weak: layout.sections.map((s) => s.chambers.map((c) => c.walls.map((w, k) => (w.weak ? k : -1)).filter((k) => k >= 0))),
    walls: layout.sections.map((s) => s.chambers.map((c) => c.walls.length)),   // each chamber's wall slots, so a prop is checked without the layout
    props: [], alarm: layout.sections.map(() => 0), waves: 0, ticked: nowS, drills: [], hauls: 0, lamps: [],
  };
}

const copy = (/** @type {MineState} */ st) => ({ ...st, stab: [...st.stab], cap: [...st.cap], warned: [...st.warned], props: [...st.props], alarm: st.alarm ? [...st.alarm] : st.stab.map(() => 0), waves: st.waves ?? 0, drills: (st.drills ?? []).map((d) => ({ ...d })), hauls: st.hauls ?? 0, lamps: [...(st.lamps ?? [])] });

/** A mine's holes (its layout's, by its reset), kept a mine at a time: the drill reads a hole's ore and seam. */
const _holes = new Map();
function holesOf(/** @type {MineState} */ st) {
  const key = `${st.mine}:${st.reset}`;
  let h = _holes.get(key);
  if (!h) { h = mineLayout(st.mine, st.reset).sections.map((s) => s.chambers.map((c) => c.holes)); _holes.clear(); _holes.set(key, h); }
  return h;
}

/** Noise in section s (from chamber c): its alarm raised, and a wave called each time it fills. */
function noise(/** @type {MineState} */ st, /** @type {number} */ s, /** @type {number} */ c, /** @type {number} */ amount, /** @type {string[]} */ out) {
  const alarm = /** @type {number[]} */ (st.alarm);
  alarm[s] += amount;
  while (alarm[s] >= MINE_ALARM.wave) {
    alarm[s] -= MINE_ALARM.wave;
    st.waves = (st.waves ?? 0) + 1;
    out.push(`wave:${s}:${c}:${Math.min(MINE_ALARM.most, MINE_ALARM.first + Math.floor((st.waves - 1) / 2))}`);
  }
}
const valid = (/** @type {any} */ st, /** @type {any} */ s, /** @type {any} */ c) => Number.isSafeInteger(s) && Number.isSafeInteger(c) && s >= 0 && s < st.stab.length && c >= 0 && c < st.weak[s].length;
const propped = (/** @type {MineState} */ st, /** @type {number} */ s, /** @type {number} */ c, /** @type {number} */ w) => st.props.some((p) => p.s === s && p.c === c && p.w === w);

/** The warnings a section crossing from `from` down to `to` sounds, and its warned level after. */
function warningsOf(/** @type {number} */ level, /** @type {number} */ to) {
  const events = [];
  let at = level;
  MINE_WARNINGS.forEach(({ name, under }, i) => { if (to < under && at <= i) { events.push(name); at = i + 1; } });
  // a section shored back over a warning's line may sound it again
  while (at > 0 && to >= MINE_WARNINGS[at - 1].under) at--;
  return { events, at };
}

/** A new mine where the old one stood: the reset count one on, born now. */
const turnedOver = (/** @type {MineState} */ st, /** @type {number} */ nowS) => createMineState(mineLayout(st.mine, st.reset + 1), nowS);

/**
 * One act on a mine. Ops: `{ op: 'strike', s, c }` (a pick strike in chamber c of section s), `{ op: 'prop', s, c, w,
 * wood, by }` (a plank on wall slot w), `{ op: 'tick', present?, roll?, pick? }` (the clock: a seal run out, or a week
 * gone; the alarm forgetting; and, with someone `present`, a stray when `roll` (0..1) falls under MINE_STRAY.chance, its
 * chamber by `pick` (0..1)). A strike's noise may call a wave: `wave:<s>:<c>:<n>`; a stray is `stray:<s>:<c>:<n>`.
 * @param {MineState} state
 * @param {any} op
 * @param {number} nowS
 * @returns {{ state: MineState, events: string[], error?: string, haul?: { s: number, c: number, k: number, ore: string, n: number, by: string, seq: number } }}
 */
export function stepMine(state, op, nowS) {
  const none = (/** @type {string} */ error) => ({ state, events: [], error });
  if (op?.op === 'tick') {
    if (state.sealedUntil > 0 ? nowS >= state.sealedUntil : nowS >= state.born + MINE_WEEK_S) return { state: turnedOver(state, nowS), events: ['reset'] };
    if (state.sealedUntil > 0) return { state, events: [] };
    const st = copy(state), mins = Math.max(0, nowS - (state.ticked ?? nowS)) / 60, events = [];
    st.ticked = nowS;
    st.alarm = /** @type {number[]} */ (st.alarm).map((a) => Math.max(0, a - MINE_ALARM.forgetPerMin * mins));
    // THE DRILLS: each shift second since the last tick roars in its section and wears it - and a drill whose setter has
    // left the mine (the relay's `here`, the accounts in it) stops where it stands (the spec: "leaving stops it")
    const from = state.ticked ?? nowS, worn = new Set();
    if (Array.isArray(op.here)) for (const d of /** @type {any[]} */ (st.drills)) if (d.until > nowS && !op.here.includes(d.by)) d.until = Math.max(d.from, nowS);
    for (const d of /** @type {any[]} */ (st.drills)) {
      const secs = drillSecondsBetween(d, from, nowS);
      if (secs <= 0) continue;
      noise(st, d.s, d.c, MINE_DRILL.noisePerS * secs, events);
      st.stab[d.s] = Math.max(0, st.stab[d.s] - MINE_DRILL.wearPerS * secs);
      worn.add(d.s);
    }
    for (const s of worn) {
      const w = warningsOf(st.warned[s], st.stab[s]);
      st.warned[s] = w.at;
      events.push(...w.events);
      if (st.stab[s] <= 0) { st.sealedUntil = nowS + MINE_SEAL_S; return { state: st, events: [...events.filter((e) => !e.startsWith('wave:')), 'collapse'] }; }
    }
    if (op.present && Number(op.roll) < MINE_STRAY.chance) {
      const slots = st.walls.flatMap((cs, s) => cs.map((_, c) => [s, c]));
      const [s, c] = slots[Math.min(slots.length - 1, Math.floor(Math.max(0, Number(op.pick) || 0) * slots.length))];
      // a lamp's chamber is no stray's way in (the spec: "reduces strays there")
      if (!/** @type {any[]} */ (st.lamps).some((l) => l.s === s && l.c === c)) events.push(`stray:${s}:${c}:${Number(op.roll) < MINE_STRAY.chance * MINE_STRAY.pair ? 2 : 1}`);
    }
    return { state: st, events };
  }
  if (!['strike', 'prop', 'drill', 'take', 'lamp'].includes(op?.op)) return none('bad');
  if (state.sealedUntil > 0) return none('sealed');
  const { s, c } = op;
  if (!valid(state, s, c)) return none('bad');
  if (op.op === 'drill' || op.op === 'take') return drillOp(state, op, nowS, none);
  if (op.op === 'lamp') {
    // A LAMP set in a chamber (the page spent it first, as a plank): one a chamber, lit for good, till the mine turns over
    if ((state.lamps ?? []).some((l) => l.s === s && l.c === c)) return none('lit');
    const st = copy(state);
    /** @type {any[]} */ (st.lamps).push({ s, c });
    return { state: st, events: [`lamp:${s}:${c}`] };
  }
  const st = copy(state), waveEvents = [];
  if (op.op === 'strike') {
    const open = st.weak[s][c].filter((w) => !propped(st, s, c, w)).length;
    st.stab[s] = Math.max(0, st.stab[s] - MINE_COST.strike * MINE_COST.weakMult ** open);
    noise(st, s, c, MINE_ALARM.strike, waveEvents);   // a wave called each time a section's alarm fills, bigger as the mine calls more
  } else {
    const strength = MINE_WOOD_STRENGTH[/** @type {keyof typeof MINE_WOOD_STRENGTH} */ (op.wood)];
    if (typeof op.wood !== 'string' || !strength) return none('wood');
    const walls = state.walls[s][c];
    if (!Number.isSafeInteger(op.w) || op.w < 0 || op.w >= walls) return none('bad');
    if (propped(st, s, c, op.w)) return none('taken');
    if (st.props.length >= MINE_PROPS_MAX) return none('full');
    const k = strength * (st.weak[s][c].includes(op.w) ? 2 : 1);
    st.cap[s] = Math.min(MINE_PROP.capMax, st.cap[s] + MINE_PROP.cap * k);
    st.stab[s] = Math.min(st.cap[s], st.stab[s] + MINE_PROP.fill * k);
    st.props.push({ s, c, w: op.w, wood: op.wood, by: String(op.by ?? '').slice(0, 64) });
  }
  const w = warningsOf(st.warned[s], st.stab[s]);
  st.warned[s] = w.at;
  const events = [...w.events];
  if (st.stab[s] <= 0) { st.sealedUntil = nowS + MINE_SEAL_S; events.push('collapse'); }
  else events.push(...waveEvents);   // a mine coming down calls nothing more
  return { state: st, events };
}

/**
 * A drill set on hole k of chamber c of section s (`drill`), or its hopper emptied (`take`) - by `by`, the player.
 * A set drill starts its shift at once; one a player, one a hole (a spent, empty one is cleared for the next). A take is
 * the setter's alone and answers `haul`: what the relay signs for the account service to pay.
 * @param {MineState} state
 * @param {any} op
 * @param {number} nowS
 * @param {(e: string) => any} none
 */
function drillOp(state, op, nowS, none) {
  const { s, c } = op, by = String(op.by ?? '').slice(0, 64);
  const hole = holesOf(state)[s]?.[c]?.[op.k];
  if (!Number.isSafeInteger(op.k) || !hole || !by) return none('bad');
  const st = copy(state), drills = /** @type {import('./mineDrill.js').MineDrillState[]} */ (st.drills);
  const live = (/** @type {any} */ d) => drillRunning(d, nowS) || drillHopper(d, nowS) > 0;
  st.drills = drills.filter((d) => live(d));   // spent and empty: gone
  const here = /** @type {any[]} */ (st.drills).find((d) => d.s === s && d.c === c && d.k === op.k);
  if (op.op === 'drill') {
    if (here) return none('taken');
    if (/** @type {any[]} */ (st.drills).some((d) => d.by === by)) return none('one-each');
    if (/** @type {any[]} */ (st.drills).length >= MINE_DRILL.most) return none('full');
    // its crew: the setter's party, named by the setter (the accounts that may empty its hopper beside them)
    const crew = Array.isArray(op.crew) ? [...new Set(op.crew.filter((/** @type {any} */ x) => typeof x === 'string' && x && x.length <= 64 && x !== by))].slice(0, MINE_DRILL.crewMax) : [];
    /** @type {any[]} */ (st.drills).push({ s, c, k: op.k, by, crew, from: nowS, until: nowS + MINE_DRILL.shiftS, took: 0, rich: Math.max(1, Math.min(3, hole.rich | 0)) });
    return { state: st, events: [`drill:${s}:${c}:${op.k}`] };
  }
  if (!here) return none('no-drill');
  if (here.by !== by && !(here.crew ?? []).includes(by)) return none('not-yours');   // the setter, or their crew
  const n = drillHopper(here, nowS);
  if (n <= 0) return none('empty');
  here.took += n;
  st.hauls = (st.hauls ?? 0) + 1;
  if (!drillRunning(here, nowS)) st.drills = /** @type {any[]} */ (st.drills).filter((d) => d !== here);
  return { state: st, events: [], haul: { s, c, k: op.k, ore: hole.ore, n, by, seq: st.hauls } };
}
