// @ts-check
// Regards count in the character's own days, not the shared sky clock, so time away from the game never eases them.
// Every relations instance must come from `characterRelations`; the day callers pass is ignored. A saved record
// without `clock: 'own'` holds sky-clock stamps and is rebased on load.
import { createRelations, regardStanding, EASE_PER_DAY } from './relations.js';
import { skyMinutes } from '../../world/worldTick.js';

// Matches the living day start, `DAY_START_MIN` (04:00) in dayPlan.js.
export const REGARD_DAY_START_MIN = 240;
/** @param {number} ownMinutes */
export const regardDayOf = (ownMinutes) => Math.floor((ownMinutes - REGARD_DAY_START_MIN) / 1440);
export const REGARD_CLOCK = 'own';
export const FRIENDS_SAID_MAX = 6;

/**
 * A negative regard loads eased by the sky days since it was last seen, so a grudge never returns harsher than the
 * player saw. A positive regard loads as written.
 * @param {Record<string, any>} people
 * @param {number} day
 * @param {number} skyDay
 */
const rebased = (people, day, skyDay) => Object.fromEntries(Object.entries(people).map(([id, e]) => {
  if (!e || typeof e !== 'object') return [id, e];
  const r = Number(e.r), seen = Number(e.seen);
  const eased = r < 0 && Number.isFinite(seen) ? Math.min(0, r + Math.max(0, skyDay - seen) * EASE_PER_DAY) : r;
  return [id, { r: eased, met: day, seen: day, talked: -1 }];
}));

/**
 * Offline, an old record counts as sky-stamped only when a stamp is ahead of today, as in an online save copied
 * offline.
 * @param {any} record
 * @param {number} day
 * @param {boolean} online
 */
const skyStampedIs = (record, day, online) => !!record && typeof record === 'object' && record.v === 1 && record.clock !== REGARD_CLOCK
  && !!record.people && typeof record.people === 'object'
  && (online || Object.values(record.people).some((e) => Number(e?.seen) > day || Number(e?.met) > day || Number(e?.talked) > day));

/**
 * @param {any} record
 * @param {() => number} own
 * @param {boolean} [online]
 * @param {() => number} [sky]
 */
export function characterRelations(record, own, online = false, sky = () => skyMinutes()) {
  const today = () => regardDayOf(own());
  const day = today();
  const rel = createRelations(skyStampedIs(record, day, online) ? { ...record, people: rebased(record.people, day, regardDayOf(sky())) } : record);
  /** @type {string[]} */
  const made = [];
  const isFriend = (/** @type {string} */ id) => regardStanding(rel.regard(id, today())) === 'friend';
  return {
    ...rel,
    /**
     * @param {string} id
     * @param {number} [_day]
     */
    regard: (id, _day) => rel.regard(id, today()),
    /**
     * @param {string} id
     * @param {number} [_day]
     */
    standing: (id, _day) => rel.standing(id, today()),
    /**
     * @param {string} id
     * @param {any} kind
     * @param {number} [_day]
     * @param {number} [amount]
     */
    note: (id, kind, _day, amount) => {
      const was = isFriend(id);
      const r = rel.note(id, kind, today(), amount);
      if (!was && isFriend(id) && !made.includes(id) && made.length < FRIENDS_SAID_MAX) made.push(id);
      return r;
    },
    /**
     * @param {string} id
     * @param {number} amount
     * @param {number} [_day]
     */
    inherit: (id, amount, _day) => rel.inherit(id, amount, today()),
    /**
     * @param {string} id
     * @param {number} [_day]
     */
    seen: (id, _day) => rel.seen(id, today()),
    snapshot: () => ({ ...rel.snapshot(), clock: REGARD_CLOCK }),
    today,
    friendsMade: () => made.splice(0).filter(isFriend),
  };
}
