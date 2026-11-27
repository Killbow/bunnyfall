// @ts-check

import { srand, getSeed, setSeed } from '../formats/dfRandom.js';
import { fullName, monsterName, GENDERS, BANK_TYPES } from '../characters/nameHelper.js';
import { enemyDisplayName } from '../characters/enemyBasics.js';
import { MOBILE_TYPES as M } from '../characters/mobileTypes.js';
import { ARENA_TEXT } from './arenaText.js';
import { ARENA_HOMES, BEAST_HOMES, arenaHash, seededRng } from './arenaLadder.js';

export const ARENA_BEASTS = Object.freeze(new Set([M.GrizzlyBear, M.SabertoothTiger, M.GiantScorpion, M.Spriggan, M.IronAtronach]));
const NO_YIELD = new Set([...ARENA_BEASTS, M.DaedraSeducer, M.Vampire]);

// Seeds the shared DFRandom stream with the bout and restores it, so every screen and load draws the same names.
function drawName(seed, bank, gender) {
  const saved = getSeed();
  try {
    srand((seed >>> 0) || 1);
    if (bank === BANK_TYPES.Monster1) return monsterName(gender, () => 0, BANK_TYPES.Monster1);
    return fullName(bank, gender);
  } finally { setSeed(saved); }
}

export function fighterIdentity(seed, i, mobile) {
  const s = arenaHash(seed, 0x100 + i);
  const rng = seededRng(s);
  const epithet = ARENA_TEXT.epithets[Math.floor(rng() * ARENA_TEXT.epithets.length)];
  if (ARENA_BEASTS.has(mobile)) {
    const kind = enemyDisplayName(mobile) ?? 'Beast';
    const from = BEAST_HOMES[Math.floor(rng() * BEAST_HOMES.length)];
    return { name: `The ${kind}`, home: from, epithet: '', billing: ARENA_TEXT.beast(kind, from), gender: 'male', temper: 0, beast: true };
  }
  const isClass = mobile >= 128;
  const female = isClass && rng() < 0.4;
  const gender = female ? GENDERS.Female : GENDERS.Male;
  let home;
  if (mobile === M.OrcWarlord) home = ARENA_HOMES.find((h) => h.town === 'Orsinium');
  else if (mobile === M.DaedraSeducer) home = { town: 'Oblivion', bank: BANK_TYPES.Monster1 };
  else home = ARENA_HOMES.filter((h) => h.town !== 'Orsinium')[Math.floor(rng() * (ARENA_HOMES.length - 1))];
  const bank = home.bank === 8 ? BANK_TYPES.Monster1 : home.bank;
  const name = drawName(s ^ 0x5a5a5a5a, bank, mobile === M.DaedraSeducer ? GENDERS.Female : gender) || enemyDisplayName(mobile) || 'Fighter';
  const temper = NO_YIELD.has(mobile) ? 0 : 0.2 + rng() * 0.7;
  return { name, home: home.town, epithet, billing: `${name} of ${home.town}, ${epithet}`, gender: female || mobile === M.DaedraSeducer ? 'female' : 'male', temper, beast: false };
}

export const MARK_APART_M = 6;
export function boutMarks(sides, perSide) {
  /** @type {number[][][]} */
  const out = [];
  for (let s = 0; s < sides; s++) {
    const marks = [];
    for (let k = 0; k < perSide[s]; k++) {
      if (sides === 2) {
        const x = (s === 0 ? -1 : 1) * MARK_APART_M;
        marks.push([x, (k - (perSide[s] - 1) / 2) * 2.5]);
      } else {
        const a = (s / sides) * Math.PI * 2 + Math.PI;
        marks.push([Math.cos(a) * MARK_APART_M + k * 1.5, Math.sin(a) * MARK_APART_M]);
      }
    }
    out.push(marks);
  }
  return out;
}
export const GATE_OUT_M = 15;
export const boutGateOf = (mark) => [Math.sign(mark[0] || 1) * GATE_OUT_M, mark[1]];
