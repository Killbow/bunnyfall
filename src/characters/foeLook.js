import { ENEMY_BASICS } from './enemyBasics.js';

const _ghosts = [];
export function registerFoeGhost(fn) {
  if (typeof fn !== 'function') throw new Error('registerFoeGhost: a function of (mobileType)');
  _ghosts.push(fn);
}
export function _resetFoeGhosts() { _ghosts.length = 0; }

export const foeWearsGhost = (mobileType, row = ENEMY_BASICS[mobileType]) => row?.behaviour === 'Spectral' || _ghosts.some((fn) => fn(mobileType) === true);

export function setupFoeLook(batch, mobileType, row = ENEMY_BASICS[mobileType]) {
  if (!batch) return batch;
  if (foeWearsGhost(mobileType, row)) batch.ghost = true;
  if (row?.noShadow === true) batch.noShadow = true;
  return batch;
}
