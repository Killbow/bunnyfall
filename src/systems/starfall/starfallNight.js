// @ts-check
import { skyClassicMinutes } from '../../net/skyLaw.js';
import { STAR_HOUR_MS, STAR_FALLS_MS, STAR_PER_NIGHT } from '../../net/starfall/starfallLaw.js';
import { dayOfYearFromMinutes } from '../../world/gameDate.js';
import { HOLIDAYS, holidayDayOfYear } from '../../world/holidays.js';

export const WITCHES_FESTIVAL_DAY = /** @type {number} */ (holidayDayOfYear(HOLIDAYS.Witches_Festival));
export const HEART_STAR = STAR_PER_NIGHT - 1;

// Reads the sky clock, so it is client only: a Heart-Star receipt is like any other, and its extra rolls locally.
export const nightDayOfYear = (n) => dayOfYearFromMinutes(Math.floor(skyClassicMinutes(n * STAR_HOUR_MS + STAR_FALLS_MS[0])));
export const witchesNight = (n) => nightDayOfYear(n) === WITCHES_FESTIVAL_DAY;
export const heartStar = (n, k) => k === HEART_STAR && witchesNight(n);
