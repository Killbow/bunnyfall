// @ts-check
import { wildInside } from '../wildZone.js';
import { etherWildRingAt } from './etherWild.js';
import { worldCoordToMapPixel } from '../streamingWorld.js';
import { WAGON_MODE } from '../../travel/horseCartLaw.js';
import { wildCartMayBeAway } from './wildDropLaw.js';

/**
 * @param {any} rec
 * @param {any} mask
 * @returns {boolean}
 */
export function wildCartAway(rec, mask) {
  if (!wildCartMayBeAway(rec)) return false;
  if (rec.Mode !== WAGON_MODE.Deployed) return true;
  if (!mask) return false;
  const p = worldCoordToMapPixel(rec.WorldX, rec.WorldZ);
  return !wildInside(mask, p.x, p.y) && !(etherWildRingAt(p.x, p.y) > 0);
}

/**
 * @param {boolean} on
 * @param {any} rec
 * @param {any} mask
 */
export const wildCartWord = (on, rec, mask) => ({ cart: on && wildCartAway(rec, mask) ? 0 : 1 });
