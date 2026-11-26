// Chain keys are `act:{ns}:{position}` with `ns` the block instance, because object positions are block-local and a
// dungeon can repeat an RDB block.

import { trs, multiply } from './mat4.js';
import { ACTION_FLAGS, TRIGGER_FLAGS, MOVE_ACTION_FLAGS } from './rdbLayout.js';
import { CASTSPELL_COOLDOWN_TICK } from '../magic/spellcast.js';
import { flashPlayerDamage } from '../ui/damageFlash.js';
import { triggerOpen, triggerLock } from '../magic/mysticism.js';
import { dice100 } from '../combat/formulas.js';
import { localizedText, localizedTextList } from '../ui/textManager.js';
import { moverSteps, meetBody } from '../player/moverBody.js';

export const EFFECT_ACTION_FLAGS = new Set([
  ACTION_FLAGS.Hurt21, ACTION_FLAGS.Hurt22, ACTION_FLAGS.Hurt23,
  ACTION_FLAGS.Hurt24, ACTION_FLAGS.Hurt25, ACTION_FLAGS.Poison,
  ACTION_FLAGS.DrainMagicka, ACTION_FLAGS.CastSpell,
]);

export const DOOR_VERB_FLAGS = new Set([
  ACTION_FLAGS.LockDoor, ACTION_FLAGS.UnlockDoor,
  ACTION_FLAGS.OpenDoor, ACTION_FLAGS.CloseDoor,
]);

export const isActionDoorObject = (o) => !!o && o.kind === 'door' && !o.special;
// Bounds the IsPlaying chain walk so a looped chain cannot overflow the stack; dungeonEcho.js reads the same bound.
export const PLAY_DEPTH_MAX = 32;

export function classifyPlacementAction(actionFlag, isActionDoor = false) {
  if (MOVE_ACTION_FLAGS.has(actionFlag)) return 'move';
  if (EFFECT_ACTION_FLAGS.has(actionFlag)) return 'effect';
  if (actionFlag === ACTION_FLAGS.OpenDoor
    || (actionFlag === ACTION_FLAGS.CloseDoor && !isActionDoor)) return 'specialDoor';
  return 'relay';
}

export const TRIGGER_GATE = Object.freeze({
  [TRIGGER_FLAGS.None]: [],
  [TRIGGER_FLAGS.Collision01]: ['WalkOn'],
  [TRIGGER_FLAGS.Direct]: ['Direct'],
  [TRIGGER_FLAGS.Collision03]: ['WalkInto'],
  [TRIGGER_FLAGS.Attack]: ['Attack'],
  [TRIGGER_FLAGS.Direct6]: ['Direct'],
  [TRIGGER_FLAGS.MultiTrigger]: ['Direct', 'Attack', 'WalkInto'],
  [TRIGGER_FLAGS.Collision09]: ['Direct', 'WalkInto'],
  [TRIGGER_FLAGS.Door]: ['Door'],
});
export const ACTION_STATES = Object.freeze(['start', 'forward', 'end', 'reverse']);
export const ACTION_LOCK_MAX = 255;

// `failedSkillLevel` is the local player's lockpick retry latch: the save keeps it, but it is never sent to the
// room.
export function sharedRecord(r) {
  if (!r || typeof r !== 'object') return r;
  const { failedSkillLevel: _latch, ...rest } = r;
  void _latch;
  return rest;
}

export function validActionRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  if (typeof r.key !== 'string' || !r.key || r.key.length > 128) return null;
  if (!ACTION_STATES.includes(r.state)) return null;
  const unit = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);
  const t = unit(r.t);
  if (t == null) return null;
  const out = { key: r.key, state: r.state, t };
  if (r.lock != null) {
    if (typeof r.lock !== 'number' || !Number.isInteger(r.lock) || r.lock < 0 || r.lock > ACTION_LOCK_MAX) return null;
    out.lock = r.lock;
  }
  if (r.moveState != null) {
    if (!ACTION_STATES.includes(r.moveState)) return null;
    const mt = unit(r.moveT ?? 0);
    if (mt == null) return null;
    out.moveState = r.moveState; out.moveT = mt;
  }
  return out;
}

export const COLLISION_TIMEOUT_S = 0.12;

export const COLLISION_TRIGGER_FLAGS = Object.freeze([
  TRIGGER_FLAGS.Collision01, TRIGGER_FLAGS.Collision03,
  TRIGGER_FLAGS.MultiTrigger, TRIGGER_FLAGS.Collision09,
]);
export const hasActionCollision = (o) => !!o && COLLISION_TRIGGER_FLAGS.includes(o.triggerFlag ?? TRIGGER_FLAGS.None);
// A relay flat never fires on a walk; its trigger box answers only clicks and attacks, as in DFU.
export const walkHears = (o) => hasActionCollision(o) && !(o.isFlat === true && o.kind === 'relay');

// The ray starts `TRIGGER_RAY_LIFT` above the feet so a body resting exactly on the face still counts, since the
// triangle test refuses a hit at t = 0.
export const TRIGGER_SKIN_WIDTH = 0.08;
export const TRIGGER_RAY_LIFT = 0.01;
const DOWN = Object.freeze([0, -1, 0]);
export function ownSurfaceUnderFeet(surfaces, key, feet, skin = TRIGGER_SKIN_WIDTH) {
  if (!surfaces || key == null || !feet) return false;
  const origin = [feet[0], feet[1] + TRIGGER_RAY_LIFT, feet[2]];
  return Number.isFinite(surfaces.raycast(origin, DOWN, skin + TRIGGER_RAY_LIFT, { only: [key] }));
}
export const WALK_ON_DIR_Y = -0.9;
const _contact = [0, 0, 0];
const _beneath = [0, 0, 0];
export function actionContact(o, feet, height, surfaces, wish = null) {
  if (!surfaces || o?.key == null || !feet) return null;
  const only = { only: [o.key] };
  const at = surfaces.capsuleContact(feet, height, TRIGGER_SKIN_WIDTH, only, _contact);
  if (!at) return null;
  const dx = at[0] - feet[0], dy = at[1] - (feet[1] + height / 2), dz = at[2] - feet[2];
  const len = Math.hypot(dx, dy, dz);
  if (len > 0 && dy / len < WALK_ON_DIR_Y) return 'WalkOn';
  if (wish && !(wish[0] * dx + wish[1] * dz > 0)) {
    return surfaces.capsuleContact(feet, height, TRIGGER_SKIN_WIDTH, only, _beneath, WALK_ON_DIR_Y) ? 'WalkOn' : null;
  }
  if (o.triggerFlag === TRIGGER_FLAGS.Collision01 && ownSurfaceUnderFeet(surfaces, o.key, feet)) return 'WalkOn';
  return 'WalkInto';
}

export function standsOnAction(o, feet, box, surfaces) {
  if (feet[1] >= box.max[1] - 0.15) return true;
  return o?.triggerFlag === TRIGGER_FLAGS.Collision01 && ownSurfaceUnderFeet(surfaces, o.key, feet);
}

export const DOOR_OPEN_ANGLE = -90;
export const DOOR_OPEN_DURATION = 1.5;

export const ACTION_LOCK_VALUE = 16;
export const MAGIC_LOCK_THRESHOLD = 20;

// A peer's lock lands only up to this ceiling; any higher lock comes from a Lock spell and stays with its caster.
export function lockCeiling(o) {
  return Math.max(o?.startingLockValue | 0, o?.actionFlag === ACTION_FLAGS.LockDoor ? ACTION_LOCK_VALUE : 0);
}

function lockLands(o, lock, remote, level) {
  if (lock <= lockCeiling(o)) return true;
  if (remote) return false;
  return !(Number.isFinite(level) && lock > level);
}

function withoutLock(r) {
  if (!r || typeof r !== 'object' || r.lock == null) return r;
  const { lock: _lock, ...rest } = r;
  void _lock;
  return rest;
}

export function interiorLockpickingChance(level, lockValue, lockpickSkill) {
  const chance = 5 * (level - lockValue) + lockpickSkill;
  return Math.max(5, Math.min(95, chance));
}

// The look-at lock text uses the interior formula even on exterior doors, matching classic.
export function exteriorLockpickingChance(lockValue, lockpickSkill) {
  const chance = lockpickSkill - 5 * lockValue;
  return Math.max(5, Math.min(95, chance));
}

export const LOCKPICKING_SUCCESS_TEXT = 'You successfully pick the lock.';
export const LOCKPICKING_FAILURE_TEXT = 'You fail to pick the lock.';
export function lookAtLockText(lockValue, level, lockpickSkill) {
  if (lockValue >= MAGIC_LOCK_THRESHOLD) return localizedText('magicLock', 'This is a magically held lock...');
  const chance = interiorLockpickingChance(level, lockValue, lockpickSkill);
  if (chance < 30) return localizedText('lockpickChance1', 'This lock has nothing to fear from you...');
  if (chance < 35) return localizedText('lockpickChance2', "It'd be a miracle if you picked this lock...");
  if (chance < 45) return localizedText('lockpickChance3', 'This lock looks to be beyond your skills...');
  const lockpickChance = localizedTextList('lockpickChance', [
    'You doubt your ability to open this lock...',
    'This lock looks difficult...',
    'You would be challenged by this lock...',
    'This lock would prove a good challenge...',
    'You think you should be able to pick this lock...',
    'This lock seems relatively easy...',
    'You are amused by this lock...',
    'You laugh at the amateur quality of this lock...',
    'You see a pathetic excuse for a lock...',
    'This lock is an insult to your abilities...',
  ]);
  return chance >= 95 ? lockpickChance[9] : lockpickChance[Math.trunc((chance - 45) / 5)];
}

// TEXT.RSC record ids are the action record's Index plus these offsets.
export const TYPE_11_TEXT_INDEX = 8600;
export const TYPE_12_TEXT_INDEX = 5400;
export const TYPE_99_TEXT_INDEX = 7700;
// DoorText shows each HUD line for 2 seconds, twice the default popup delay.
export const DOOR_TEXT_HUD_DELAY_S = 2.0;

export const TYPE_12_ANSWERS = Object.freeze({
  5404: ['bow', 'bow arrow', 'crossbow', 'bows', 'crossbows'],
  5406: ['one', '1'],
  5423: ['benefactor', 'the benefactor'],
  5424: ['shut up', 'shutup', 'shaddup'],
  5464: ['yes', 'oK', 'i agree', 'y', 'agreed', 'done', 'fine', 'okay', 'sure', 'yep'],
});

const DOOR_TEXT_REMAP = Object.freeze({ 7701: 7705, 7702: 7705, 7703: 7705, 7704: 7705 });
const DOOR_TEXT_SKIP = new Set([7700, 7706, 7711, 7712, 7715, 7717, 7719]);

// Castle Daggerfall's two held foyer doors open for a player teleported into the dungeon, who would otherwise be
// shut in; the magically held line still shows.
export const CASTLE_DAGGERFALL_MAP_ID = 1291010263;
export const CASTLE_DAGGERFALL_FOYER_DOOR_LOAD_IDS = Object.freeze([29331574, 29331622]);

const EARLY_KEY_PREFIX = 'act:decor:';
const EARLY_MAX = 64;

export class ActionSystem {
constructor(collider, { damagePlayer = null, drainMagicka = null, castSpell = null, setGlobalVar = null, playerLevel = () => 1, lockpickSkill = () => 0, rolls = Math.random, insideDungeonCastle = () => false, magicDoorsContext = null } = {}) {
    this.collider = collider;
    this.objects = new Map();
    this._links = new Map();
    this._doorCount = 0;
    this._early = new Map();
    this._damagePlayer = damagePlayer;
    this._drainMagicka = drainMagicka;
    this._castSpell = castSpell;
    this._setGlobalVar = setGlobalVar;
    this._playerLevel = playerLevel;
    this._lockpickSkill = lockpickSkill;
    this._rolls = rolls;
    this._insideDungeonCastle = insideDungeonCastle;
    this._magicDoorsContext = magicDoorsContext;
    this.resolvePosition = null;
    this.onTeleport = null;
    this.onTeleportPortal = null;
    this.onLockedDoor = null;
    this.onSealedDoor = null;
    this.onActionSound = null;
    this.onPlayed = null;
    this.onShowText = null;
    this.onShowTextInput = null;
    this.onDoorText = null;
    this.onTrespass = null;
    this.onDoorState = null;
    this.onDoorBash = null;
    this.onMakeEnemiesHostile = null;
    this.onLockpickTally = null;
    this.onLockpickResult = null;
    this.onLockpickAttempt = null;
    this.onFlatMoved = null;
    this.onChanged = null;
    this._depth = 0;
  }

  _changed(fn) {
    if (!this.onChanged || this._depth > 0) { this._depth++; try { return fn(); } finally { this._depth--; } }
    const before = new Map(this.collectSaveData().map((r) => [r.key, JSON.stringify(sharedRecord(r))]));
    this._depth++;
    try { return fn(); } finally {
      this._depth--;
      const changed = this.collectSaveData().map(sharedRecord).filter((r) => before.get(r.key) !== JSON.stringify(r));
      if (changed.length) this.onChanged(changed);
    }
  }

  // Remote records bypass the change seam, so a change received from the room is never sent back.
  applyRemote(records) {
    if (!Array.isArray(records)) return 0;
    let n = 0;
    for (const raw of records) {
      // Every wire record passes `validActionRecord`; a non-numeric `t` would make the tween NaN and never finish.
      const rec = validActionRecord(raw);
      const o = rec && this.objects.get(rec.key);
      if (!o) { if (rec) this._keepEarly(withoutLock(rec)); continue; }
      const opening = o.kind === 'door' && o.state !== 'forward' && rec.state === 'forward';
      const played = rec.state !== o.state
        || (o.kind === 'door' && rec.moveState != null && rec.moveState !== o.moveState);
      this.restoreSaveData([rec], { remote: true });
      if (opening) this.onDoorState?.(o, true);
      if (played && o.index > 0) this.onActionSound?.(o);
      n++;
    }
    return n;
  }

  _register(ns, positionKey, o) {
    this.objects.set(o.key, o);
    if (positionKey != null && positionKey >= 0) this._links.set(`${ns}:${positionKey}`, o);
  }

  _next(o) {
    if (o.nextKey == null || o.nextKey < 0) return null;
    return this.objectAt(o.ns, o.nextKey);
  }

  objectAt(ns, positionKey) {
    return this._links.get(`${ns}:${positionKey}`) ?? null;
  }

  nextOf(o) {
    return this._next(o);
  }

  chainTargets() {
    const out = new Set();
    for (const o of this.objects.values()) {
      const n = this._next(o);
      if (n && n !== o) out.add(n.key);
    }
    return out;
  }

  addEffect(ns, positionKey, action, origin = null, modelIdNum = null) {
    const key = `act:${ns}:${positionKey}`;
    const o = {
      origin,
      key,
      ns,
      kind: 'effect',
      modelIdNum,
      actionFlag: action.actionFlag,
      magnitude: action.magnitude,
      index: action.index,
      axisRaw: action.axisRaw,
      isFlat: action.isFlat,
      activationCount: 0,
      nextKey: action.nextObject,
      triggerFlag: action.triggerFlag ?? TRIGGER_FLAGS.None,
      state: 'start',
    };
    this._register(ns, positionKey, o);
    return o;
  }

  _runEffect(o) {
    // Receive increments `activationCount` before Play, so Hurt21 fires on the 20th activation.
    const lvl = Math.max(1, this._playerLevel());
    const F = ACTION_FLAGS;
    if (o.actionFlag === F.Hurt21) {
      if (o.activationCount % 20 !== 0) return;
      const a = Math.max(1, o.magnitude), b = Math.max(1, o.index);
      // Unity's int Range excludes its upper bound and returns the minimum when max <= min.
      const span = Math.max(0, b - a);
      const dmg = (a + Math.floor(this._rolls() * span)) * lvl;
      if (this._damagePlayer) { this._damagePlayer(dmg); flashPlayerDamage(dmg); }
    } else if (o.actionFlag >= F.Hurt22 && o.actionFlag <= F.Hurt25) {
      const dmg = (o.isFlat ? o.magnitude : o.axisRaw) * lvl;
      if (this._damagePlayer) { this._damagePlayer(dmg); flashPlayerDamage(dmg); }
    }
    else if (o.actionFlag === F.CastSpell) {
      // The cooldown resets to 1000 after a cast, so the spell fires on every 22nd activation as in DFU.
      o.cooldown = (o.cooldown ?? 0) - CASTSPELL_COOLDOWN_TICK;
      if (o.cooldown <= 0) {
        if (this._castSpell) this._castSpell(o.index, o.origin);
        o.cooldown = 1000;
      }
    }
    else if (o.actionFlag === F.DrainMagicka) {
      const drain = Math.max(1, o.isFlat ? o.magnitude : o.axisRaw);
      if (this._drainMagicka) this._drainMagicka(drain);
    }
  }

  _runRelay(o) {
    const F = ACTION_FLAGS;
    if (o.actionFlag === F.Teleport) {
      const dest = this.resolvePosition?.(o.ns, o.nextKey) ?? null;
      if (!dest) { console.warn('[action] Teleport next object null - can\'t teleport'); return; }
      // The portal event fires before the warp, and both endpoints come from the static layout index so the
      // automap's portal key stays stable across saves.
      const from = this.resolvePosition?.(o.ns, o.positionKey) ?? (o.origin ? { pos: o.origin, yawDeg: 0 } : null);
      if (from) this.onTeleportPortal?.(from, dest);
      this.onTeleport?.(dest);
      return;
    }
    if (o.actionFlag === F.ShowText) {
      this.onShowText?.(TYPE_11_TEXT_INDEX + o.index);
      return;
    }
    if (o.actionFlag === F.ShowTextWithInput) {
      const textId = TYPE_12_TEXT_INDEX + o.index;
      const answers = TYPE_12_ANSWERS[textId];
      if (!answers) console.error(`[action] invalid key ${textId} for action type 12, couldn't get answer(s)`);
      this.onShowTextInput?.(textId, (userInput) => {
        if (!answers) return;
        const given = String(userInput ?? '').toLowerCase();
        if (answers.some((a) => a.toLowerCase() === given)) {
          const next = this._next(o);
          if (next) this.receive(next);
        }
      });
      return;
    }
    if (o.actionFlag === F.SetGlobalVar) {
      this._setGlobalVar?.(o.axisRaw, true);
      return;
    }
    if (o.actionFlag === F.DoorText) this._runDoorText(o);
  }

  _runDoorText(o) {
    let textId = TYPE_99_TEXT_INDEX + o.index;
    if (DOOR_TEXT_REMAP[textId]) textId = DOOR_TEXT_REMAP[textId];
    if (DOOR_TEXT_SKIP.has(TYPE_99_TEXT_INDEX + o.index)) o.actionEnabled = true;
    if (o.activationCount === 1 && textId !== TYPE_99_TEXT_INDEX && !o.actionEnabled) {
      this.onDoorText?.(textId);
    } else if (o.axisRaw > 5) {
      this.onTrespass?.();
    }
  }

  addRelay(ns, positionKey, action, aabb = null, origin = null, modelIdNum = null) {
    const key = `act:${ns}:${positionKey}`;
    const o = {
      key,
      ns,
      positionKey,
      kind: 'relay',
      modelIdNum,
      actionFlag: action.actionFlag ?? ACTION_FLAGS.None,
      index: action.index,
      axisRaw: action.axisRaw,
      isFlat: action.isFlat === true,
      activationCount: 0,
      state: 'start',
      nextKey: action.nextObject,
      triggerFlag: action.triggerFlag ?? TRIGGER_FLAGS.None,
      aabb,
      origin,
    };
    this._register(ns, positionKey, o);
    return o;
  }

  addDoor(cpu, baseMatrix, opts = {}) {
    const ns = opts.ns ?? 0;
    const key = opts.positionKey != null ? `act:${ns}:${opts.positionKey}` : `door:${this._doorCount++}`;
    const a = opts.action ?? null;
    const o = {
      key,
      ns,
      kind: 'door',
      cpu,
      modelIdNum: cpu?.modelIdNum ?? null,
      base: baseMatrix,
      duration: DOOR_OPEN_DURATION,
      rotation: { x: 0, y: DOOR_OPEN_ANGLE, z: 0 },
      translation: { x: 0, y: 0, z: 0 },
      state: 'start',
      t: 0,
      moveState: 'start',
      moveT: 0,
      moveDuration: a ? (a.duration ?? 0) / 20 : 0,
      moveRotation: a?.rotation ?? { x: 0, y: 0, z: 0 },
      moveTranslation: a?.translation ?? { x: 0, y: 0, z: 0 },
      actionFlag: a ? (a.actionFlag ?? ACTION_FLAGS.None) : ACTION_FLAGS.None,
      index: a ? a.index : 0,
      magnitude: a ? a.magnitude : 0,
      axisRaw: a ? a.axisRaw : 0,
      isFlat: false,
      activationCount: 0,
      nextKey: a ? a.nextObject : -1,
      triggerFlag: a ? (a.triggerFlag ?? TRIGGER_FLAGS.None) : TRIGGER_FLAGS.None,
      startingLockValue: opts.startingLockValue ?? 0,
      currentLockValue: opts.startingLockValue ?? 0,
      loadID: opts.loadID ?? 0,
      failedSkillLevel: 0,
      sealed: false,
      matrix: baseMatrix,
    };
    this.objects.set(key, o);
    if (opts.positionKey != null) this._links.set(`${ns}:${opts.positionKey}`, o);
    this.collider.addMesh(key, cpu.positions, cpu.indices, baseMatrix);
    const early = this._early.get(key);
    if (early) { this._early.delete(key); this.restoreSaveData([early]); }
    return o;
  }

  _keepEarly(rec) {
    if (typeof rec?.key !== 'string' || !rec.key.startsWith(EARLY_KEY_PREFIX)) return;
    if (!this._early.has(rec.key) && this._early.size >= EARLY_MAX) this._early.delete(this._early.keys().next().value);
    this._early.set(rec.key, rec);
  }

  removeDoor(key) {
    const o = this.objects.get(key);
    if (!o || o.kind !== 'door') return false;
    this.objects.delete(key);
    this._early.delete(key);
    for (const [k, v] of this._links) if (v === o) this._links.delete(k);
    this.collider.removeBucket(key);
    return true;
  }

  addSpecialDoor(ns, positionKey, cpu, baseMatrix, action) {
    const o = this.addDoor(cpu, baseMatrix, { ns, positionKey, action });
    o.special = true;
    return o;
  }

  addAction(ns, positionKey, cpu, baseMatrix, action) {
    const key = `act:${ns}:${positionKey}`;
    const o = {
      key,
      ns,
      kind: 'action',
      cpu,
      modelIdNum: cpu?.modelIdNum ?? null,
      base: baseMatrix,
      index: action.index,
      duration: action.duration / 20,
      rotation: action.rotation,
      translation: action.translation,
      state: 'start',
      t: 0,
      nextKey: action.nextObject,
      triggerFlag: action.triggerFlag ?? TRIGGER_FLAGS.None,
      matrix: baseMatrix,
    };
    this._register(ns, positionKey, o);
    this.collider.addMesh(key, cpu.positions, cpu.indices, baseMatrix);
    return o;
  }

  addMoveFlat(ns, positionKey, action, origin, aabb = null) {
    const key = `act:${ns}:${positionKey}`;
    const o = {
      key,
      ns,
      positionKey,
      kind: 'moveFlat',
      isFlat: true,
      actionFlag: action.actionFlag,
      index: action.index,
      magnitude: action.magnitude,
      axisRaw: action.axisRaw,
      // Flat Translation and Rotation records carry duration 0 and play instantly; only the six PositiveX to
      // NegativeZ flags set 50, a 2.5 second tween.
      duration: action.duration / 20,
      rotation: action.rotation,
      translation: action.translation,
      origin: [origin[0], origin[1], origin[2]],
      offset: [0, 0, 0],
      pos: [origin[0], origin[1], origin[2]],
      aabb,
      baseAabb: aabb ? { min: [...aabb.min], max: [...aabb.max] } : null,
      activationCount: 0,
      state: 'start',
      t: 0,
      nextKey: action.nextObject,
      triggerFlag: action.triggerFlag ?? TRIGGER_FLAGS.None,
    };
    this._register(ns, positionKey, o);
    return o;
  }

  // Writes `offset` and `aabb` in place because the host holds these arrays for the billboard batch and the
  // activation scan.
  _applyFlat(o) {
    const p = o.t;
    o.offset[0] = o.translation.x * p;
    o.offset[1] = o.translation.y * p;
    o.offset[2] = o.translation.z * p;
    for (let i = 0; i < 3; i++) {
      o.pos[i] = o.origin[i] + o.offset[i];
      if (o.aabb && o.baseAabb) {
        o.aabb.min[i] = o.baseAabb.min[i] + o.offset[i];
        o.aabb.max[i] = o.baseAabb.max[i] + o.offset[i];
      }
    }
    this.onFlatMoved?.(o);
  }

  // On a door this reads the record's Move state, not the hinge swing, so a swinging door does not block its own
  // record.
  _isPlaying(o, depth = 0) {
    const s = o.kind === 'door' ? o.moveState : o.state;
    if (s === 'forward' || s === 'reverse') return true;
    if (depth > PLAY_DEPTH_MAX) return false;
    const next = this._next(o);
    return next ? this._isPlaying(next, depth + 1) : false;
  }

  receive(o, triggerType = 'ActionObject') {
    if (this._isPlaying(o)) return;
    // The Castle Daggerfall hack runs after the IsPlaying gate and before the trigger-flag gate, so it fires even
    // for a trigger type the flag refuses.
    this._castleDaggerfallMagicDoorsSpecialOpenHack(o);
    if (triggerType !== 'ActionObject') {
      const allowed = TRIGGER_GATE[o.triggerFlag ?? TRIGGER_FLAGS.None];
      if (!allowed || !allowed.includes(triggerType)) return;
    }
    o.activationCount = (o.activationCount ?? 0) + 1;
    this.onPlayed?.(o, triggerType);
    this._play(o);
  }

  _castleDaggerfallMagicDoorsSpecialOpenHack(o) {
    const ctx = this._magicDoorsContext?.();
    if (!ctx) return;
    if (!ctx.playerTeleportedIntoDungeon) return;
    if (!ctx.isPlayerInsideDungeon) return;
    if (ctx.currentMapId !== CASTLE_DAGGERFALL_MAP_ID) return;
    if (!CASTLE_DAGGERFALL_FOYER_DOOR_LOAD_IDS.includes(o.loadID)) return;
    if (!isActionDoorObject(o)) return;
    if (!(o.currentLockValue > 0 && o.state === 'start')) return;
    o.currentLockValue = 0;
    this.toggleDoor(o);
  }

  /** @param selfToggle */
  _play(o, selfToggle = false) {
    // ActivateNext cascades before this object's own delegate for every flag except ShowTextWithInput, whose chain
    // fires only on a matching answer.
    if (o.actionFlag !== ACTION_FLAGS.ShowTextWithInput) {
      const next = this._next(o);
      if (next) this.receive(next);
    }
    if (o.index > 0) this.onActionSound?.(o);
    if (o.kind === 'effect') { this._runEffect(o); return; }
    if (o.kind === 'relay') { this._runRelay(o); return; }
    if (o.kind === 'door') { this._dispatchDoor(o, selfToggle); return; }
    if (o.duration <= 0) {
      o.state = o.state === 'start' || o.state === 'reverse' ? 'end' : 'start';
      o.t = o.state === 'end' ? 1 : 0;
      if (o.kind === 'moveFlat') { this._applyFlat(o); return; }
      this._applyMatrix(o);
      if (o.kind === 'action') this.collider.poseBucket(o.key, o.cpu.positions, o.cpu.indices, o.matrix);
      return;
    }
    if (o.state === 'start') o.state = 'forward';
    else if (o.state === 'end') o.state = 'reverse';
  }

  _dispatchDoor(o, selfToggle = false) {
    if (MOVE_ACTION_FLAGS.has(o.actionFlag)) { this._doorMove(o); return; }
    if (DOOR_VERB_FLAGS.has(o.actionFlag)) {
      // A self toggle is already the door verb; DFU re-enters ToggleDoor there and settles in the same state.
      if (!selfToggle) this._doorVerb(o);
      return;
    }
    if (EFFECT_ACTION_FLAGS.has(o.actionFlag)) { this._runEffect(o); return; }
    this._runRelay(o);
  }

  _doorMove(o) {
    if (o.moveDuration <= 0) {
      if (o.moveState === 'start') { o.moveState = 'end'; o.moveT = 1; }
      else if (o.moveState === 'end') { o.moveState = 'start'; o.moveT = 0; }
      else return;
      this._applyMatrix(o);
      this._settleDoorBucket(o);
      return;
    }
    if (o.moveState === 'start') o.moveState = 'forward';
    else if (o.moveState === 'end') o.moveState = 'reverse';
  }

  toggleDoor(o, byPlayer = false) {
    if (o.state === 'forward' || o.state === 'reverse') return false;
    if (o.state === 'end') return this._closeDoor(o, byPlayer);
    return this._openDoor(o, false, byPlayer);
  }

  // The DoorText hold and the lock refusal come first, then the door's own record fires before the swing starts so
  // it sees the door still closed.
  _openDoor(o, ignoreLocks = false, byPlayer = false) {
    if (o.sealed) {
      if (byPlayer) this.onSealedDoor?.(o);
      return false;
    }
    if (o.actionFlag === ACTION_FLAGS.DoorText && o.index > 0
        && (o.triggerFlag === TRIGGER_FLAGS.Door || o.triggerFlag === TRIGGER_FLAGS.Direct
          || o.triggerFlag === TRIGGER_FLAGS.MultiTrigger)
        && o.activationCount === 0 && byPlayer) {
      this._execOwnAction(o);
      if (!o.actionEnabled) return false;
    }
    if (o.currentLockValue > 0 && !ignoreLocks) {
      if (byPlayer) this.onLockedDoor?.(o);
      return false;
    }
    if (byPlayer) this._execOwnAction(o);
    this.collider.removeBucket(o.key);
    this.onDoorState?.(o, true);
    o.state = 'forward';
    o.currentLockValue = 0;
    return true;
  }

  _closeDoor(o, byPlayer = false) {
    if (o.state === 'start') return false;
    o.state = 'reverse';
    if (byPlayer) this._execOwnAction(o);
    return true;
  }

  _doorVerb(o) {
    const F = ACTION_FLAGS;
    if (o.actionFlag === F.OpenDoor) {
      if (o.state === 'end') return;
      o.currentLockValue = 0;
      this.toggleDoor(o);
    } else if (o.actionFlag === F.CloseDoor) {
      if (o.state !== 'end') return;
      this.toggleDoor(o);
      o.currentLockValue = o.startingLockValue;
    } else if (o.actionFlag === F.LockDoor) {
      if (o.currentLockValue <= 0) o.currentLockValue = ACTION_LOCK_VALUE;
    } else if (o.actionFlag === F.UnlockDoor) {
      o.currentLockValue = 0;
    }
  }

  _execOwnAction(o) {
    if (o.actionFlag === ACTION_FLAGS.None && o.nextKey === -1) return;
    if (this._isPlaying(o)) return;
    const allowed = TRIGGER_GATE[o.triggerFlag ?? TRIGGER_FLAGS.None];
    if (!allowed || !allowed.includes('Door')) return;
    o.activationCount = (o.activationCount ?? 0) + 1;
    this._play(o, true);
  }

  attemptBash(o, roll01 = this._rolls(), { byPlayer = true } = {}) {
    if (o.kind !== 'door' || o.special) return false;
    this.onDoorBash?.(o);
    // MakeEnemiesHostile runs on every player bash inside a dungeon castle, including a failed roll, so it sits
    // above the early returns.
    if (byPlayer && this._insideDungeonCastle()) this.onMakeEnemiesHostile?.();
    if (o.state === 'end') {
      this.toggleDoor(o, true);
      return true;
    }
    if (o.sealed) return false;
    if (o.currentLockValue >= MAGIC_LOCK_THRESHOLD) return false;
    const chance = 20 - o.currentLockValue;
    if (Math.floor(roll01 * 100) < chance) {
      o.currentLockValue = 0;
      this.toggleDoor(o, true);
      return true;
    }
    return false;
  }

  // A click on an action door toggles it and then still runs a Direct Receive; a special door gets only the Direct
  // Receive.
  activate(key, { steal = false, doorSpell = null } = {}) {
    const o = this.objects.get(key);
    if (!o) return false;
    if (o.kind === 'door' && o.sealed) {
      this.onSealedDoor?.(o);
      return true;
    }
    if (doorSpell && o.kind === 'door' && !o.special) {
      const result = doorSpell.kind === 'open'
        ? triggerOpen(o, doorSpell.holderLevel, { castBySkeletonKey: doorSpell.skeletonKey === true })
        : triggerLock(o, doorSpell.holderLevel);
      if (result.opened) this.toggleDoor(o, true);
      if (result.closed) this.toggleDoor(o, true);
      this.onDoorSpell?.(o, doorSpell.kind, result);
      this.receive(o, 'Direct');
      return true;
    }
    if (o.kind === 'door' && !o.special) {
      if (steal && o.currentLockValue > 0 && o.state !== 'end') this.attemptLockpicking(o);
      else this.toggleDoor(o, true);
    }
    this.receive(o, 'Direct');
    return true;
  }

  attemptLockpicking(o) {
    if (o.state === 'forward' || o.state === 'reverse') return false;
    // A host that plays the tumblers takes every non-magic lock and skips the retry gate, since snapped picks are
    // the retry cost.
    if (this.onLockpickAttempt && o.currentLockValue < MAGIC_LOCK_THRESHOLD) { this.onLockpickAttempt(o); return false; }
    const skill = this._lockpickSkill();
    if (o.failedSkillLevel === skill) return false;
    if (o.currentLockValue >= MAGIC_LOCK_THRESHOLD) {
      this.onLockpickResult?.(o, false);
      return false;
    }
    this.onLockpickTally?.();
    const chance = interiorLockpickingChance(this._playerLevel(), o.currentLockValue, skill);
    if (!dice100(chance, this._rolls())) {
      this.onLockpickResult?.(o, false);
      o.failedSkillLevel = skill;
      return false;
    }
    this.onLockpickResult?.(o, true);
    o.currentLockValue = 0;
    this.toggleDoor(o, true);
    return true;
  }

  lockpicked(o) {
    if (!o || o.state === 'forward' || o.state === 'reverse' || o.currentLockValue <= 0) return false;
    o.currentLockValue = 0;
    this.toggleDoor(o, true);
    return true;
  }

  collectSaveData() {
    // `activationCount` is not saved, matching DFU, so every counter restarts at 0 after a load.
    return [...this.objects.values()].map((o) => ({
      key: o.key, state: o.state, t: o.t ?? 0,
      ...(o.kind === 'door'
        ? { lock: o.currentLockValue, failedSkillLevel: o.failedSkillLevel ?? 0, moveState: o.moveState, moveT: o.moveT ?? 0 }
        : {}),
    })).concat([...this._early.values()]);
  }

  // Fields past `state` and `t` are presence-gated so older saves keep the live value; a `remote` lock lands only
  // up to `lockCeiling`.
  restoreSaveData(list, { remote = false, level = null } = {}) {
    list?.forEach((sa) => {
      const o = this.objects.get(sa.key);
      if (!o) { this._keepEarly(remote ? withoutLock(sa) : sa); return; }
      if (o.sealed) return;
      o.state = sa.state;
      o.t = sa.t;
      if (o.kind === 'door') {
        if (sa.lock != null && lockLands(o, sa.lock, remote, level)) o.currentLockValue = sa.lock;
        if (sa.failedSkillLevel != null) o.failedSkillLevel = sa.failedSkillLevel;
        if (sa.moveState != null) { o.moveState = sa.moveState; o.moveT = sa.moveT ?? 0; }
      }
      this.syncRestored(o);
    });
  }

  syncRestored(o) {
    if (o.kind === 'moveFlat') {
      if (o.state === 'start') o.t = 0;
      else if (o.state === 'end') o.t = 1;
      this._applyFlat(o);
      return;
    }
    if (o.kind !== 'door' && o.kind !== 'action') return;
    if (o.kind === 'door' && o.state === 'start') { o.t = 0; }
    if (o.kind === 'door') {
      if (o.moveState === 'start') o.moveT = 0;
      else if (o.moveState === 'end') o.moveT = 1;
    }
    this._applyMatrix(o);
    this.collider.removeBucket(o.key);
    if (o.kind === 'door') {
      if (o.state === 'start') this.collider.addMesh(o.key, o.cpu.positions, o.cpu.indices, o.matrix);
    } else {
      this.collider.addMesh(o.key, o.cpu.positions, o.cpu.indices, o.matrix);
    }
  }

  /**
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  withDoorsShut(fn) {
    const doors = [...this.objects.values()].filter((o) => o.kind === 'door');
    for (const o of doors) { this.collider.removeBucket(o.key); this.collider.addMesh(o.key, o.cpu.positions, o.cpu.indices, o.base); }
    try { return fn(); } finally { for (const o of doors) this._settleDoorBucket(o); }
  }

  // The bucket follows the live matrix, not `base`, because a Move record can carry a closed door off its base.
  _settleDoorBucket(o) {
    if (o.state === 'start') this.collider.poseBucket(o.key, o.cpu.positions, o.cpu.indices, o.matrix);
    else this.collider.removeBucket(o.key);
  }

  _applyMatrix(o) {
    const p = o.t;
    const translate = trs(
      o.translation.x * p, o.translation.y * p, o.translation.z * p, 0, 0, 0);
    // `trs` takes degrees and applies Ry * Rx * Rz.
    const rotate = trs(
      0, 0, 0,
      o.rotation.x * p,
      o.rotation.y * p,
      o.rotation.z * p);
    let m = multiply(translate, multiply(o.base, rotate));
    if (o.kind === 'door' && o.moveT) {
      // The record's MoveTo is world space so it pre-multiplies, and RotateBy is self space so it post-multiplies.
      const q = o.moveT;
      const mt = trs(
        o.moveTranslation.x * q, o.moveTranslation.y * q, o.moveTranslation.z * q, 0, 0, 0);
      const mr = trs(
        0, 0, 0,
        o.moveRotation.x * q, o.moveRotation.y * q, o.moveRotation.z * q);
      m = multiply(mt, multiply(m, mr));
    }
    o.matrix = m;
  }

  update(dt, body = null) {
    for (const o of this.objects.values()) {
      if (o.kind === 'door') { this._tickDoor(o, dt); continue; }
      if (o.state !== 'forward' && o.state !== 'reverse') continue;
      const dir = o.state === 'forward' ? 1 : -1;
      const t0 = o.t, m0 = o.matrix;
      // A restored zero-duration tween snaps by `dir`; dividing by its 0 duration would give NaN when dt is 0.
      o.t = Math.max(0, Math.min(1, o.t + (o.duration > 0 ? (dir * dt) / o.duration : dir)));
      if (o.kind === 'moveFlat') {
        this._applyFlat(o);
        if (o.state === 'forward' ? o.t >= 1 : o.t <= 0) o.state = o.state === 'forward' ? 'end' : 'start';
        continue;
      }
      this._applyMatrix(o);
      if (o.kind === 'action') this._standMover(o, t0, m0, body);
      const done = o.state === 'forward' ? o.t >= 1 : o.t <= 0;
      if (done) o.state = o.state === 'forward' ? 'end' : 'start';
    }
  }

  // A body pinned between the mover and the world holds the mover and its `t` at the last clear pose; the tween
  // resumes once the body is clear.
  _standMover(o, t0, m0, body) {
    const place = (m) => this.collider.poseBucket(o.key, o.cpu.positions, o.cpu.indices, m);
    place(o.matrix);
    if (!body) return;
    const t1 = o.t, m1 = o.matrix, n = moverSteps(this.collider, o.key, m0, m1, body);
    for (let k = 1, t = t0, m = m0; k <= n; k++) {
      o.t = k === n ? t1 : t0 + ((t1 - t0) * k) / n;
      if (k < n) { this._applyMatrix(o); place(o.matrix); } else if (n > 1) { o.matrix = m1; place(m1); }
      if (!meetBody(this.collider, o.key, m, o.matrix, body, place)) { o.t = t; o.matrix = m; place(m); return; }
      t = o.t; m = o.matrix;
    }
  }

  _tickDoor(o, dt) {
    const swinging = o.state === 'forward' || o.state === 'reverse';
    const moving = o.moveState === 'forward' || o.moveState === 'reverse';
    if (!swinging && !moving) return;
    if (swinging) {
      const dir = o.state === 'forward' ? 1 : -1;
      o.t = Math.max(0, Math.min(1, o.t + (dir * dt) / o.duration));
    }
    if (moving) {
      const dir = o.moveState === 'forward' ? 1 : -1;
      o.moveT = Math.max(0, Math.min(1, o.moveT + (dir * dt) / o.moveDuration));
    }
    this._applyMatrix(o);
    if (swinging && (o.state === 'forward' ? o.t >= 1 : o.t <= 0)) {
      const closing = o.state === 'reverse';
      o.state = o.state === 'forward' ? 'end' : 'start';
      // The close sound plays when the swing completes, before the bucket turns solid below.
      if (closing) this.onDoorState?.(o, false);
    }
    if (moving && (o.moveState === 'forward' ? o.moveT >= 1 : o.moveT <= 0)) {
      o.moveState = o.moveState === 'forward' ? 'end' : 'start';
    }
    if (o.state === 'start') this._settleDoorBucket(o);
  }
}

// These entries run under the change seam; a nested entry rides the outermost call and sends no diff of its own.
for (const name of ['activate', 'attemptBash', 'toggleDoor', 'receive', 'attemptLockpicking', 'lockpicked']) {
  const body = ActionSystem.prototype[name];
  ActionSystem.prototype[name] = function (...args) { return this._changed(() => body.apply(this, args)); };
}
