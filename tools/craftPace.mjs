#!/usr/bin/env node
// Counts the crafts each crafting track takes to Journeyman and Master, or derives the first-make shares
// that match Smithing's pace. Run: node tools/craftPace.mjs [500] [--shares].

import { RECIPES, firstCraftKey, firstCraftPays, firstCraftXp, workFirstXp, brewFirstXp, craftXp, cookXp, masonXp, FIRST_MAKE_FLOOR } from '../src/net/recipeLaw.js';
import { WORK_RECIPES, trackOf, rankOfXp, xpForRank, JOURNEYMAN_RANK, PROF_RANK_MAX } from '../src/net/professionLaw.js';
import { POTIONS, brewXp, brewFirstPays } from '../src/net/alchemyLaw.js';
import { isMain } from './lib/isMain.mjs';

/**
 * @param {number|Record<string, number>|null} flat
 * @param {string} track
 * @param {number} law
 * @param {boolean} pays
 */
const firstOf = (flat, track, law, pays) => {
  const share = typeof flat === 'number' ? flat : flat?.[track];
  return share == null ? law : pays ? share : 0;
};

/** @param {number|Record<string, number>|null} flat */
function actsOf(flat) {
  const acts = new Map();
  const add = (track, a) => acts.set(track, [...(acts.get(track) ?? []), a]);
  for (const r of RECIPES) {
    if (r.later) continue;
    const track = trackOf(r.profession);
    add(track, {
      key: firstCraftKey(r), rank: r.rank, spec: r.spec ?? null,
      first: firstOf(flat, track, firstCraftXp(r, true), firstCraftPays(r, true)),
      xp: (rank) => (r.kind === 'dish' ? cookXp(rank, { clean: true }) : craftXp(r.tier, rank)),
    });
  }
  for (const w of WORK_RECIPES) {
    if (!w.act) continue;
    add(trackOf(w.xp), { key: `work:${w.id}`, rank: w.rank ?? 0, spec: null, first: firstOf(flat, trackOf(w.xp), workFirstXp(w), true), xp: (rank) => masonXp(1, rank, { clean: true }) });
  }
  for (const p of POTIONS) {
    add(trackOf('alchemy'), { key: `brew:${p.id}`, rank: p.rank, spec: null, first: firstOf(flat, trackOf('alchemy'), brewFirstXp(p), brewFirstPays(p)), xp: (rank) => brewXp(p, rank) });
  }
  return acts;
}

/**
 * @param {number|Record<string, number>|null} [flat]
 * @param {string[]|null} [only]
 */
export function craftPace(flat = null, only = null) {
  const out = {};
  for (const [track, list] of actsOf(flat)) {
    if (only && !only.includes(track)) continue;
    let xp = 0, n = 0, journeyman = null, master = null;
    const made = new Set();
    while (xp < xpForRank(PROF_RANK_MAX) && n < 100_000) {
      const rank = rankOfXp(xp);
      let best = 0, bestKey = null;
      for (const a of list) {
        if (rank < a.rank || (a.spec && rank < PROF_RANK_MAX)) continue;
        const first = made.has(a.key) ? 0 : a.first;
        const v = a.xp(rank) + first;
        if (v > best) { best = v; bestKey = first > 0 ? a.key : null; }
      }
      if (bestKey) made.add(bestKey);
      xp += best; n++;
      if (journeyman == null && xp >= xpForRank(JOURNEYMAN_RANK)) journeyman = n;
      if (master == null && xp >= xpForRank(PROF_RANK_MAX)) master = n;
    }
    out[track] = { journeyman, master, firsts: made.size };
  }
  return out;
}

/** @param {number} [target] */
export function firstShares(target = craftPace(FIRST_MAKE_FLOOR, ['smithing']).smithing.master) {
  const out = {};
  for (const track of actsOf(null).keys()) {
    const reaches = (/** @type {number} */ share) => (craftPace({ [track]: share }, [track])[track].master ?? Infinity) <= target;
    let lo = FIRST_MAKE_FLOOR, hi = FIRST_MAKE_FLOOR;
    if (reaches(lo)) { out[track] = lo; continue; }
    while (!reaches(hi)) { lo = hi; hi *= 2; }
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (reaches(mid)) hi = mid; else lo = mid; }
    out[track] = hi;
  }
  return out;
}

if (isMain(import.meta.url)) {
  if (process.argv[2] === '--shares') console.log(JSON.stringify(firstShares(), null, 2));
  else console.log(JSON.stringify(craftPace(process.argv[2] != null ? Number(process.argv[2]) : null), null, 2));
}
