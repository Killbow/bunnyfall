#!/usr/bin/env node
// Measures Iliac Hand balance, seeded: random legal decks against each other, and the starter deck by temper
// against each grade's regulars.
// Run: node tools/iliacBalance.mjs [--random N] [--regulars N] [--seed S] [--json].
import { ILIAC_CARDS, ILIAC_TIERS, STARTER_DECK } from '../src/net/iliacCards.js';
import { newGame, commit, reveal, result, legalPlays, playsRefusal, deckValid, ILIAC_DECK_SIZE, ILIAC_COPIES_MAX, ILIAC_LEGENDARY_COPIES_MAX } from '../src/net/iliacHand.js';
import { patronPlays, patronDeck, seededUnit, ILIAC_TEMPER_NAMES } from '../src/cards/iliacPatrons.js';
import { iliacTemperOf } from '../src/cards/iliacTableGame.js';
import { isMain } from './lib/isMain.mjs';

const TEMPER_SAID = Object.freeze({ tight: 'careful', loose: 'reckless', bluffer: 'sly' });
const GRADE_SAID = Object.freeze(['village', 'town', 'city']);

const rand32Of = (unit) => () => Math.floor(unit() * 4294967296) >>> 0;
const mix = (...xs) => xs.reduce((h, x) => (Math.imul(h ^ (x >>> 0), 0x9E3779B1) + 0x7F4A7C15) >>> 0, 0x2545F491);

export function playGame(decks, rand32, choose) {
  const st = newGame({ decks, rand32 });
  if (!st) throw new Error('a deck the rules refuse');
  while (!st.over) {
    for (const p of [0, 1]) if (commit(st, p, choose(st, p)) !== null) commit(st, p, []);
    reveal(st);
  }
  return result(st);
}

export function randomDeck(unit) {
  const deck = [], held = new Map();
  while (deck.length < ILIAC_DECK_SIZE) {
    const c = ILIAC_CARDS[Math.floor(unit() * ILIAC_CARDS.length)];
    const most = ILIAC_TIERS.indexOf(c.tier) >= ILIAC_TIERS.indexOf('legendary') ? ILIAC_LEGENDARY_COPIES_MAX : ILIAC_COPIES_MAX;
    if ((held.get(c.id) ?? 0) >= most) continue;
    held.set(c.id, (held.get(c.id) ?? 0) + 1);
    deck.push(c.id);
  }
  if (deckValid(deck) !== null) throw new Error(`a random deck the rules refuse: ${deckValid(deck)}`);
  return deck;
}

export function randomPlays(state, p, unit) {
  const singles = legalPlays(state, p);
  for (let i = singles.length - 1; i > 0; i--) { const j = Math.floor(unit() * (i + 1)); [singles[i], singles[j]] = [singles[j], singles[i]]; }
  const chosen = [];
  for (const one of singles) {
    if (chosen.some((x) => x.card === one.card)) continue;
    if (playsRefusal(state, p, [...chosen, one]) === null) chosen.push(one);
  }
  return chosen;
}

export function measureRandom(n, seed) {
  const out = { games: n, won: [0, 0], drawn: 0, by: { holdings: 0, power: 0, draw: 0 } };
  for (let i = 0; i < n; i++) {
    const unit = seededUnit(mix(seed, 1, i));
    const decks = [randomDeck(unit), randomDeck(unit)];
    const r = playGame(decks, rand32Of(unit), (st, p) => randomPlays(st, p, unit));
    if (r.winner === null) out.drawn++; else out.won[r.winner]++;
    out.by[r.by]++;
  }
  return out;
}

export function measureRegulars(n, seed) {
  const out = {};
  for (const temper of ILIAC_TEMPER_NAMES) {
    out[temper] = [];
    for (let grade = 0; grade < 3; grade++) {
      let won = 0, drawn = 0;
      for (let i = 0; i < n; i++) {
        const regSeed = mix(seed, 2, grade, i);
        const regTemper = iliacTemperOf(regSeed);
        const unit = seededUnit(mix(seed, 3, grade, i));
        const r = playGame([STARTER_DECK, patronDeck(regSeed, regTemper, grade)], rand32Of(unit),
          (st, p) => (p === 0 ? patronPlays(st, 0, temper, 2, unit) : patronPlays(st, 1, regTemper, grade, unit)));
        if (r.winner === 0) won++; else if (r.winner === null) drawn++;
      }
      out[temper].push({ games: n, won, drawn, rate: n ? won / n : 0 });
    }
  }
  return out;
}

const pct = (a, b) => `${b ? ((100 * a) / b).toFixed(1) : '0.0'}%`;

if (isMain(import.meta.url)) {
  const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? Number(process.argv[i + 1]) : dflt; };
  const seed = arg('--seed', 20261013) >>> 0, nRandom = arg('--random', 3000), nRegulars = arg('--regulars', 1200);
  const random = nRandom > 0 ? measureRandom(nRandom, seed) : null;
  const regulars = nRegulars > 0 ? measureRegulars(nRegulars, seed) : null;
  const set = { cards: ILIAC_CARDS.length };
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ seed, set, random, regulars }, null, 2));
  } else {
    console.log(`Iliac Hand's set: ${set.cards} cards (seed ${seed})`);
    if (random) {
      const g = random.games;
      console.log(`THE RANDOM GAMES (${g}): seat 0 won ${random.won[0]} (${pct(random.won[0], g)}), seat 1 won ${random.won[1]} (${pct(random.won[1], g)}), drawn ${random.drawn} (${pct(random.drawn, g)}); decided on the holdings ${pct(random.by.holdings, g)}, on power ${pct(random.by.power, g)}`);
    }
    if (regulars) {
      console.log(`THE REGULARS (${nRegulars} games a temper and a grade): the starter deck's win rate, greedy, no slip`);
      console.log(`  ${''.padEnd(9)}${GRADE_SAID.map((x) => x.padStart(9)).join('')}`);
      for (const temper of ILIAC_TEMPER_NAMES) console.log(`  ${TEMPER_SAID[temper].padEnd(9)}${regulars[temper].map((r) => pct(r.won, r.games).padStart(9)).join('')}`);
    }
  }
}
