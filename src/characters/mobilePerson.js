import { mobileOrientation } from './mobileUnit.js';
import { REGION_RACES } from '../formats/mapsTables.js';

export const PERSON_MOVE_SPEED = 1.3;
export const PERSON_IDLE_DISTANCE = 2.5;
export const TILE_DOWNGRADE_CHANCE = 0.20;
export const RANDOM_CHANGE_CHANCE = 0.025;
export const PERSON_MOVE_FPS = 4;
export const PERSON_IDLE_FPS = 1;
export const PERSON_IDLE_RECORD = 5;
export const PERSON_GUARD_IDLE_RECORD = 15;

export const PERSON_TEXTURES = Object.freeze({
  Redguard: { male: [381, 382, 383, 384], female: [395, 396, 397, 398] },
  Nord: { male: [387, 388, 389, 390], female: [392, 393, 451, 452] },
  Breton: { male: [385, 386, 391, 394], female: [453, 454, 455, 456] },
});
export const GUARD_TEXTURE = 399;
export const NUM_PERSON_FACE_VARIANTS = 24;
export const PERSON_FACE_RECORDS = Object.freeze({
  Redguard: { male: [336, 312, 336, 312], female: [144, 144, 120, 96] },
  Nord: { male: [240, 264, 168, 192], female: [72, 0, 48, 0] },
  Breton: { male: [192, 216, 288, 240], female: [72, 72, 24, 72] },
});
export const RACE_OF_PEOPLE = Object.freeze({ 0: 'Nord', 2: 'Redguard', 3: 'Breton' });
/** @param {number|undefined|null} people */
export const raceOfPeople = (people) => RACE_OF_PEOPLE[/** @type {0|2|3} */ (people)] ?? 'Breton';
/** @param {number|undefined|null} region */
export const redguardRegion = (region) => Number.isInteger(region) && REGION_RACES[/** @type {number} */ (region)] === 1;
/**
 * @param {number|undefined|null} people
 * @param {number|undefined|null} region
 */
export const walkerRace = (people, region) => (redguardRegion(region) ? 'Redguard' : raceOfPeople(people));

/**
 * @param distanceToPlayer
 * @param inBeastForm
 */
export function personWantsToStop({
  playerStandingStill = false,
  distanceToPlayer = Infinity,
  sheathed = false,
  invisible = false,
  inBeastForm = false,
  enemiesNearby = () => false,
} = {}) {
  const withinIdleDistance = distanceToPlayer < PERSON_IDLE_DISTANCE;
  const wantsToStop = !!playerStandingStill && withinIdleDistance
    && !!sheathed && !invisible && !inBeastForm;
  return wantsToStop && !enemiesNearby();
}

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIR_YAW = [0, Math.PI, Math.PI / 2, -Math.PI / 2];

export const MOVE_RECORDS = Object.freeze([0, 1, 2, 3, 4, 3, 2, 1]);
export const MOVE_FLIPS = Object.freeze([false, false, false, false, false, true, true, true]);

export class MobilePerson {
  /**
   * @param nav
   * @param opts { archive, guard, frameCount(record, archive), collider, groundY(x,z), rand }
   */
  constructor(nav, { archive, guard = false, frameCount, collider = null, groundY = () => 0, rand = Math.random } = {}) {
    this.nav = nav;
    this.archive = archive;
    this.guard = guard;
    this.frameCount = frameCount;
    this.collider = collider;
    this.groundY = groundY;
    this.rand = rand;
    this.state = 'seek';
    this.dir = Math.floor(rand() * 4);
    this.gx = -1; this.gy = -1;
    this.tx = -1; this.ty = -1;
    this.pos = [0, 0, 0];
    this.target = [0, 0, 0];
    this.seekCount = 0;
    this.moveCount = 0;
    this.frame = 0;
    this._timer = 0;
  }

  place(gx, gy) {
    this.gx = gx; this.gy = gy;
    const [x, z] = this.nav.navToWorld(gx, gy);
    this.pos = [x, this.groundY(x, z), z];
    // Targeting self keeps a resume from idle before the first seek from walking to a stale target.
    this.target = [...this.pos];
    this.tx = -1; this.ty = -1;
    this.state = 'seek';
    this.seekCount = 0;
    this.moveCount = 0;
  }

  setIdentity(archive, guard) { this.archive = archive; this.guard = guard; }

  personFaceRecordId = 0;

  get facingYaw() { return DIR_YAW[this.dir] ?? 0; }

  release() { this.nav.clearOccupied(this.gx, this.gy); this.nav.clearOccupied(this.tx, this.ty); }

  _weight(d) {
    const gx = this.gx + DIRS[d][0], gy = this.gy + DIRS[d][1];
    return this.nav.occupied(gx, gy) ? 0 : this.nav.weightAt(gx, gy);
  }

  _clear(d) {
    if (!this.collider) return true;
    const gx = this.gx + DIRS[d][0], gy = this.gy + DIRS[d][1];
    const [x, z] = this.nav.navToWorld(gx, gy);
    const ty = this.groundY(x, z) + 0.1;
    const from = [this.pos[0], this.pos[1] + 0.1, this.pos[2]];
    const dx = x - from[0], dy = ty - from[1], dz = z - from[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    const hit = this.collider.raycast(from, [dx / l, dy / l, dz / l], l);
    return !Number.isFinite(hit) || hit >= l - 1e-3;
  }

  _seek() {
    this.seekCount++;
    if (this.gx === -1 || this.gy === -1) {
      [this.gx, this.gy] = this.nav.worldToNav(this.pos[0], this.pos[2]);
    }
    const weights = [this._weight(0), this._weight(1), this._weight(2), this._weight(3)];
    const currentWeight = this.nav.weightAt(this.gx, this.gy);
    let targetWeight = this._clear(this.dir) ? weights[this.dir] : 0;
    if (this.rand() < RANDOM_CHANGE_CHANCE) targetWeight = 0;
    if (targetWeight === 0) {
      const d = Math.floor(this.rand() * 4);
      if (weights[d] === 0 || !this._clear(d)) return;
      this.dir = d;
      this._setTarget();
      return;
    }
    if (targetWeight < currentWeight && this.rand() > TILE_DOWNGRADE_CHANCE) {
      let bestWeight = targetWeight, bestDir = this.dir;
      const order = [0, 1, 2].sort(() => this.rand() - 0.5);
      for (const d of order) {
        if (weights[d] > bestWeight && this._clear(d)) { bestWeight = weights[d]; bestDir = d; }
      }
      this.dir = bestDir;
      this._setTarget();
      return;
    }
    this._setTarget();
  }

  _setTarget() {
    this.tx = this.gx + DIRS[this.dir][0];
    this.ty = this.gy + DIRS[this.dir][1];
    const [x, z] = this.nav.navToWorld(this.tx, this.ty);
    this.target = [x, this.groundY(x, z), z];
    this.nav.clearOccupied(this.gx, this.gy);
    this.nav.setOccupied(this.tx, this.ty);
    this.state = 'move';
    this.seekCount = 0;
  }

  /**
   * @param wantsToStop
   * @returns {record, frame, flip}
   */
  update(dt, cameraPos, wantsToStop = false) {
    if (!wantsToStop && this.state === 'idle') { this.state = 'move'; this.frame = 0; this._timer = 0; }
    else if (wantsToStop && this.state !== 'idle') { this.state = 'idle'; this.frame = 0; this._timer = 0; }

    if (this.state === 'seek') this._seek();
    else if (this.state === 'move') {
      const dx = this.target[0] - this.pos[0], dy = this.target[1] - this.pos[1], dz = this.target[2] - this.pos[2];
      const l = Math.hypot(dx, dy, dz);
      if (l < 0.1) {
        this.gx = this.tx; this.gy = this.ty;
        this.state = 'seek';
        this.moveCount++;
      } else {
        const step = Math.min(PERSON_MOVE_SPEED * dt, l);
        this.pos[0] += (dx / l) * step; this.pos[1] += (dy / l) * step; this.pos[2] += (dz / l) * step;
      }
    }

    const fps = this.state === 'idle' ? PERSON_IDLE_FPS : PERSON_MOVE_FPS;
    this._timer += dt;
    while (this._timer >= 1 / fps) { this._timer -= 1 / fps; this.frame++; }
    if (this.state === 'idle') {
      const rec = this.guard ? PERSON_GUARD_IDLE_RECORD : PERSON_IDLE_RECORD;
      const n = Math.max(1, this.frameCount(rec, this.archive));
      return this._frameOut(rec, this.frame % n, false);
    }
    const o = mobileOrientation(DIR_YAW[this.dir], this.pos, cameraPos);
    const rec = MOVE_RECORDS[o];
    const n = Math.max(1, this.frameCount(rec, this.archive));
    return this._frameOut(rec, this.frame % n, MOVE_FLIPS[o]);
  }

  _frameOut(record, frame, flip) {
    const o = this._out ??= { record: 0, frame: 0, flip: false };
    o.record = record; o.frame = frame; o.flip = flip;
    return o;
  }
}
