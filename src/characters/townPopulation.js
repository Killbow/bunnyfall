// Wandering-NPC pool for towns, following Daggerfall Unity's PopulationManager rules.
import { PERSON_TEXTURES, PERSON_FACE_RECORDS, NUM_PERSON_FACE_VARIANTS, GUARD_TEXTURE, MobilePerson } from './mobilePerson.js';
import { NAV_CELL } from '../world/cityNavigation.js';
import { fullName, getNameBank, GENDERS } from './nameHelper.js';

export const POP_TICKS_PER_SECOND = 10;
export const POP_PER_16_BLOCKS = 24;
export const POP_SPAWN_RADIUS = 96;
export const POP_RECYCLE_DISTANCE = 150;
export const POP_VISIBLE_RANGE = 120;
export const POP_MAX_SEEKS = 4;
export const POP_SPAWN_RANGE_OUTSIDE_RECT = 2500 * 0.025;
export const GUARD_CHANCE_DENOM = 32;

export function maxPopulationFor(totalBlocks) {
  return Math.max(1, Math.min(4, Math.floor(totalBlocks / 16))) * POP_PER_16_BLOCKS;
}

export function popAllowChange(dx, dz, viewYaw, dist = Math.hypot(dx, dz)) {
  return dist > POP_VISIBLE_RANGE || !(dx * Math.sin(viewYaw) + dz * Math.cos(viewYaw) > 0);
}

export class TownPopulation {
  /**
   * @param nav
   * @param opts
   */
  constructor(nav, { totalBlocks, race = 'Breton', nameBank = null, makePerson, rand = Math.random, suppressSpawns = () => false } = {}) {
    this.suppressSpawns = suppressSpawns;
    this.nav = nav;
    this.race = race;
    this.nameBank = nameBank;
    this.makePerson = makePerson;
    this.rand = rand;
    this.maxPopulation = maxPopulationFor(totalBlocks);
    this.pool = [];
    this._timer = 0;
  }

  _freeItem() {
    for (const item of this.pool) if (!item.active) return item;
    if (this.pool.length >= this.maxPopulation) return null;
    const item = { person: this.makePerson(GUARD_TEXTURE, false), active: false, scheduleEnable: false, scheduleRecycle: false, visible: false };
    this.pool.push(item);
    return item;
  }

  _randomiseNPC(person) {
    const bank = this.nameBank ?? getNameBank(this.race);
    if (Math.floor(this.rand() * GUARD_CHANCE_DENOM) === 0) {
      person.setIdentity(GUARD_TEXTURE, true);
      person.gender = GENDERS.Male;
      person.nameNPC = fullName(bank, GENDERS.Male);
      this._setFaceRecord(person, GENDERS.Male, 0);
      return;
    }
    const tables = PERSON_TEXTURES[this.race] ?? PERSON_TEXTURES.Breton;
    const female = Math.floor(this.rand() * 2) === 1;
    const genderTable = female ? tables.female : tables.male;
    const variant = Math.floor(this.rand() * genderTable.length);
    person.setIdentity(genderTable[variant], false);
    person.gender = female ? GENDERS.Female : GENDERS.Male;
    person.nameNPC = fullName(bank, person.gender);
    this._setFaceRecord(person, person.gender, variant);
  }

  _setFaceRecord(person, gender, variant) {
    const faces = PERSON_FACE_RECORDS[this.race] ?? PERSON_FACE_RECORDS.Breton;
    const table = gender === GENDERS.Female ? faces.female : faces.male;
    person.personFaceRecordId = table[variant] + Math.floor(this.rand() * NUM_PERSON_FACE_VARIANTS);
  }

  _tick(playerPos, viewYaw, isDay) {
    const m = POP_SPAWN_RANGE_OUTSIDE_RECT;
    const inRange =
      playerPos[0] >= -m && playerPos[0] <= this.nav.width * NAV_CELL + m &&
      playerPos[2] >= -m && playerPos[2] <= this.nav.height * NAV_CELL + m;
    if (inRange) {
      const [pgx, pgy] = this.nav.worldToNav(playerPos[0], playerPos[2]);
      const item = this._freeItem();
      if (item) {
        const spawn = this.nav.getRandomSpawnPosition(pgx, pgy, POP_SPAWN_RADIUS, 10, this.rand);
        if (spawn) {
          this._randomiseNPC(item.person);
          item.person.place(spawn[0], spawn[1]);
          item.active = true;
          item.scheduleEnable = true;
          item.visible = false;
        }
      }
    }
    for (const it of this.pool) {
      if (!it.active) continue;
      const dx = it.person.pos[0] - playerPos[0], dz = it.person.pos[2] - playerPos[2];
      const dist = Math.hypot(dx, it.person.pos[1] - playerPos[1], dz);
      const allowChange = popAllowChange(dx, dz, viewYaw, dist);
      if (it.scheduleEnable && allowChange && isDay && !this.suppressSpawns()) { it.scheduleEnable = false; it.visible = true; }
      if (it.person.seekCount > POP_MAX_SEEKS || dist > POP_RECYCLE_DISTANCE || !isDay) it.scheduleRecycle = true;
      if (it.scheduleRecycle && allowChange) {
        it.person.release();
        it.active = false; it.scheduleEnable = false; it.scheduleRecycle = false; it.visible = false;
      }
    }
  }

  retire(person) {
    for (const it of this.pool) {
      if (it.person !== person) continue;
      if (it.active) it.person.release();
      it.active = false; it.scheduleEnable = false; it.scheduleRecycle = false; it.visible = false;
      return true;
    }
    return false;
  }

  update(dt, playerPos, viewYaw, cameraPos, isDay, wantsToStopFn = () => false) {
    this._timer += dt;
    if (this._timer >= 1 / POP_TICKS_PER_SECOND) {
      this._timer = 0;
      this._tick(playerPos, viewYaw, isDay);
    }
    const out = this._live ??= [];
    out.length = 0;
    const seats = this._rows ??= [];
    for (const it of this.pool) {
      if (!it.active || !it.visible) continue;
      const frameOut = it.person.update(dt, cameraPos, wantsToStopFn(it.person));
      if (it.person.moveCount > 0) {
        const seat = seats[out.length] ??= { person: null, out: null };
        seat.person = it.person; seat.out = frameOut;
        out.push(seat);
      }
    }
    return out;
  }
}
