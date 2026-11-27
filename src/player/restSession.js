import { getInt, getBool } from '../platform/settings.js';
import { roomRemainingHours } from '../trade/tavern.js';
import { BUILDING_TYPES } from '../world/buildingNames.js';
import { localizedText, formatText } from '../ui/textManager.js';

export const MINUTES_PER_TICK = 10;
export const REST_WAIT_PER_HOUR = 0.75;
export const LOITER_WAIT_PER_HOUR = 1.25;
export const loiterLimitHours = () => getInt('Enhancements', 'LoiterLimitInHours', 3, 12);

export const REST_TEXT = Object.freeze({
  loiterDone: 349, healed: 350, wakeUp: 353, enemiesNearby: 354, cannotRestNow: 355,
  cityCampingIllegal: 17,
});
export const HAVE_NOT_RENTED_ROOM = 'You have not rented a room here.';
export const ILLEGAL_REST_WARNING = 'It is illegal to camp in or near a city. Continue?';
export const illegalRestWarningText = () => localizedText('illegalRestWarning', ILLEGAL_REST_WARNING);
export const BUILDING_TAVERN = BUILDING_TYPES.Tavern;
export const BUILDING_SHIP = BUILDING_TYPES.Ship;
export const BUILDING_NONE = -1;

export { roomRemainingHours as remainingHoursRented };

const preventRestConditions = new Map();

export function registerPreventRestCondition(handler, message) {
  if (typeof handler !== 'function') return;
  preventRestConditions.set(handler, message == null ? '' : message);
}

export function unregisterPreventRestCondition(handler) {
  preventRestConditions.delete(handler);
}

export function getPreventedRestMessage() {
  for (const [handler, message] of preventRestConditions) {
    if (handler()) return message;
  }
  return null;
}

export function clearPreventRestConditions() { preventRestConditions.clear(); }

// Pass preventedMessage as a function: DFU asks the prevented-rest registry only after the enemy and ground checks.
export function restDecision({
  enemiesNearby = false, swimming = false, grounded = true,
  preventedMessage = null, giveOffer = null, racialOverrideBlocks = false,
} = {}) {
  if (enemiesNearby) return { kind: 'enemies', textId: REST_TEXT.enemiesNearby };
  if (swimming || !grounded) return { kind: 'cannot', textId: REST_TEXT.cannotRestNow };
  const prevented = typeof preventedMessage === 'function' ? preventedMessage() : preventedMessage;
  if (prevented !== null && prevented !== undefined) {
    return prevented === ''
      ? { kind: 'cannot', textId: REST_TEXT.cannotRestNow }
      : { kind: 'prevented', message: prevented };
  }
  if (typeof giveOffer === 'function' ? giveOffer() : !!giveOffer) return { kind: 'offer' };
  if (racialOverrideBlocks) return { kind: 'blocked' };
  return { kind: 'rest' };
}

export function canRest({
  inTownOutside = false,
  inTownLocation = false,
  insideBuilding = false,
  buildingType = null,
  permanentScene = false,
  isShip = false,
  houseOwned = false,
  room = null,
  nowMinutes = 0,
  restMarkers = 0,
  guildCanRest = false,
  alreadyWarned = false,
} = {}) {
  if (inTownOutside) {
    return {
      allowed: alreadyWarned,
      textId: alreadyWarned ? null : REST_TEXT.cityCampingIllegal,
      crime: 'Vagrancy', spawnGuards: true,
      hoursRented: -1, bedIndex: -1,
    };
  }
  if (inTownLocation && insideBuilding) {
    let hoursRented = -1;
    let bedIndex = -1;
    if (permanentScene) {
      if (isShip || houseOwned) return { allowed: true, hoursRented: -1, bedIndex: -1 };
      hoursRented = roomRemainingHours(room, nowMinutes);
      const idx = (room && room.allocatedBedIndex >= 0 && room.allocatedBedIndex < restMarkers)
        ? room.allocatedBedIndex : 0;
      bedIndex = restMarkers > 0 ? idx : -1;
      if (hoursRented > 0) return { allowed: true, hoursRented, bedIndex };
    }
    if (buildingType !== BUILDING_TAVERN && guildCanRest) {
      return { allowed: true, hoursRented, bedIndex: restMarkers > 0 ? 0 : -1 };
    }
    return { allowed: false, line: localizedText('haveNotRentedRoom', HAVE_NOT_RENTED_ROOM), hoursRented, bedIndex };
  }
  return { allowed: true, hoursRented: -1, bedIndex: -1 };
}
export const REST_PROMPT = 'Rest how many hours : ';
export const CANNOT_REST_MORE_THAN_99_HOURS_ID = 26;
export const MAX_REST_HOURS = 99;
export const PROMPT_MAX_CHARS = 8;
export const PROMPT_INITIAL = '0';
export const LOITER_PROMPT = 'Loiter how many hours : ';
export const restPrompt = () => localizedText('restHowManyHours', REST_PROMPT);
export const loiterPrompt = () => localizedText('loiterHowManyHours', LOITER_PROMPT);
export const cannotLoiterLines = () => Object.freeze([
  localizedText('cannotLoiterMoreThanXHours1', 'You cannot loiter more'),
  formatText(localizedText('cannotLoiterMoreThanXHours2', 'than {0} hours at a time.'), loiterLimitHours()),
]);

export const EXPIRED_RENTED_ROOM = 'Your time for this room has expired.';
export const illegalRestWarning = () => getBool('GUI', 'IllegalRestWarning');

export function interiorRestPlace({
  inTownLocation = false, building = null, nowMinutes = 0,
  restMarkers = 0, permanentScene = false, houseOwned = false,
  room = null, guildCanRest = false, homeBed = false,
} = {}) {
  const buildingType = building?.buildingType ?? BUILDING_NONE;
  return {
    inTownOutside: false,
    inTownLocation,
    insideBuilding: true,
    buildingType,
    isShip: buildingType === BUILDING_SHIP,
    permanentScene: permanentScene || homeBed,
    houseOwned: houseOwned || homeBed,
    room,
    nowMinutes,
    restMarkers,
    guildCanRest,
  };
}

/**
 * @param {{ houseOwned?: boolean, isShip?: boolean, room?: any } | null} place
 * @param {{ pressedBed?: boolean, fireNear?: boolean }} [o]
 */
export function interiorRestSpot(place, { pressedBed = false, fireNear = false } = {}) {
  if (pressedBed || place?.houseOwned || place?.isShip || place?.room) return { kind: 'bed', where: null };
  return fireNear ? { kind: 'camp', where: 'fire' } : { kind: 'rough', where: null };
}

export class RestSession {
  constructor(mode, hours, deps, remainingHoursRented = -1, isTopWindow = null) {
    this.mode = mode;
    this.hoursRemaining = hours ?? 0;
    this.deps = deps;
    this.remainingHoursRented = remainingHoursRented;
    this.isTopWindow = isTopWindow;
    this.totalHours = 0;
    this._minutesOfHour = 0;
    this._timer = 0;
    this._abortEnemySpawn = false;
    this._subTickEvery = (mode === 'loiter' ? LOITER_WAIT_PER_HOUR : REST_WAIT_PER_HOUR) / MINUTES_PER_TICK;
  }

  endEarly() {
    if (this.mode === 'loiter') return this._finish(REST_TEXT.loiterDone);
    if (this.mode === 'full' && this.deps.fullyHealed?.()) return this._finish(REST_TEXT.healed);
    return this._finish(REST_TEXT.wakeUp);
  }

  abortForEnemySpawn() { this._abortEnemySpawn = true; }

  _prevented() {
    const m = this.deps.preventedRestMessage?.();
    if (m === null || m === undefined) return null;
    return m === ''
      ? { textId: REST_TEXT.cannotRestNow, prevented: true, enemyBroke: false, died: false }
      : { textId: null, text: m, prevented: true, enemyBroke: false, died: false };
  }

  _covered() { return this.isTopWindow ? !this.isTopWindow() : false; }

  _accrue(dt) {
    this._timer += dt;
  }

  _takeSubTick() {
    if (this._timer < this._subTickEvery) return false;
    this._timer -= this._subTickEvery;
    return true;
  }

  checkRent() {
    if (this.remainingHoursRented === -1) return false;
    this.remainingHoursRented--;
    return this.remainingHoursRented === 0;
  }

  _finish(textId) {
    if (this.remainingHoursRented === 0) return { textId: null, text: localizedText('expiredRentedRoom', EXPIRED_RENTED_ROOM), rentExpired: true, enemyBroke: false, died: false };
    return { textId, enemyBroke: false, died: false };
  }

  tick(dt) {
    if (this.deps.dead()) return { textId: null, enemyBroke: false, died: true };
    if (this.mode === 'full' && this.deps.fullyHealed?.()) return this._finish(REST_TEXT.healed);
    if (this.mode !== 'full' && this.hoursRemaining < 1) {
      return this._finish(this.mode === 'loiter' ? REST_TEXT.loiterDone : REST_TEXT.wakeUp);
    }

    // DFU order: the enemy abort, then the follower cancel, then the prevented-rest poll, all before the covered test.
    if (this._abortEnemySpawn) {
      this._abortEnemySpawn = false;
      this.deps.onEnemyBreak?.();
      return { textId: REST_TEXT.enemiesNearby, enemyBroke: true, died: false };
    }

    if (this.deps.canceledByFollower?.()) return this.endEarly();

    const preventedNow = this._prevented();
    if (preventedNow) return preventedNow;

    if (this._covered()) return null;

    this._accrue(dt);
    while (this._takeSubTick()) {
      this.deps.advanceMinutes(MINUTES_PER_TICK);
      this.deps.tickQuests?.();
      this._minutesOfHour += MINUTES_PER_TICK;
      if (this._minutesOfHour < 60) {
        if (this._covered()) return null;
        continue;
      }
      this._minutesOfHour = 0;
      this.totalHours++;
      if (this._covered()) return null;
      if (this.deps.enemiesNearby()) { this.deps.onEnemyBreak?.(); return { textId: REST_TEXT.enemiesNearby, enemyBroke: true, died: false }; }
      const preventedHour = this._prevented();
      if (preventedHour) return preventedHour;
      let done = null;
      if (this.mode === 'timed') {
        this.deps.tickVitals();
        if (--this.hoursRemaining < 1) done = REST_TEXT.wakeUp;
      } else if (this.mode === 'full') {
        if (this.deps.tickVitals()) done = REST_TEXT.healed;
      } else {
        if (--this.hoursRemaining < 1) done = REST_TEXT.loiterDone;
      }
      const rentUp = this.checkRent();
      if (done !== null || rentUp) return this._finish(done ?? REST_TEXT.wakeUp);
    }
    return null;
  }
}
