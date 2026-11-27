// @ts-check
// The body of a living-world townsperson on the street. Its steps come from livingTown.js.
import { MobilePerson, MOVE_RECORDS, MOVE_FLIPS, PERSON_MOVE_FPS, PERSON_IDLE_FPS, PERSON_IDLE_RECORD, PERSON_GUARD_IDLE_RECORD } from './mobilePerson.js';
import { mobileOrientation, MobileUnit } from './mobileUnit.js';
import { FlatAnim } from '../render/flatAnimation.js';

export const STAND_FRAME = 0;

export class ResidentWalker extends MobilePerson {
  /**
   * @param {any} nav
   * @param {{ archive: number, guard?: boolean, frameCount: (record: number, archive: number) => number, collider?: any, groundY?: (x: number, z: number) => number }} opts
   */
  constructor(nav, opts) {
    super(nav, opts);
    this.moving = false;
    this.yaw = 0;
    /** @type {any} */
    this.living = null;
    this.nameNPC = '';
    /** @type {number|undefined} */
    this._talkSeed = undefined;
    this.pickpocketAttempted = false;
    this.gender = 0;
    /** @type {any} */
    this.unit = null;
    this.armed = false;
    this.ownArchive = opts.archive;
    /** @type {number|null} */
    this.cls = null;
    this.classArchive = opts.archive;
    /** @type {{ archive: number, record: number, frameCount: number } | null} */
    this.stillLook = null;
    /** @type {string|null} */
    this.stillRole = null;
    /** @type {FlatAnim|null} */
    this._stillAnim = null;
    this.pace = 1;
    this.state = 'idle';
    this.moveCount = 1;
  }

  get facingYaw() { return this.yaw; }

  release() {}

  /**
   * @param {number} archive
   * @param {boolean} guard
   */
  setIdentity(archive, guard) { super.setIdentity(archive, guard); this.ownArchive = archive; this.classArchive = archive; this.unit = null; this.armed = false; this.cls = null; this.stillLook = null; this.stillRole = null; this._stillAnim = null; }

  /** @param {{ mobileType: number, basics: any, archive: number, frameCount: (record: number) => number, sex?: 'male'|'female' } | null} look */
  arm(look) {
    if (look) {
      this.unit = new MobileUnit(look.mobileType, look.basics, look.frameCount, Math.random, look.sex ?? 'male');
      this.classArchive = look.archive;
      this.cls = look.mobileType;
      this.armed = true;
    } else if (this.armed) {
      this.unit = null;
      this.classArchive = this.ownArchive;
      this.cls = null;
      this.armed = false;
    }
    if (!this.stillLook) this.archive = this.classArchive;
    this.frame = 0; this._timer = 0;
  }

  /**
   * @param {{ archive: number, record: number, frameCount: number } | null} look
   * @param {string|null} [role]
   */
  still(look, role = null) {
    this.stillRole = look ? role : null;
    if (look) {
      this.stillLook = look;
      this._stillAnim = new FlatAnim(look.archive, look.frameCount);
      this.archive = look.archive;
    } else if (this.stillLook) {
      this.stillLook = null;
      this._stillAnim = null;
      this.archive = this.classArchive;
    }
    this.frame = 0; this._timer = 0;
  }

  /**
   * @param {number} dt
   * @param {number[]} cameraPos
   * @param {boolean} [wantsToStop]
   * @returns {{ record: number, frame: number, flip: boolean }}
   */
  update(dt, cameraPos, wantsToStop = false) {
    if (this.stillLook && this._stillAnim) return this._frameOut(this.stillLook.record, this._stillAnim.tick(dt), false);
    if (this.armed && this.unit) return this.unit.update(dt, { moving: this.moving && !wantsToStop }, this.yaw, this.pos, cameraPos);
    const st = wantsToStop ? 'idle' : this.moving ? 'move' : 'stand';
    if (st !== this.state) { this.state = st; this.frame = 0; this._timer = 0; }
    const fps = st === 'idle' ? PERSON_IDLE_FPS : PERSON_MOVE_FPS * this.pace;
    this._timer += dt;
    while (this._timer >= 1 / fps) { this._timer -= 1 / fps; this.frame++; }
    if (st === 'idle') {
      const rec = this.guard ? PERSON_GUARD_IDLE_RECORD : PERSON_IDLE_RECORD;
      const n = Math.max(1, this.frameCount(rec, this.archive));
      return this._frameOut(rec, this.frame % n, false);
    }
    const o = mobileOrientation(this.yaw, this.pos, cameraPos);
    const rec = MOVE_RECORDS[o];
    const n = Math.max(1, this.frameCount(rec, this.archive));
    return this._frameOut(rec, st === 'stand' ? Math.min(STAND_FRAME, n - 1) : this.frame % n, MOVE_FLIPS[o]);
  }
}
