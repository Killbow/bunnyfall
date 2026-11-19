// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 2 (docs/FARM-EXPANSION.md sections 4.3-4.4): THE FIELD GAMES. Optional, short, and
// played on the thing itself: with Careful work on, sowing, weeding and scything a bed become a timing game, and the
// scarecrow's birds a chase. A game's score (0..1) buys care for the beds it was played on (careLaw.js), never crops.
//
//   - Each is a pure state machine here - `tick(dt)`, `input(e)`, `report()` - as the pot's Simmer is (simmerAct.js);
//     the farm's widget draws it (ui/farmGames.js).
//   - The service judges the report (validGame): the kind matches the work, the score is 0..1, the play lasted its
//     least time. Each account's FULL-BONUS plays a UTC day are capped by kind (GAMES[k].cap), counted in the garden
//     (`plays`); past the cap a game is played for nothing but the work itself. A full-bonus play is also farm work.
// Pure: no clock, no DOM.

/** The games: the garden op each rides, the full-bonus plays an account has a day, the least time a play takes, ms. */
export const GAMES = Object.freeze({
  sow: Object.freeze({ op: 'plant', cap: 6, minMs: 2500 }),   // the fastest honest play: five passes of the mark, ~2.9 s
  weed: Object.freeze({ op: 'weed', cap: 10, minMs: 4000 }),
  scythe: Object.freeze({ op: 'harvest', cap: 4, minMs: 3000 }),   // five wind-ups, ~4 s
  birds: Object.freeze({ op: 'birds', cap: 3, minMs: 5000 }),
  milk: Object.freeze({ op: 'milk', cap: 4, minMs: 3000 }),   // PHASE 3: ten strokes, ~3.5 s
});
/** The longest a reported play may take, ms (a report older than this is a stale one). */
export const GAME_MAX_MS = 120000;
/** Farm work a full-bonus play earns (farmWorkLaw.js). */
export const GAME_WORK = 5;
/** The care a score buys. */
export const careBonus = (score) => (score >= .9 ? 2 : score >= .5 ? 1 : 0);
/** The game a garden op is played as, or null. */
export const gameForOp = (op) => Object.keys(GAMES).find((k) => GAMES[k].op === op) ?? null;

/** Whether a reported play is a sound one for this op. */
export function validGame(game, op) {
  if (!game || typeof game !== 'object') return false;
  const g = GAMES[game.kind];
  return !!g && g.op === op && Number.isFinite(game.score) && game.score >= 0 && game.score <= 1
    && Number.isSafeInteger(game.ms) && game.ms >= g.minMs && game.ms <= GAME_MAX_MS;
}

/** Whether a garden's play counts are well formed (absent is fine). */
export function validPlays(plays) {
  if (plays === undefined) return true;
  if (!plays || !Number.isSafeInteger(plays.day) || !plays.by || typeof plays.by !== 'object') return false;
  const who = Object.entries(plays.by);
  return who.length <= 200 && who.every(([id, k]) => id.length <= 64 && k && typeof k === 'object'
    && Object.entries(k).every(([kind, n]) => Object.hasOwn(GAMES, kind) && Number.isSafeInteger(n) && n >= 0 && n <= 1000));
}
/**
 * A play recorded on `next` (mutated) for account `who` on UTC day `day`: whether it earns the full bonus (under the
 * day's cap for its kind). A new day clears the counts.
 */
export function recordPlay(next, who, kind, day) {
  if (!next.plays || next.plays.day !== day) next.plays = { day, by: {} };
  const mine = next.plays.by[who] ?? (next.plays.by[who] = {});
  const n = mine[kind] ?? 0;
  mine[kind] = n + 1;
  return n < GAMES[kind].cap;
}

// ─── THE GAMES THEMSELVES ─────────────────────────────────────────────

/** Sowing: a hand swings across; press as it passes the mark. Five throws. */
export const SOW = Object.freeze({ throws: 5, period: 1.3, seconds: 12, cooldown: .4 });
/** Scything: hold to wind up, release in the bright band. Five swings; past full, the swing is lost. */
export const SCYTHE = Object.freeze({ swings: 5, wind: 1.1, band: Object.freeze([.72, .92]), seconds: 14 });
/** Weeding and birds: things pop up in cells and must be clicked before they go; a sprout among the weeds must not. */
export const WEED = Object.freeze({ cells: 9, spawn: .75, life: 1.05, count: 10, decoy: .2 });
export const BIRDS = Object.freeze({ cells: 6, spawn: .8, life: 1.15, count: 12, decoy: 0 });
/** Milking: A and D in turn, in the cow's rhythm - not too quick (she kicks the pail), not too slow. Ten strokes. */
export const MILK = Object.freeze({ strokes: 10, fast: .22, slow: .75, seconds: 15 });

/**
 * A game of `kind`. `input` takes { press: true } (sow), { hold: boolean } (scythe) or { cell: n } (weed, birds).
 * @param {'sow'|'weed'|'scythe'|'birds'|'milk'} kind
 * @param {() => number} [rand]
 */
export function createFarmGame(kind, rand = Math.random) {
  const s = { kind, t: 0, done: false, hits: 0, misses: 0, marks: /** @type {number[]} */ ([]),
    hand: 0, power: 0, holding: false, lastPress: -1, lastKey: '', swings: 0, spawned: 0, next: .4,
    /** @type {{ cell: number, born: number, decoy: boolean }[]} */ items: [] };
  const pop = kind === 'birds' ? BIRDS : WEED;
  function finish() { s.done = true; }
  return {
    state: s,
    /** @param {number} dt seconds */
    tick(dt) {
      if (s.done) return;
      const d = Math.max(0, Math.min(.1, dt)); s.t += d;
      if (kind === 'milk') { if (s.t >= MILK.seconds) finish(); }
      else if (kind === 'sow') {
        const ph = (s.t % SOW.period) / SOW.period; s.hand = ph < .5 ? ph * 2 : 2 - ph * 2;
        if (s.t >= SOW.seconds) finish();
      } else if (kind === 'scythe') {
        if (s.holding) { s.power += d / SCYTHE.wind; if (s.power > 1.05) { s.power = 0; s.holding = false; s.swings++; s.misses++; } }
        if (s.swings >= SCYTHE.swings || s.t >= SCYTHE.seconds) finish();
      } else {
        s.items = s.items.filter((it) => { const alive = s.t - it.born < pop.life; if (!alive && !it.decoy) s.misses++; return alive; });
        if (s.spawned < pop.count && s.t >= s.next) {
          const free = Array.from({ length: pop.cells }, (_, i) => i).filter((i) => !s.items.some((it) => it.cell === i));
          if (free.length) {
            const decoy = rand() < pop.decoy;
            s.items.push({ cell: free[Math.floor(rand() * free.length)], born: s.t, decoy });
            if (!decoy) s.spawned++;
          }
          s.next = s.t + pop.spawn * (.7 + rand() * .6);
        }
        if (s.spawned >= pop.count && !s.items.some((it) => !it.decoy)) finish();
      }
    },
    /** @param {{ press?: boolean, hold?: boolean, cell?: number, key?: string }} e */
    input(e) {
      if (s.done) return;
      if (kind === 'milk' && (e.key === 'a' || e.key === 'd')) {
        const gap = s.t - (s.lastPress ?? -1), turn = e.key !== s.lastKey;
        if (s.lastKey && turn && gap >= MILK.fast && gap <= MILK.slow) s.hits++; else if (s.lastKey) s.misses++;
        s.lastKey = e.key; s.lastPress = s.t; s.swings++;
        if (s.swings > MILK.strokes) finish();
        return;
      }
      if (kind === 'sow' && e.press) {
        if (s.t - (s.lastPress ?? -1) < SOW.cooldown) return;   // one throw a pass of the hand
        s.lastPress = s.t;
        s.marks.push(Math.max(0, 1 - Math.abs(s.hand - .5) * 3));
        if (s.marks.length >= SOW.throws) finish();
      } else if (kind === 'scythe' && typeof e.hold === 'boolean') {
        if (e.hold && !s.holding) { s.holding = true; s.power = 0; }
        else if (!e.hold && s.holding) {
          s.holding = false; s.swings++;
          if (s.power >= SCYTHE.band[0] && s.power <= SCYTHE.band[1]) s.hits++; else s.misses++;
          s.power = 0;
        }
      } else if ((kind === 'weed' || kind === 'birds') && Number.isInteger(e.cell)) {
        const it = s.items.find((x) => x.cell === e.cell);
        if (!it) return;
        s.items = s.items.filter((x) => x !== it);
        if (it.decoy) s.misses += 2; else s.hits++;
      }
    },
    get done() { return s.done; },
    /** The play's report for the service: its kind, score (0..1) and length, ms. */
    report() {
      let score = 0;
      if (kind === 'milk') score = s.hits / MILK.strokes;
      else if (kind === 'sow') score = s.marks.length ? s.marks.reduce((a, b) => a + b, 0) / SOW.throws : 0;
      else if (kind === 'scythe') score = s.hits / SCYTHE.swings;
      else score = Math.max(0, s.hits - Math.max(0, s.misses - (pop.count - s.hits))) / pop.count;
      return { kind, score: Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000, ms: Math.round(s.t * 1000) };
    },
  };
}
