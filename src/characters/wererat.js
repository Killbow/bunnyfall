// @ts-check
import { MOBILE_TYPES } from './mobileTypes.js';

export const WERERAT = 3143;
export const WERERAT_LEVEL = 3;
export const WERERAT_MAX_HEALTH = 60;
export const WERERAT_CHANCE = 0.04;
export const WERERAT_RAT_COUNT = 10;

export function rollWererat(type, roll) {
  return type === MOBILE_TYPES.Rat && roll() < WERERAT_CHANCE ? WERERAT : type;
}
