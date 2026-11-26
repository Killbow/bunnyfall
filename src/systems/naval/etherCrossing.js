// @ts-check
import { crossingWaters, inVeil, inEtherLaw, landfall, HOME_WATERS, ETHER_WORD, ETHER_SEA_NAME, CROSS_LAND_PX } from '../../world/ethericSea.js';
import { t } from '../../ui/textManager.js';

export const CROSS_DAYS = 3;
export const CROSS_CHECK_S = 0.5;

export function createCrossLand(seaPixel, reach = CROSS_LAND_PX) {
  let at = null;
  return (px, py) => {
    const key = `${px},${py}`;
    if (at?.key === key) return at.d;
    let d = Infinity;
    ring: for (let r = 0; r <= reach; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && !seaPixel(px + dx, py + dy)) { d = r; break ring; }
      }
    }
    at = { key, d };
    return d;
  };
}
export function crossingWayAt(px, py, landPx) {
  if (inVeil(px, py)) return 'home';
  if (crossingWaters(px, py, landPx)) return 'out';
  return null;
}

// A way asked once is not asked again until the ship leaves those waters. The host marks it asked only when the
// question box shows.
export function createCrossingGate() {
  let asked = null;
  return {
    offer(way) {
      if (way !== asked) asked = null;
      return !!way && asked == null;
    },
    asked(way) { asked = way ?? null; },
    get pending() { return asked; },
  };
}

export function crossingTarget(way, from = null) {
  if (way === 'out') return landfall();
  return from && Number.isFinite(from.px) && Number.isFinite(from.py) && !inEtherLaw(from.px, from.py) ? { px: from.px, py: from.py } : { px: HOME_WATERS.px, py: HOME_WATERS.py };
}

// Wraps at run time so one translation key carries a whole sentence in every language.
export function questionRows(text, width = ROW_CHARS) {
  const rows = [];
  let row = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (row && row.length + 1 + word.length > width) { rows.push(row); row = word; } else row = row ? `${row} ${word}` : word;
  }
  if (row) rows.push(row);
  return rows;
}
export const ROW_CHARS = 56;
export function crossingRows(way, { days = CROSS_DAYS, pvp = false } = {}) {
  const time = `${days} ${days === 1 ? 'day' : 'days'}`;
  return way === 'out'
    ? ['The Abecean runs empty to every horizon, and the stars', 'hang strangely low over the water. Sailors say that past', `here the sea is no longer the sea, but the ${ETHER_WORD}.`, '', `Set a course into the open sea? (${time}. Your ship,`, 'its crew and hold go with you.)',
      ...(pvp ? ['', ...questionRows(t('sea.wild.crossWarn', 'Past Veilhaven\'s peace the open sea is an open PvP zone. Other players may attack you there.'))] : [])]
    : ['Ahead the Veil thins, and through it, faint as a memory,', 'lie the gray waters of the Iliac Bay.', '', `Set a course for home? (${time})`];
}
export const crossingWords = (way) => (way === 'out'
  ? `Three days out of sight of land, and then the stars came down to meet the sea. You have crossed into ${ETHER_SEA_NAME}. Veilhaven lies ahead.`
  : 'The Veil closes astern, and the air smells of salt and tar again. The Iliac Bay, and home.');
export const CROSS_REFUSED = Object.freeze({
  get passengers() { return t('ether.cross.passengers', 'Only your party can cross the Veil with you. The crossing waits until only your party is aboard.'); },
  hostile: 'Not with an enemy at your heels.',
});
export const CROSS_STALE = 'The moment has passed. Return to the crossing waters to be asked again.';
export const CROSS_FAILED = 'The crossing failed. You are back where you started.';
