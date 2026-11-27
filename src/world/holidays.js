import { dayOfYearFromMinutes } from './gameDate.js';
import { LOCATION_TYPES } from '../formats/mapsFile.js';

import { HOLIDAYS, REGION_CELEBRATING_HOLIDAY, HOLIDAY_DAYS_OF_YEAR, HOLIDAY_SEARCH_LIMIT, HOLIDAY_LAST_DAY } from './holidayTables.js';

export { HOLIDAYS, REGION_CELEBRATING_HOLIDAY, HOLIDAY_DAYS_OF_YEAR, holidayDayOfYear, holidayRegion, HOLIDAY_SEARCH_LIMIT, HOLIDAY_LAST_DAY } from './holidayTables.js';

export const MINUTES_PER_YEAR = 518400;

// `gameMinutes` is classic minutes, as `dateToClassicMinutes` produces; the truncating day arithmetic and the 355
// gate match DFU.
export function getHolidayId(gameMinutes, regionIndex) {
  const dayOfYear = dayOfYearFromMinutes(gameMinutes);
  if (dayOfYear > HOLIDAY_LAST_DAY) return HOLIDAYS.None;
  for (let holidayID = 0; holidayID < HOLIDAY_SEARCH_LIMIT; holidayID++) {
    const region = REGION_CELEBRATING_HOLIDAY[holidayID];
    if ((region === 0xFF || region === regionIndex + 1)
      && dayOfYear === HOLIDAY_DAYS_OF_YEAR[holidayID]) {
      return holidayID + 1;
    }
  }
  return HOLIDAYS.None;
}

// Valid because no two rows share a day and every day is within `HOLIDAY_LAST_DAY`, so `getHolidayId` on a day is
// this row when `holidayKeptIn` holds, else None.
let _holidayByDay = null;
export function holidayOn(dayOfYear) {
  if (!_holidayByDay) {
    _holidayByDay = new Map();
    for (let i = 0; i < HOLIDAY_SEARCH_LIMIT; i++) _holidayByDay.set(HOLIDAY_DAYS_OF_YEAR[i], Object.freeze({ id: i + 1, region: REGION_CELEBRATING_HOLIDAY[i] }));
  }
  return _holidayByDay.get(dayOfYear) ?? null;
}
export const holidayKeptIn = (row, regionIndex) => row.region === 0xFF || row.region === regionIndex + 1;

export const FREE_CURE_HOLIDAYS = Object.freeze([
  HOLIDAYS.South_Winds_Prayer, HOLIDAYS.First_Harvest, HOLIDAYS.Second_Harvest,
]);
export const HALF_PRICE_CURE_HOLIDAY = HOLIDAYS.North_Winds_Festival;

export const HOLIDAYS_START_ID = 8349;

export function holidayTextId(gameMinutes, regionIndex) {
  const id = getHolidayId(gameMinutes, regionIndex);
  return id === HOLIDAYS.None ? 0 : HOLIDAYS_START_ID + id;
}

export const HOLIDAY_TEXT_SILENT_LOCATION_TYPES = Object.freeze([
  LOCATION_TYPES.DungeonLabyrinth, LOCATION_TYPES.DungeonKeep,
  LOCATION_TYPES.DungeonRuin, LOCATION_TYPES.Graveyard,
  LOCATION_TYPES.Coven, LOCATION_TYPES.HomeYourShips,
]);

export function holidayTextPrimesFor(locationType) {
  return !HOLIDAY_TEXT_SILENT_LOCATION_TYPES.includes(locationType);
}

export const HOLIDAY_TEXT_PRIME_DELAY = 2.5;
export const HOLIDAY_TEXT_REARM = 10;

// `location` is compared by identity, so the host must pass the same location object that `currentLocation()`
// returns.
export class HolidayTextTimer {
  constructor() {
    this.location = null;
    this.primed = false;
    this.timer = 0;
  }

  // The caller applies the `!isPlayerInside` guard and the `holidayTextPrimesFor` filter, as the DFU handler does.
  enterLocationRect(location) {
    if (this.timer <= 0 && !this.primed) {
      this.timer = HOLIDAY_TEXT_PRIME_DELAY;
      this.primed = true;
    }
    this.location = location;
  }

  // With a window open the box is deferred, not dropped: the timer stays at or below zero and `primed` stays true.
  update(dt, deps) {
    if (this.primed && this.location !== deps.currentLocation()) {
      this.timer = 0;
      this.primed = false;
    }
    if (this.timer > 0) this.timer -= dt;
    if (this.timer <= 0 && this.primed && deps.onHUD()) {
      this.primed = false;
      this.show(deps);
    }
  }

  // The re-arm runs even when no box is shown, as in DFU, so a non-holiday entry also blocks a recheck for ten
  // seconds.
  show(deps) {
    const textId = holidayTextId(deps.gameMinutes(), deps.regionIndex());
    if (textId !== 0) deps.showRecord(textId);
    this.timer = HOLIDAY_TEXT_REARM;
  }
}
