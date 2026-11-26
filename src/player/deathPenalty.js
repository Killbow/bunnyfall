// Gold lost on an online death: a tenth of the gold carried.
import { goldPiecesOf } from '../items/inventory.js';

export const DEATH_GOLD_DIVISOR = 10;
export const DEATH_GOLD_FRACTION = 1 / DEATH_GOLD_DIVISOR;

export function deathGoldLoss(gold) {
  const g = Number.isFinite(gold) ? Math.max(0, Math.floor(gold)) : 0;
  return Math.floor(g / DEATH_GOLD_DIVISOR);
}

let _stated = null;
export function stateDeathLoss(lost) { _stated = Number.isSafeInteger(lost) && lost >= 0 ? lost : null; }
export const statedDeathLoss = () => _stated;

export function applyDeathPenalty(player) {
  if (!player) return 0;
  const purse = goldPiecesOf(player);
  const lost = Math.max(0, Math.min(purse, _stated ?? deathGoldLoss(purse)));
  _stated = null;
  if (lost > 0) player.goldPieces = purse - lost;
  return lost;
}

export const deathPenaltyText = (lost) => (lost > 0 ? `Death claimed ${lost} gold from your purse.` : '');

export const DEATH_PENALTY_LINES = Object.freeze([
  (n) => `Dropped in the dirt, your ${n} gold feeds the shadows.`,
  (n, raw) => `${n} ${raw === 1 ? 'coin scatters' : 'coins scatter'} into the void, leaving only your corpse behind.`,
  (n) => `The reaper collects his toll in gold, not blood: ${n} gold.`,
  (n) => `Your fortune of ${n} gold vanished into the abyss where you fell.`,
]);

export function deathPenaltyLine(lost, roll = Math.random) {
  if (!(lost > 0)) return '';
  const pool = DEATH_PENALTY_LINES;
  return pool[Math.min(pool.length - 1, Math.floor(roll() * pool.length))](lost.toLocaleString('en-US'), lost);
}
