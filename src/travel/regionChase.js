// @ts-check
// Chase fields travel in the trav frame beside the mark as `bd` and `sr`, never as keys inside the mark, because older
// clients drop a mark with unknown keys.
import { BANDS_WIRE_MAX, BAND_REACH_PX, BAND_CELL_PX } from './travelBands.js';
import { RAIDER_REACH_PX, RAIDER_CELL_PX } from '../systems/naval/seaRaiders.js';
import { TRAV_CHASE_REFRESH_MS } from './travellerMarks.js';

// Two and a half refreshes, so a band stays drawn through one missed refresh.
export const TRAV_BAND_HOLD_MS = 2.5 * TRAV_CHASE_REFRESH_MS;
// Words from senders farther than this are ignored, so a distant traveller in the region cannot spend the bands
// near the reader.
export const REGION_BANDS_NEAR_PX = BAND_REACH_PX + BAND_CELL_PX + 1;
export const REGION_RAIDERS_NEAR_PX = RAIDER_REACH_PX + RAIDER_CELL_PX + 1;

const lifeOf = (id) => Number(String(id).split('.').pop());

function regionWord(word, life) {
  const all = word ?? [];
  return [...all.filter((e) => e[3] === 1), ...all.filter((e) => e[3] !== 1 && lifeOf(e[0]) >= life - 1)].slice(0, BANDS_WIRE_MAX);
}
export function regionChaseWords(bandWord, raidWord, bandLife, raidLife) {
  return { bd: regionWord(bandWord, bandLife), sr: regionWord(raidWord, raidLife) };
}

export function regionChaseHeard(f, me) {
  if (!f?.p || !me) return null;
  const d = Math.max(Math.abs(f.p.px - me.x), Math.abs(f.p.py - me.y));
  return { bd: d <= REGION_BANDS_NEAR_PX && Array.isArray(f.bd) ? f.bd : [], sr: d <= REGION_RAIDERS_NEAR_PX && Array.isArray(f.sr) ? f.sr : [] };
}

// Region-heard entries are recognized by `hold === TRAV_BAND_HOLD_MS`, so entries the cell frame heard from the
// same sender stay.
export function regionChaseWithdraw(peers, from, keep = null) {
  for (const [id, p] of peers) if (p.from === from && p.hold === TRAV_BAND_HOLD_MS && !keep?.has(id)) peers.delete(id);
}
