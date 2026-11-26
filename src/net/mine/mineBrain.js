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

/**
 * @typedef {{ mine: number, reset: number, born: number, sealedUntil: number, stab: number[], cap: number[],
 *   warned: number[], weak: number[][][], walls: number[][], props: Array<{ s: number, c: number, w: number, wood: string, by: string }> }} MineState
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
    props: [],
  };
}

const copy = (/** @type {MineState} */ st) => ({ ...st, stab: [...st.stab], cap: [...st.cap], warned: [...st.warned], props: [...st.props] });
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
 * wood, by }` (a plank on wall slot w), `{ op: 'tick' }` (the clock: a seal run out, or a week gone).
 * @param {MineState} state
 * @param {any} op
 * @param {number} nowS
 * @returns {{ state: MineState, events: string[], error?: string }}
 */
export function stepMine(state, op, nowS) {
  const none = (/** @type {string} */ error) => ({ state, events: [], error });
  if (op?.op === 'tick') {
    if (state.sealedUntil > 0 ? nowS >= state.sealedUntil : nowS >= state.born + MINE_WEEK_S) return { state: turnedOver(state, nowS), events: ['reset'] };
    return { state, events: [] };
  }
  if (op?.op !== 'strike' && op?.op !== 'prop') return none('bad');
  if (state.sealedUntil > 0) return none('sealed');
  const { s, c } = op;
  if (!valid(state, s, c)) return none('bad');
  const st = copy(state);
  if (op.op === 'strike') {
    const open = st.weak[s][c].filter((w) => !propped(st, s, c, w)).length;
    st.stab[s] = Math.max(0, st.stab[s] - MINE_COST.strike * MINE_COST.weakMult ** open);
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
  return { state: st, events };
}
