// @ts-check
import { captainsDue } from '../../items/sigilSetPowers.js';
import { rollElthericPiece, elthericChance, TIDEMAIL_SALT } from '../../items/aetheric.js';
import { setById } from '../../items/sigilSets.js';
import { mulberry32 } from '../../combat/bloodArt.js';
import { t } from '../../ui/textManager.js';

export function dueOnHull(/** @type {any} */ hurt, due = captainsDue()) {
  const k = due.hull;
  if (k !== 1) { if (Number.isFinite(hurt.hull)) hurt.hull *= k; if (Number.isFinite(hurt.sail)) hurt.sail *= k; }
  return hurt;
}

/**
 * @param {{ name: string, band: string }} legend
 * @param {number} seed
 * @param {unknown} paid
 * @param {{ give: (items: any[]) => void, say: (text: string, s: number) => void }} out
 */
export function legendTidemail(legend, seed, paid, { give, say }) {
  if (!(Number(paid) > 0)) return null;
  const piece = rollElthericPiece(mulberry32(((seed >>> 0) ^ TIDEMAIL_SALT) >>> 0), elthericChance('legend', legend.band));
  if (!piece) return null;
  give([piece]);
  say(t('sea.tidemail.legend', 'From {ship}: {piece}, a piece of {set}!', { ship: legend.name, piece: piece.name, set: setById('eltheric')?.name ?? '' }), 6);
  return piece;
}
