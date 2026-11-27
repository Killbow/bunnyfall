#!/usr/bin/env node
// Measures King's Gambit tiers, seeded: each tier's regular against an Auto-filled army, both played by regulars.
// A game still running at --rounds counts as 'kings' (only the two kings left) or 'long'.
// Run: node tools/kgMeasure.mjs [--games N] [--seed S] [--player-blunder P] [--rounds N].
import { isMain } from './lib/isMain.mjs';
import { KG_POINT_BUDGET, autoFill, finishTurn } from '../src/net/kingsGambit.js';
import { GAMBIT_TIERS, dealRegular, regularStep } from '../src/cards/gambit/gambitPatrons.js';

/** @param {number} seed */
export const xorshift = (seed) => {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
};

const mix32 = (/** @type {number} */ h) => {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};

// Mix the sample seed and game index, because xorshift32's first draws from nearby seeds correlate; never 0.
export const gameSeed = (seed, g) => mix32((Math.imul(seed, 1000003) + Math.imul(g, 7919) + 1) >>> 0) || 1;

/**
 * @param {{blunder: number, budget: number, potions: number}} tier
 * @param {number} seed
 * @param {{playerBlunder?: number, rounds?: number}} [o]
 */
export function playRegular(tier, seed, { playerBlunder = 0, rounds = 200 } = {}) {
  const rnd = xorshift(seed);
  let st = dealRegular({ army: autoFill([], KG_POINT_BUDGET, rnd), tier, rand32: rnd });
  const player = { blunder: playerBlunder };
  while (!st.over) {
    if (st.round > rounds) return { end: st.pieces.every((p) => p.king) ? 'kings' : 'long', rounds: st.round };
    st = st.ending ? finishTurn(st, rnd).state : regularStep(st, st.turn, st.turn === 1 ? tier : player, rnd, rnd).state;
  }
  return { end: st.over.winner === 1 ? 'regular' : 'player', rounds: st.round };
}

/**
 * @param {{blunder: number, budget: number, potions: number}} tier
 * @param {{games?: number, seed?: number, playerBlunder?: number, rounds?: number}} [o]
 */
export function measureTier(tier, { games = 1000, seed = 1, ...opts } = {}) {
  const tally = { regular: 0, player: 0, kings: 0, long: 0, rounds: 0, longest: 0 };
  for (let g = 0; g < games; g++) {
    const r = playRegular(tier, gameSeed(seed, g), opts);
    tally[r.end]++;
    if (r.end === 'regular' || r.end === 'player') { tally.rounds += r.rounds; tally.longest = Math.max(tally.longest, r.rounds); }
  }
  return tally;
}

/** @param {string[]} argv */
function main(argv) {
  const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? Number(argv[i + 1]) : dflt; };
  const games = arg('--games', 1000), seed = arg('--seed', 1), playerBlunder = arg('--player-blunder', 0), rounds = arg('--rounds', 200);
  if (![games, seed, playerBlunder, rounds].every(Number.isFinite) || games < 1) {
    console.error('usage: node tools/kgMeasure.mjs [--games N] [--seed S] [--player-blunder P] [--rounds R]');
    return 2;
  }
  console.log(`${games} games a tier, seed ${seed}, the player's seat blundering ${playerBlunder}`);
  const pct = (n, of) => `${(100 * n / of).toFixed(1)}%`.padStart(6);
  for (const tier of GAMBIT_TIERS) {
    const t = measureTier(tier, { games, seed, playerBlunder, rounds });
    const decided = t.regular + t.player;
    console.log(`${tier.key.padEnd(12)} regular ${pct(t.regular, games)}  player ${pct(t.player, games)}  kings alone ${pct(t.kings, games)}  long ${pct(t.long, games)}`
      + `  | of the decided: regular ${pct(t.regular, decided || 1)}, ${(t.rounds / (decided || 1)).toFixed(1)} rounds a game, the longest ${t.longest}`);
  }
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
