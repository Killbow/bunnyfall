// Ports DaggerfallDateTime: twelve fixed 30-day months with no leap rules. World minutes are already classic
// minutes counted from the epoch, so read a date with dateFromClassicMinutes(worldMinutes()) and never add
// CLASSIC_GAME_START_TIME again.

import { localizedText, localizedTextList, formatText } from '../ui/textManager.js';

export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;
export const HOURS_PER_DAY = 24;
export const DAYS_PER_WEEK = 7;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;
export const SECONDS_PER_WEEK = 7 * 86400;
export const DAWN_HOUR = 6;
export const DUSK_HOUR = 18;

export const CLASSIC_EPOCH_IN_SECONDS = 12566016000;
export const CLASSIC_GAME_START_TIME = 523530;

// The class field defaults, which differ from the new-game start that SetClassicGameStartTime sets.
export const DEFAULT_DATE = Object.freeze({ year: 405, month: 5, day: 0, hour: 12, minute: 0 });

// Enum values are list indices in DFU declaration order. SEASON_NAMES stays English because the quest Season
// trigger compares season words against it.
export const dayNames = () => localizedTextList('dayNames', ['Sundas', 'Morndas', 'Tirdas', 'Middas', 'Turdas', 'Fredas', 'Loredas']);
export const monthNames = () => localizedTextList('monthNames', ["Morning Star", "Sun's Dawn", 'First Seed', "Rain's Hand",
  'Second Seed', 'Midyear', "Sun's Height", 'Last Seed', 'Hearthfire', 'Frostfall', "Sun's Dusk", 'Evening Star']);
export const birthSignNames = () => localizedTextList('birthSignNames', ['The Ritual', 'The Lover', 'The Lord', 'The Mage',
  'The Shadow', 'The Steed', 'The Apprentice', 'The Warrior', 'The Lady', 'The Tower', 'The Atronach', 'The Thief']);
export const SEASON_NAMES = Object.freeze(['Fall', 'Spring', 'Summer', 'Winter']);
const seasonNames = () => localizedTextList('seasonNames', ['Fall', 'Spring', 'Summer', 'Winter']);
export const SEASONS = Object.freeze({ Fall: 0, Spring: 1, Summer: 2, Winter: 3 });

// Year, month, and day count from zero.
export function dateToSeconds({ year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0 }) {
  return year * (DAYS_PER_YEAR * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE)
    + month * (DAYS_PER_MONTH * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE)
    + day * (HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE)
    + hour * (MINUTES_PER_HOUR * SECONDS_PER_MINUTE)
    + minute * SECONDS_PER_MINUTE
    + Math.trunc(second);
}

export function dateFromSeconds(time) {
  const secondsPerDay = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
  const dayclock = time % secondsPerDay;
  let dayno = Math.floor(time / secondsPerDay);
  const second = dayclock % SECONDS_PER_MINUTE;
  const minute = Math.floor((dayclock % (MINUTES_PER_HOUR * SECONDS_PER_MINUTE)) / SECONDS_PER_MINUTE);
  const hour = Math.floor(dayclock / (MINUTES_PER_HOUR * SECONDS_PER_MINUTE));
  const year = Math.floor(dayno / DAYS_PER_YEAR);
  dayno -= year * DAYS_PER_YEAR;
  const month = Math.floor(dayno / DAYS_PER_MONTH);
  const day = dayno - month * DAYS_PER_MONTH;
  return { year, month, day, hour, minute, second };
}

export const dateToClassicMinutes = (date) =>
  Math.floor((dateToSeconds(date) - CLASSIC_EPOCH_IN_SECONDS) / SECONDS_PER_MINUTE);
export const dateFromClassicMinutes = (minutes) =>
  dateFromSeconds(CLASSIC_EPOCH_IN_SECONDS + minutes * SECONDS_PER_MINUTE);

export const classicGameStartDate = () => dateFromClassicMinutes(CLASSIC_GAME_START_TIME);



export const dayOfYear = (date) => (date.month * DAYS_PER_MONTH) + (date.day + 1);
// Must agree with `dayOfYear` so every caller derives the same day of year from a minute count.
export const dayOfYearFromMinutes = (gameMinutes) =>
  Math.floor((gameMinutes % (DAYS_PER_YEAR * MINUTES_PER_DAY)) / MINUTES_PER_DAY) + 1;
export const monthOfYear = (date) => date.month + 1;
export const dayOfMonth = (date) => date.day + 1;

// The equality tests run before the bands, as in DFU, so ratio 16 reads New rather than OneWax.
export const LUNAR_PHASES = Object.freeze({
  None: -1, New: 0, OneWax: 1, HalfWax: 2, ThreeWax: 3,
  Full: 4, ThreeWane: 5, HalfWane: 6, OneWane: 7,
});
export function lunarPhase(date, { masser = true } = {}) {
  if (date.year < 0) return LUNAR_PHASES.None;
  const offset = masser ? 3 : -1;
  const moonRatio = (dayOfYear(date) + date.year * MONTHS_PER_YEAR * DAYS_PER_MONTH + offset) % 32;
  if (moonRatio === 0) return LUNAR_PHASES.Full;
  if (moonRatio === 16) return LUNAR_PHASES.New;
  if (moonRatio <= 5) return LUNAR_PHASES.ThreeWane;
  if (moonRatio <= 10) return LUNAR_PHASES.HalfWane;
  if (moonRatio <= 15) return LUNAR_PHASES.OneWane;
  if (moonRatio <= 22) return LUNAR_PHASES.OneWax;
  if (moonRatio <= 28) return LUNAR_PHASES.HalfWax;
  return LUNAR_PHASES.ThreeWax;
}
export const lunarPhasesFromMinutes = (gameMinutes) => {
  const date = dateFromClassicMinutes(gameMinutes);
  return {
    masser: lunarPhase(date, { masser: true }),
    secunda: lunarPhase(date, { masser: false }),
  };
};

export function lunarPhaseFraction(date, minuteOfDay, { masser = true } = {}) {
  if (date.year < 0) return 0;
  const offset = masser ? 3 : -1;
  const ratio = ((dayOfYear(date) + date.year * MONTHS_PER_YEAR * DAYS_PER_MONTH + offset) % 32) + (((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / MINUTES_PER_DAY;
  return (4 + ratio / 4) % 8;
}
export const lunarPhaseFractionsFromMinutes = (gameMinutes) => {
  const date = dateFromClassicMinutes(gameMinutes);
  const minuteOfDay = ((gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return {
    masser: lunarPhaseFraction(date, minuteOfDay, { masser: true }),
    secunda: lunarPhaseFraction(date, minuteOfDay, { masser: false }),
  };
};

export const isDayFromMinutes = (gameMinutes) => {
  const hour = dateFromClassicMinutes(gameMinutes).hour;
  return hour >= DAWN_HOUR && hour < DUSK_HOUR;
};
export const isFullMoonFromMinutes = (gameMinutes) => {
  const { masser, secunda } = lunarPhasesFromMinutes(gameMinutes);
  return masser === LUNAR_PHASES.Full || secunda === LUNAR_PHASES.Full;
};
export const nightDateMinutes = (gameMinutes) => {
  const day = Math.floor(gameMinutes / MINUTES_PER_DAY), into = gameMinutes - day * MINUTES_PER_DAY;
  if (into >= DUSK_HOUR * 60) return day * MINUTES_PER_DAY;
  if (into < DAWN_HOUR * 60) return (day - 1) * MINUTES_PER_DAY;
  return null;
};
// True through the night that begins at the dusk of a full-moon date. isFullMoonFromMinutes covers the whole
// calendar day instead.
export const isFullMoonNightFromMinutes = (gameMinutes) => {
  const night = nightDateMinutes(gameMinutes);
  return night !== null && isFullMoonFromMinutes(night);
};
export const minuteOfDay = (date) => (date.hour * MINUTES_PER_HOUR) + date.minute;

export const dayName = (date) => dayNames()[date.day - Math.floor(date.day / DAYS_PER_WEEK) * DAYS_PER_WEEK];
export const monthName = (date) => monthNames()[date.month];
export const birthSignName = (date) => birthSignNames()[date.month];

// Uses clean month boundaries like DFU, although classic Daggerfall rolls seasons over partway through the final
// month.
export function seasonValue(date) {
  const m = date.month;
  if (m === 11 || m === 0 || m === 1) return SEASONS.Winter;
  if (m === 2 || m === 3 || m === 4) return SEASONS.Spring;
  if (m === 5 || m === 6 || m === 7) return SEASONS.Summer;
  if (m === 8 || m === 9 || m === 10) return SEASONS.Fall;
  return SEASONS.Summer;
}
export const seasonName = (date) => seasonNames()[seasonValue(date)];

// The `{3:00}` spec falls on the month name string and prints it plainly, as .NET does. This format has no year.
export const dateString = (date) => formatText(localizedText('dateFormatString', '{0} the {1}{2} of {3:00}'),
  dayName(date), dayOfMonth(date), daySuffix(dayOfMonth(date)), monthName(date));

export function daySuffix(dayOfMonth1) {
  if (dayOfMonth1 === 1 || dayOfMonth1 === 21) return 'st';
  if (dayOfMonth1 === 2 || dayOfMonth1 === 22) return 'nd';
  if (dayOfMonth1 === 3 || dayOfMonth1 === 23) return 'rd';
  return 'th';
}
// `{n:00}` rounds like .NET instead of truncating, so 59.5 seconds prints as 60, matching DFU.
// The day is unpadded here and the month spec drops, matching DFU.
export const dateTimeString = (d) => formatText(localizedText('dateTimeFormatString', '{0:00}:{1:00}:{2:00} on {3}{4} of {5:00}, 3E{6}'),
  d.hour, d.minute, d.second, d.day + 1, daySuffix(d.day + 1), monthName(d), d.year);
// Here the day is padded and the month spec drops, matching DFU.
export const midDateTimeString = (d) => formatText(localizedText('midDateTimeFormatString', '{0:00}:{1:00}:{2:00} {3:00} {4:00} 3E{5}'),
  d.hour, d.minute, d.second, d.day + 1, monthName(d), d.year);
