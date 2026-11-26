// @ts-check

import { MOBILE_TYPES as M } from '../characters/mobileTypes.js';
import { ARENA_TEXT } from './arenaText.js';
import { seededRng } from '../weather/wind.js';
import { EXHIBITION_START_MINUTES, EXHIBITION_HOURS, ARENA_SEED, arenaHash, hourIndexOf, exhibitionFor } from '../net/arenaExhibition.js';

export const ARENA_LADDER_VERSION = 1;
export const BOUTS_PER_TIER = 3;

const b = (mobile, level = null) => Object.freeze({ mobile, level });
const champ = (mobile, level = null) => Object.freeze({ mobile, level, elite: true });
/**
 * @type {ReadonlyArray<{ bouts: ReadonlyArray<ReadonlyArray<{ mobile: number, level: number|null }>>, champion: ReadonlyArray<{ mobile: number, level: number|null, elite?: boolean }>, free?: boolean, beasts?: boolean }>}
 */
export const LADDER_TIERS = Object.freeze([
  Object.freeze({ bouts: [[b(M.Thief, 1)], [b(M.Rogue, 2)], [b(M.Barbarian, 3)]], champion: [champ(M.Barbarian, 3)] }),
  Object.freeze({ bouts: [[b(M.Warrior, 3)], [b(M.Monk, 4)], [b(M.Archer, 5)]], champion: [champ(M.Knight, 5)] }),
  Object.freeze({ bouts: [[b(M.Spellsword, 5)], [b(M.Nightblade, 6)], [b(M.Ranger, 7)]], champion: [champ(M.Battlemage, 7)] }),
  Object.freeze({ bouts: [[b(M.Knight, 7)], [b(M.Barbarian, 8)], [b(M.Healer, 9)]], champion: [champ(M.Assassin, 9)] }),
  Object.freeze({ bouts: [[b(M.Battlemage, 9)], [b(M.Sorcerer, 10)], [b(M.Warrior, 11)]], champion: [champ(M.Warrior, 11), champ(M.Warrior, 11)] }),
  Object.freeze({ bouts: [[b(M.GrizzlyBear)], [b(M.SabertoothTiger)], [b(M.GiantScorpion)]], champion: [champ(M.Spriggan)], beasts: true }),
  Object.freeze({ bouts: [[b(M.Knight, 13)], [b(M.Spellsword, 14)], [b(M.Nightblade, 15)]], champion: [champ(M.OrcWarlord)] }),
  Object.freeze({ bouts: [[b(M.Assassin, 15)], [b(M.Battlemage, 16)], [b(M.Monk, 17)]], champion: [champ(M.DaedraSeducer)] }),
  Object.freeze({ bouts: [[b(M.Knight, 17), b(M.Healer, 17)], [b(M.Warrior, 18), b(M.Mage, 18)], [b(M.Knight, 19), b(M.Mage, 19)]], champion: [champ(M.Vampire)] }),
  Object.freeze({ bouts: [[b(M.Knight, 20), b(M.Warrior, 20), b(M.Healer, 20)], [b(M.Assassin, 21), b(M.Battlemage, 21), b(M.Monk, 21)], [b(M.Vampire), b(M.DaedraSeducer), b(M.OrcWarlord)]], champion: [champ(M.IronAtronach)], free: true }),
].map((t) => Object.freeze({ ...t, bouts: Object.freeze(t.bouts.map((x) => Object.freeze(x))), champion: Object.freeze(t.champion) })));

export const BOUT_PURSE = Object.freeze([50, 100, 175, 275, 400, 550, 750, 1000, 1350, 1800]);
export const CHAMPION_PURSE = Object.freeze([200, 400, 700, 1100, 1600, 2200, 3000, 4000, 5400, 10000]);
export const EXHIBITION_PURSE = 100;

export function newArenaLadder() {
  return {
    v: ARENA_LADDER_VERSION, tier: 0, won: 0, paid: 0, champs: Array(LADDER_TIERS.length).fill(false), grand: false,
    record: { wins: 0, losses: 0, yields: 0, falls: 0, ringouts: 0, purses: 0, streak: 0, best: 0 },
  };
}

const int = (v, lo, hi, d = lo) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
export function arenaLadderRestore(raw) {
  const L = newArenaLadder();
  if (!raw || typeof raw !== 'object') return L;
  L.tier = int(raw.tier, 0, LADDER_TIERS.length - 1);
  L.won = int(raw.won, 0, BOUTS_PER_TIER);
  // Older saves have no paid count; treat every bout won as paid.
  L.paid = Math.max(L.won, int(raw.paid, 0, BOUTS_PER_TIER, L.won));
  if (Array.isArray(raw.champs)) L.champs = L.champs.map((_, i) => raw.champs[i] === true);
  L.grand = raw.grand === true;
  const r = raw.record ?? {};
  for (const k of Object.keys(L.record)) L.record[k] = int(r[k], 0, 1e9);
  return L;
}
export function arenaLadderSnapshot(L) {
  const s = arenaLadderRestore(L);
  return { v: ARENA_LADDER_VERSION, tier: s.tier, won: s.won, paid: s.paid, champs: [...s.champs], grand: s.grand, record: { ...s.record } };
}

// repeat marks a bout won before a lost run; it pays no purse or banner points, so a broken run cannot be farmed.
export function nextLadderBout(L) {
  const s = arenaLadderRestore(L);
  if (s.grand) return null;
  const t = LADDER_TIERS[s.tier];
  const champion = s.won >= BOUTS_PER_TIER;
  const grand = champion && s.tier === LADDER_TIERS.length - 1;
  const opponents = champion ? t.champion : t.bouts[s.won];
  const repeat = !champion && s.won < s.paid;
  return {
    tier: s.tier, bout: champion ? BOUTS_PER_TIER : s.won, champion, grand, opponents, free: !!t.free && !champion, beasts: !!t.beasts,
    purse: champion ? CHAMPION_PURSE[s.tier] : repeat ? 0 : BOUT_PURSE[s.tier], repeat,
    label: grand ? ARENA_TEXT.grandLabel : champion ? ARENA_TEXT.champLabel : ARENA_TEXT.boutLabel(s.won + 1),
    tierName: ARENA_TEXT.tiers[s.tier],
  };
}

export function ladderAfter(L, { won, how = '', purse = 0 }) {
  const s = arenaLadderRestore(L);
  const next = nextLadderBout(s);
  const out = { ladder: s, title: null, tierUp: false, grand: false, runLost: false };
  if (!next) return out;
  const r = s.record;
  if (won) {
    r.wins++; r.streak++; r.best = Math.max(r.best, r.streak); r.purses += Math.max(0, Math.round(purse));
    if (next.champion) {
      s.champs[next.tier] = true;
      out.title = ARENA_TEXT.titles[next.tier];
      if (next.grand) { s.grand = true; out.grand = true; s.won = BOUTS_PER_TIER; }
      else { s.tier = Math.min(LADDER_TIERS.length - 1, s.tier + 1); s.won = 0; s.paid = 0; out.tierUp = true; }
    } else s.won = Math.min(BOUTS_PER_TIER, s.won + 1);
  } else {
    // A loss, including a draw on the judges' card, resets the tier to its first bout. Beaten champions stay.
    r.losses++; r.streak = 0;
    out.runLost = s.won > 0;
    s.won = 0;
    if (how === 'yield') r.yields++;
    else if (how === 'fall') r.falls++;
    else if (how === 'ringout') r.ringouts++;
  }
  return out;
}

export function ladderTitle(L) {
  const s = arenaLadderRestore(L);
  if (s.grand) return ARENA_TEXT.titles[LADDER_TIERS.length - 1];
  for (let i = s.champs.length - 1; i >= 0; i--) if (s.champs[i]) return ARENA_TEXT.titles[i];
  return null;
}
export const ladderTitles = (L) => arenaLadderRestore(L).champs.map((c, i) => (c ? ARENA_TEXT.titles[i] : null)).filter(Boolean);

export function practiceBout(L) {
  const s = arenaLadderRestore(L);
  const t = LADDER_TIERS[s.tier];
  return {
    tier: s.tier, bout: 0, champion: false, grand: false, opponents: Object.freeze([t.bouts[0][0]]), free: false, beasts: !!t.beasts,
    purse: 0, label: ARENA_TEXT.undercroft.practiceLabel, tierName: ARENA_TEXT.tiers[s.tier], practice: true,
  };
}
export function hallOfChampions(L, name, champions = []) {
  const s = arenaLadderRestore(L);
  const U = ARENA_TEXT.undercroft;
  const lines = [U.hallTitle, '', U.hallIntro, ''];
  const cut = [];
  if (s.grand) cut.push(U.hallGrand(name));
  for (let i = s.champs.length - 1; i >= 0; i--) if (s.champs[i] && !(s.grand && i === s.champs.length - 1)) cut.push(U.hallTier(U.hallTierName(i + 1, ARENA_TEXT.tiers[i]), ARENA_TEXT.titles[i], name));
  const theirs = Array.isArray(champions) ? champions : [];
  if (!cut.length) lines.push(theirs.length ? U.hallNotYou : U.hallNone);
  else lines.push(...cut, '', U.hallYours(cut.length));
  if (theirs.length) {
    lines.push('', U.hallTheirs);
    for (const c of theirs) lines.push(U.hallTheir(c.season, `${c.name} of ${c.home}`, ARENA_TEXT.teams.the[c.banner] ?? ''));
  }
  return lines;
}

// The exhibition schedule lives in net/arenaExhibition.js, which the relay imports; it cannot load these tables.
export { EXHIBITION_START_MINUTES, EXHIBITION_HOURS, ARENA_SEED, arenaHash, hourIndexOf, exhibitionFor };
export { seededRng };

export function nextExhibitionHour(gameMinutes) {
  let h = hourIndexOf(gameMinutes) + 1;
  for (let k = 0; k < 48; k++, h++) if (EXHIBITION_HOURS.includes(h % 24)) return `${String(h % 24).padStart(2, '0')}:00`;
  return '08:00';
}

export const ARENA_HOMES = Object.freeze([
  ['Daggerfall', 0], ['Wayrest', 0], ['Shornhelm', 0], ['Evermor', 0], ['Camlorn', 0], ['Farrun', 0], ['Northmoor', 0],
  ['Glenpoint', 0], ['Menevia', 0], ['Kambria', 0], ['Gavaudon', 0], ['Urvaius', 0], ['Betony', 0],
  ['Sentinel', 1], ['Totambu', 1], ['Antiphyllos', 1], ['Bergama', 1], ['Ayasofya', 1], ['Myrkwasa', 1], ['Satakalaam', 1],
  ['Skyrim', 2], ['Morrowind', 3], ['the Summerset Isles', 4], ['Valenwood', 5], ['Elsweyr', 6], ['the Imperial City', 7],
  ['Orsinium', 8],
].map(([town, bank]) => Object.freeze({ town, bank })));
export const BEAST_HOMES = Object.freeze(['the Wrothgarian Mountains', 'the Dragontail Mountains', 'the Alik\'r Desert', 'the Ilessan Hills', 'the Bayside Woods', 'Glenumbra Moors']);
