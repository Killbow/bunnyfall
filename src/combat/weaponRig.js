// First-person weapon rig shared by the hosts: sheathe, hands, swings, bow ammo, the spellcasting hands, and the
// Morrowind arm. The classic sprite stays the default; the arm draws whole or not at all, never both.
import { poseStrikeRect, strikePose } from './abilities/strikeMotion.js';

import { abilityRigBusy, claimAbilityEvents, stepAbilityRig } from './abilities/rig.js';
import { abilitiesEnabled } from './abilities/progress.js';
import { artRaceOf } from '../characters/races.js';
import { PlayerWeapon, WEAPON_REACH, setWeaponPoseProbe, weaponPoseOf, USING_RIGHT_HAND_TEXT, handDesc } from './playerWeapon.js';
import { eotbBody } from '../player/eotbBody.js';
import { eotbCamera } from '../player/eotbCamera.js';
import { racialFpsWeapon } from '../afflictions/lycanthropy.js';
import { EQUIP_SLOTS, equipTableOf, fillEquipTable } from '../characters/equip.js';
import { setItemFields } from '../items/itemTemplates.js';
import { dfWornEquipment } from '../formats/mwItemMap.js';
import { ownWerewolfSkin } from '../characters/ownGlyphs.js';
import { ARMOR_ENUM } from './enemyEquipment.js';
import { loadFpsWeaponArt, drawFpsWeapon, fpsWeaponQuad, weaponTypeForItem, WEAPON_TYPES, fpLightingOn, WEAPON_FILE, plainWeaponType } from './fpsWeapon.js';
import { spriteGlow, meshGlow } from './weaponGlow.js';
import { loadCrossbowArt } from './crossbowArt.js';
import { loadBallistaArt, loadGrappleArt } from './heavyGearArt.js';
import { isBallistaItem, isGrappleItem, GRAPPLE_HAND_ITEM } from '../characters/heavyGearIds.js';
import { stepHeavyGear, noteHeavyShot, hookFramesDraw } from './heavyGearRig.js';
import { cancelGrapple } from './grapple/grapple.js';
import { CROSSBOW_TEMPLATE } from '../characters/crossbowIds.js';
import { readWidgetSettings } from './weaponWidgetMotion.js';
import { fpsSpellCasting, loadSpellCastArt, drawSpellCastHands, magicAnimFilename, readiedHandsFrame, castReleaseS } from './fpsSpellCasting.js';
import { createClimbHands, climbLens } from './climbHands.js';
import { fieldOfView } from '../ui/viewSettings.js';
import { ammoCountFor } from '../items/inventory.js';
import { fpArm, hasAmmoFor } from './fpArm.js';
import { getPref } from '../ui/uiPrefs.js';
import { morrowindDataCount, morrowindDataFingerprint, registerMorrowindData, morrowindDataCounted, countMorrowindArchives } from '../scenes/dataSource.js';
import { mwRaceId } from '../formats/mwNpc.js';
import { TEMPLATES } from '../items/useItem.js';
import { morrowindDataGeneration } from '../scenes/dataSource.js';
import { objectAabb, rayAabb, hasMeshCollider, RAY_DISTANCE } from '../player/activate.js';
import { SOUND } from '../audio/soundClips.js';
import { equipSoundFor } from '../characters/weapons.js';
import { setMidScreenText } from '../ui/midScreenText.js'; import { weaponOffsetHeight } from '../ui/hudLarge.js';
import { createWeaponWidget } from './weaponWidget.js';
import { createTwoHands } from './twoHands/twoHands.js';
import { atlasFileName } from './diverseWeapons.js';
import { createShieldWidget } from './shieldWidget.js';
import { shieldWidgetTextures, shieldWidgetImage } from './shieldWidgetAssets.js';
import { forgetLater } from '../assets/loadCache.js';
import { setAttackOnPlayerHook } from './formulas.js';
import { conditionPercentage } from '../items/itemInfo.js';
import { isShieldTemplate } from '../items/armorMaterials.js';
import { rriNativeMaterialValue } from '../mods/rriItems.js';
import { riddenHorseLook } from '../travel/horseCoats.js';
import { createHandheldTorches, isHeldLight } from '../items/handheldTorches.js';
import { lanternAtWaist } from '../player/playerTorch.js';
import { liveVampirism } from '../afflictions/racialLive.js';
import { isTransformedLycanthrope, liveLycanthropy } from '../afflictions/lycanthropy.js';
import { lookConcealmentFlags } from '../magic/effects.js';
import { getBool, getInt } from '../platform/settings.js';
import { modSetting } from '../mods/modSettings.js';
import { takeFrameLook } from '../player/lookFilter.js';
import { uiCanvas, onUiScreen } from '../ui/uiScreen.js';
import { dfuLookAxes } from '../ui/lookSettings.js';
import { cursorActive } from '../player/pointerLock.js';
import { liveStat } from '../characters/statMods.js';
import { castRate } from '../magic/castSpeed.js';
// Registers the weapon reader for the swing law on import.
import './swingLaw.js';
import { walkSpeed } from '../player/motor.js';
import { localizedText, t } from '../ui/textManager.js';
import { HANDS_MODE, twoHanded, runHandsWanted, runHandsKept, runPhaseOfBob, guardStep } from './twoHands/handsLaw.js';
import { spellVisualIntensity } from '../magic/spellVisualSettings.js';
import { spellHandOf, tellSpellHand, castPending, drawSpellHand, guardDrop } from './twoHands/spellHand.js';
import { stepTechnique, claimShot, techniqueFlying, techniqueState, TECHNIQUE_ACTION } from './techniques.js';
// Registers the martial powers on import, so every host's rig has them.
import '../characters/martialPowers.js';
import { techniqueHands, techniqueMotion } from './technique/techniqueFx.js';
import { drawnPiece } from '../net/appearanceLaw.js';

export function isMwWerewolf(entity) {
  return !!entity && isTransformedLycanthrope(entity) && ((liveLycanthropy(entity)?.infectionType | 0) === 1);
}

let _armRenderer = null;
export const armRenderer = () => _armRenderer;

export function armBuildOptsOf(entity) {
  const worn = entity.equip?.slots?.[EQUIP_SLOTS.RightHand] ?? null;
  return {
    werewolf: isMwWerewolf(entity),
    skin: isMwWerewolf(entity) ? ownWerewolfSkin() : null,
    vampire: !!liveVampirism(entity),
    race: mwRaceId(artRaceOf(entity)),
    // `gender` is the string 'male' or 'female' everywhere, so this is a string compare.
    female: entity.gender === 'female',
    faceIndex: entity.faceIndex | 0,
    armor: dfWornEquipment(equipTableOf(entity), EQUIP_SLOTS, ARMOR_ENUM),
    weapon: worn,
    hasAmmo: hasAmmoFor(entity.items, worn),
    ammoCount: ammoCountFor(entity.items, worn),
    torch: isLitTorch(entity.lightSource),
    hipLight: lanternAtWaist(entity.lightSource),
    sheathing: getPref('mwSheathing'),
    ownHeads: true,
  };
}

export const isLitTorch = (item) => !!item && item.templateIndex === TEMPLATES.Torch;

// Seconds long and synchronous, so callers run it at a pause or a boot, never per frame.
export function buildArmsFor(entity) {
  return fpArm.build(armBuildOptsOf(entity));
}

export function armIdentityOf(entity) {
  return { race: mwRaceId(artRaceOf(entity)), female: entity?.gender === 'female', faceIndex: entity?.faceIndex | 0, werewolf: isMwWerewolf(entity), vampire: !!liveVampirism(entity) };
}

export function armBuiltFor() { return fpArm.builtFor(); }
export function armsReady() { return fpArm.ready(); }

// The arm is one singleton for the session, so it counts only when built for this entity.
export function armsStandFor(entity, { ready = () => fpArm.ready(), builtFor = () => fpArm.builtFor(), buildingFor = () => fpArm.buildingFor() } = {}) {
  const want = armIdentityOf(entity);
  const same = (have) => !!have && have.race === want.race && !!have.female === want.female && (have.faceIndex | 0) === want.faceIndex
    && !!have.werewolf === want.werewolf && !!have.vampire === want.vampire;
  // A build under way answers for the identity it is building, so a second door never queues the body twice.
  const coming = buildingFor();
  if (coming) return same(coming);
  if (!ready()) return false;
  return same(builtFor());
}

export function saveArmsEntity(snap) {
  if (!snap || !Array.isArray(snap.items)) return null;
  const items = snap.items.map((it) => setItemFields(it));
  const li = snap.lightSourceIndex ?? -1;
  const e = { race: snap.race, lookRace: snap.lookRace ?? null, gender: snap.gender, faceIndex: snap.faceIndex, chargenDone: snap.chargenDone, items, lightSource: li >= 0 ? (items[li] ?? null) : null };
  fillEquipTable(equipTableOf(e), items);
  return e;
}

// Set by the early build before its first await; other doors wait on it so the same body is not queued twice.
let _armsIntent = null;

// `snapOf` is read only when Morrowind data is attached, because picking the newest save parses every slot.
export async function prebuildArmsForSave(snapOf, { build = autoBuildArms, counted = morrowindDataCounted, count = countMorrowindArchives, dataCount = morrowindDataCount } = {}) {
  let release;
  const intent = { done: new Promise((r) => { release = r; }) };
  _armsIntent = intent;
  try {
    if (!counted()) await count();
    if (!(dataCount() > 0)) return null;
    const e = saveArmsEntity(typeof snapOf === 'function' ? snapOf() : snapOf);
    if (!e) return null;
    return await build(e, { intent });
  } catch (err) {
    console.warn('[arms] the early build could not start -', err?.message ?? err);
    return null;
  } finally {
    if (_armsIntent === intent) _armsIntent = null;
    release();
  }
}

export async function autoBuildArms(entity, { dataCount = morrowindDataCount, measure = registerMorrowindData, measured = morrowindDataFingerprint, standing = armsStandFor, intent = null } = {}) {
  if (_armsIntent && _armsIntent !== intent) await _armsIntent.done;
  if (!entity?.chargenDone || !(dataCount() > 0) || standing(entity)) return null;
  if (measured() == null) await measure().catch(() => 0);
  const res = await buildArmsFor(entity);
  if (!res?.ok && !res?.queued) console.warn(`[arms] boot build refused - ${res?.stage}: ${res?.error}`);
  return res;
}

export function sheetHolderOf(rig) {
  return {
    available: () => !!rig()?.armsAvailable?.(),
    hold: (spec, opts) => !!rig()?.holdPaper?.(spec, opts),
    release: () => { rig()?.releasePaper?.(); },
    corners: () => { const r = rig(); return (r?.armsDrawn?.() ? r.paperCorners() : null) ?? null; },
  };
}

export const CLIMB_LOWER_TAU = Object.freeze({ down: 0.07, up: 0.14 });
export const CLIMB_LOWER_GONE = 0.98;
export const CLIMB_HANDS_AFTER = 0.5;
const SHIELD_DESC = Object.freeze({ item: true, shield: true });
export function climbLowerStep(lower, climbing, dt) {
  const target = climbing ? 1 : 0;
  const tau = climbing ? CLIMB_LOWER_TAU.down : CLIMB_LOWER_TAU.up;
  const next = lower + (target - lower) * (1 - Math.exp(-Math.max(0, dt) / tau));
  return Math.abs(target - next) < 0.005 ? target : next;
}
export function climbDrop(lower, height) {
  const s = Math.min(1, Math.max(0, lower));
  return s > 0 ? Math.round(s * s * (3 - 2 * s) * height) : 0;
}
export function climbLowerRect(rect, lower) {
  return { ...rect, y: rect.y + climbDrop(lower, rect.h) };
}
export function techniqueDipRect(rect, dip, screenH) {
  return { ...rect, y: rect.y + dip * screenH };
}

// A host that readies spells must pass `abortSpell`, or the ready-weapon key cannot put a spell away.
export function createWeaponRig({ renderer, canvas, fetchBytes, palette, audio, entity, camera = null, say = () => {}, spellArmed = () => false, readiedSpell = () => null, abortSpell = () => {}, bindWorn = true, activateHeld = () => false, envHit = null, missEffect = null, collider = null, actionDown = null, torches = () => null, sheetWindowUp = () => false, dropRefusal = () => null, actTool = () => null, technique = null }) {
  const playerWeapon = new PlayerWeapon({ liveSpeed: () => (entity ? liveStat(entity, 'speed') : 50) });
  playerWeapon.animCtx = () => playerWeapon.swingCtx(entity);
  const poseProbe = () => ({ ...weaponPoseOf(playerWeapon), weaponType: weaponTypeForItem(playerWeapon.weapon) });
  const envCast = envHit ?? ((reach) => {
    const col = collider?.();
    const cam = camera?.();
    if (!col?.raycast || !cam?.pos) return null;
    const yaw = cam.yaw || 0, pitch = cam.pitch || 0;
    const fwd = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    const d = col.raycast(cam.pos, fwd, reach);
    if (!Number.isFinite(d)) return null;
    return [cam.pos[0] + fwd[0] * d, cam.pos[1] + fwd[1] * d, cam.pos[2] + fwd[2] * d];
  });
  const handedFlip = () => getInt('Controls', 'Handedness', 0, 3) === 1;
  // Declared above the widget, because createWeaponWidget calls `settings()` while it is constructed.
  const widgetSettings = () => {
    const s = readWidgetSettings();
    return s;
  };
  const widget = createWeaponWidget({ audio, envHit: envCast, missEffect, settings: widgetSettings });
  const twoHands = createTwoHands({ audio, envHit: envCast, missEffect, settings: widgetSettings });
  const lightInHand = () => !!entity && isHeldLight(entity.lightSource) && !lanternAtWaist(entity.lightSource)
    && (fpArm.ready() ? isLitTorch(entity.lightSource) : handheldOn());
  const pairUp = () => bindWorn && twoHanded(playerWeapon.handsMode);
  const handsEmpty = () => {
    if (!bindWorn || !entity) return false;
    const slots = entity.equip?.slots;
    if (slots?.[EQUIP_SLOTS.RightHand] || slots?.[EQUIP_SLOTS.LeftHand]) return false;
    if (lightInHand() || racialFpsWeapon(entity)) return false;
    if (spellArmed() || fpsSpellCasting.isPlayingAnim || actTool() || sheetWindowUp()) return false;
    return (entity.equipCountdown ?? 0) <= 0;
  };
  const spellHandHands = () => (bindWorn ? spellHandOf({
    lead: playerWeapon.leadHand, leftBusy: playerWeapon.leftBusy && !torchStowsForSpell(),
    right: handDesc(playerWeapon.handItem('R')), left: playerWeapon.holdingShield ? SHIELD_DESC : handDesc(playerWeapon.handItem('L')),
  }) : null);
  const torchStowsForSpell = () => handheldOn() && !!handheld.settings?.stowOnSpellcasting && (spellArmed() || fpsSpellCasting.isPlayingAnim);
  const armCasting = () => (fpArm.active() || fpArm.thirdActive()) && !!fpArm.castInFlight();
  const castPlaying = () => fpsSpellCasting.isPlayingAnim || armCasting();
  const spellHandFits = () => !playerWeapon.sheathed && (entity?.equipCountdown ?? 0) <= 0 && !_climbing && !!spellHandHands();
  // A cast's hand count is fixed when it starts and holds to its end.
  let _castOneHand = false;
  const spellHandNow = () => spellHandFits() && (castPlaying() ? _castOneHand : spellArmed());
  let _spellHand = false;
  const handsBusy = () => playerWeapon.machine.state !== 'Idle' || _heldHit || ((fpArm.active() || fpArm.thirdActive()) && !!fpArm.shotBusy()) || techniqueFlying();
  const _spellGuard = { weapon: 0, hand: 0 };
  const spellHandSide = () => {
    const weaponLeft = widgetOn() && widget.applies() ? !!widget.flipHorizontal : handedFlip();
    return weaponLeft ? 'right' : 'left';
  };
  function cloneFrame(item, hand, f) {
    const c = f.c;
    return {
      renderer, canvas: c, entity, art: c ? artFor(item) : null, weapon: drawnPiece(item),
      weaponType: heldType(item), material: drawnPiece(item)?.material ?? -1, glow: glowOf(item),
      equipCountdown: entity?.equipCountdown ?? 0, castPlaying: fpsSpellCasting.isPlayingAnim, spellArmed: spellArmed(),
      thirdPerson: fpArm.thirdActive() || eotbHidesWeapon(), reach: WEAPON_REACH,
      motion: f.motion,
      look: f.look, swingHeld: _held, cursorActive: cursorActive(), camera: f.camera,
      activateStarted: () => _activateStarted,
      ...(hand ? { machine: twoHands.view(hand), pairHand: true, usingRightHand: true, animCtx: playerWeapon.animCtx, fromBelow: twoHands.fromBelow(hand) } : {}),
    };
  }
  function handArm({ sync = false } = {}) {
    if (sync) syncWorn();
    const armItem = pairUp() ? playerWeapon.handItem('R') : playerWeapon.weapon;
    fpArm.setWeapon(armItem, { hasAmmo: hasAmmoFor(entity?.items, armItem), ammoCount: ammoCountFor(entity?.items, armItem) });
    fpArm.setHands({ mode: pairUp() ? playerWeapon.handsMode : HANDS_MODE.Single, lead: playerWeapon.leadHand });
    const offItem = pairUp() && playerWeapon.handsMode === HANDS_MODE.Dual ? playerWeapon.handItem('L') : null;
    fpArm.setOffWeapon(offItem);
    return { armItem, offItem };
  }
  let _runAir = 0, _runWanted = false;
  function stepTwoHands(dt, mv, localVel, { climbing = false, handsLane = false } = {}) {
    const speed = Math.hypot(localVel[0], localVel[2]);
    const attacking = playerWeapon.machine.state !== 'Idle';
    const body = {
      running: !!mv.running, standing: !!mv.standing, grounded: mv.grounded !== false, crouching: !!mv.crouching, riding: !!mv.riding,
      swimming: !!mv.swimming, climbing, speed, emptyHands: handsEmpty(), attacking,
    };
    const aloft = !body.grounded && runHandsWanted({ ...body, grounded: true });
    _runAir = aloft ? _runAir + dt : 0;
    const wanted = runHandsKept({ wanted: runHandsWanted(body), aloft, wasWanted: _runWanted, airSeconds: _runAir });
    _runWanted = wanted;
    twoHands.step(dt, {
      mode: pairUp() ? playerWeapon.handsMode : HANDS_MODE.Single, machine: playerWeapon.machine, strike: playerWeapon.strikeInFlight,
      leftHanded: handedFlip(), standing: !!mv.standing, run: { wanted: wanted && handsLane, punching: attacking, speed, bob: mv.bobTimer },
    });
    fpArm.setRunHands?.(wanted, { speed, phase: Number.isFinite(mv.bobTimer) ? runPhaseOfBob(mv.bobTimer) : null });
  }
  const widgetOn = () => modSetting('weapon-widget', 'Enabled');
  const shield = createShieldWidget({ textures: shieldWidgetTextures, audio });
  const climbHands = createClimbHands({ renderer });
  let _shieldTime = 0;
  const _shieldTex = new Map();
  function shieldTextureFor(index) {
    if (!renderer || !(index >= 0)) return null;
    if (!_shieldTex.has(index)) {
      _shieldTex.set(index, null);
      shieldWidgetImage(index).then((img) => {
        if (!img) { forgetLater(_shieldTex, index, null); return; }
        _shieldTex.set(index, renderer.uploadTexture('img', `sw:${index}`, img));
      }).catch((e) => { console.warn('[shield widget] texture load failed', index, e); forgetLater(_shieldTex, index, null); });
    }
    return _shieldTex.get(index);
  }
  function drawShieldSprite(index, rect, uv, tint) {
    const tex = shieldTextureFor(index);
    if (!tex) return;
    renderer.drawScreenQuad(tex, { x: rect.x, y: rect.y, w: rect.width, h: rect.height }, uv, tint ?? undefined);
  }
  const shieldOn = () => modSetting('shield-widget', 'Enabled');
  const readiedHandsOn = () => modSetting('readied-spellcasting-hands', 'Enabled');
  // Reads the slots without equipTableOf, which would create an empty table that syncWorn reads as no weapon.
  const shieldItem = () => {
    const item = entity?.equip?.slots?.[EQUIP_SLOTS.LeftHand] ?? null;
    if (!item) return null;
    const drawn = drawnPiece(item);
    return {
      templateIndex: drawn.templateIndex, nativeMaterialValue: rriNativeMaterialValue(drawn), coverTemplate: item.templateIndex,
      conditionPercentage: conditionPercentage(item), isShield: isShieldTemplate(item.templateIndex),
    };
  };
  const attackOnPlayer = (attacker, target, damage, struckBodyPart) => {
    if (!shieldOn()) return;
    shield.onAttackDamageCalculated({ targetIsPlayer: true, bodyPart: struckBodyPart, damage, item: shieldItem() });
  };
  const handheld = createHandheldTorches({ audio, say, torches, dropRefusal });
  const handheldOn = () => modSetting('handheld-torches', 'Enabled');
  let _handheldBound = null;
  // update() runs only while the mod is on, so the rig disposes the torch on the switch's off edge and at teardown.
  let _handheldWasOn = false;
  const bindTorches = () => { const pool = torches?.(); if (pool && pool !== _handheldBound) { pool.setOnPickedUp?.((item) => handheld.receivePickedUp(item)); _handheldBound = pool; } };
  playerWeapon.onAttackResult = ({ foe, damage }) => (pairUp() && playerWeapon.activeHand === 'L' ? twoHands.offWidget : widget).onAttackDamageCalculated({ damage, parrySounds: !!foe?.basics?.parrySounds, pos: foe?.pos ?? foe?.ai?.pos ?? null, isEnemy: true });
  let _activatePrev = false, _activateStarted = false;
  let _lastEye = null;
  // The eye is cached ahead of the mods' gate, so the running hands still work with all three mods off.
  const keepEye = (pos) => {
    if (!pos) _lastEye = null;
    else if (_lastEye) { _lastEye[0] = pos[0]; _lastEye[1] = pos[1]; _lastEye[2] = pos[2]; } else _lastEye = [pos[0], pos[1], pos[2]];
  };
  let _climbLower = 0;
  let _climbing = false;
  // `camera` is required for the Morrowind arm, with no fallback. The arm is a module singleton, so the rig
  // that steps it re-binds it every frame; binding only at construction leaves the last-built rig owning it.
  const bindArm = () => {
    fpArm.attach(renderer, camera);
    _armRenderer = renderer ?? null;
    const beast = !!entity && isTransformedLycanthrope(entity), wolf = !!fpArm.wolfStanding?.();
    fpArm.setStandIn?.(beast ? !(wolf && isMwWerewolf(entity)) : wolf);
  };
  bindArm();
  // The sprite body is attached and re-bound here for every host; this file never imports the view layer.
  const eotbState = () => ({
    weaponReady: !playerWeapon.sheathed || spellArmed(),
    sheathed: playerWeapon.sheathed,
    spellcasting: spellArmed(),
    usingBow: !!playerWeapon.machine.isBow,
    transformed: !!entity && isTransformedLycanthrope(entity),
    lycanthropyType: (entity && liveLycanthropy(entity)?.infectionType) || 0,
    horseLook: entity ? riddenHorseLook(entity.items ?? []) : 0,
    died: !!entity && (entity.health ?? 1) <= 0,
    motion: camera?.()?.move ?? null,
    attacking: playerWeapon.machine.state !== 'Idle',
    swingN: swing.n,
    castPlaying: !!fpsSpellCasting.isPlayingAnim,
    bowDrawback: getBool('Controls', 'BowDrawback'),
    swingHeld: _held,
    liveSpeed: entity ? liveStat(entity, 'speed') : 50,
    // The swing context lets a registered swing-speed override time the sprite's swing as it times the blow.
    animCtx: playerWeapon.animCtx(),
    concealment: entity ? lookConcealmentFlags(entity) : null,
    hipLantern: !!entity && lanternAtWaist(entity.lightSource),
  });
  const bindBody = () => eotbBody.attach(renderer, eotbState);
  bindBody();
  // The pose probe, the attack hook, and the popup sink are module singletons too, re-claimed each frame.
  const bindGlobals = () => {
    setWeaponPoseProbe(poseProbe);
    setAttackOnPlayerHook(attackOnPlayer);
    eotbCamera.setPopup(say);
  };
  bindGlobals();
  eotbCamera.loadSettings(modSetting);
  // The camera starts once per boot; a later rig for a building or a dungeon does not force the view again.
  eotbCamera.start();
  // Polls the data generation and drops a stale arm. Rebuilding is left to a button; the parse takes seconds.
  let _mwGen = morrowindDataGeneration();
  const fpRecheck = () => {
    const g = morrowindDataGeneration();
    if (g === _mwGen) return;
    _mwGen = g;
    fpArm.unload();
  };
  const syncWorn = () => {
    if (!bindWorn || !entity) return;
    // The wereclaws apply first, so they win over both hands without touching either cache.
    const claws = racialFpsWeapon(entity);
    const slots = entity.equip?.slots;
    if (!slots) { if (claws) playerWeapon.weapon = claws; return; }
    playerWeapon.updateHands(slots[EQUIP_SLOTS.RightHand] ?? null, slots[EQUIP_SLOTS.LeftHand] ?? null);
    if (fpArm.ready()) playerWeapon.followHeldHand();
    playerWeapon.leftBusy = lightInHand();
    playerWeapon.applyWeapon(claws);
  };
  const cv = () => uiCanvas(typeof canvas === 'function' ? canvas() : canvas);
  const cache = new Map();
  let heldGlow = null, heldFor = null;
  const askHeld = () => { heldFor = playerWeapon.weapon; heldGlow = spriteGlow(heldFor); };
  const glowOf = (item) => (item && item === heldFor ? heldGlow : spriteGlow(item));
  const heldGlowNow = () => { if (playerWeapon.weapon !== heldFor) askHeld(); return heldGlow; };
  const heldType = (item) => (glowOf(item) ? plainWeaponType(weaponTypeForItem(item)) : weaponTypeForItem(item));
  let _dx = 0, _dy = 0, _held = false;
  let _hookFrame = 0;
  let _hooking = false;
  // Load the hook frames once a hook is carried, so the first throw has art to draw.
  let _hookArtAsked = false;
  const _gearToken = {};
  let wolfForm = false, wolfSkin = null;

  function artFor(held) {
    const plain = !!glowOf(held);
    const type = heldType(held);
    if (type === WEAPON_TYPES.None) return null;
    const item = drawnPiece(held);
    const crossbow = type === WEAPON_TYPES.Bow && item?.templateIndex === CROSSBOW_TEMPLATE;
    const gear = isBallistaItem(item) ? 'ballista' : isGrappleItem(item) ? 'grapple' : null;
    if (((!crossbow && !gear) && !palette)) return null;
    // Keyed by atlas name so per-template Diverse Weapons art is honored, not reused across a weapon class.
    const key = gear ?? (crossbow ? 'crossbow' : null) ?? `${type}:${item?.material ?? 0}:${atlasFileName(item, WEAPON_FILE[type] ?? '', undefined, plain ? false : undefined)}`;
    if (!cache.has(key)) {
      cache.set(key, null);
      (gear
        ? (gear === 'ballista' ? loadBallistaArt(renderer) : loadGrappleArt(renderer))
        : crossbow
        ? loadCrossbowArt(renderer)
        : loadFpsWeaponArt(fetchBytes, palette, renderer, type, item?.material ?? 0, item, { plain }))
        .then((art) => cache.set(key, art))
        .catch((e) => { console.warn('[weaponRig] art load failed', key, e); forgetLater(cache, key, null); });
    }
    return cache.get(key);
  }

  const spellCache = new Map();

  function spellArtFor(element) {
    if (!palette || !magicAnimFilename(element)) return null;
    if (!spellCache.has(element)) {
      spellCache.set(element, null);
      loadSpellCastArt(fetchBytes, palette, renderer, element)
        .then((art) => spellCache.set(element, art))
        .catch((e) => { console.warn('[weaponRig] spell anim load failed', element, e); forgetLater(spellCache, element, null); });
    }
    return spellCache.get(element);
  }

  // Ceiling on a held bow hit so a silent arm cannot swallow the shot; a real release lands near 0.44s.
  const HELD_HIT_MAX_S = 1.2;
  const HELD_HIT_CAP_S = 4;
  let _heldHit = false;
  let _heldSound = false;
  let _heldHitAge = 0;
  let _lastShown = false;
  // After a bow release the sprite stays hidden through the cooldown; an un-draw does not hide it.
  let _bowReleaseHidden = false;
  // The bow cooldown is an early return that keeps the last value, as in the classic ShowWeapons.
  function shown() {
    const m = playerWeapon.machine;
    if (m.isBow && m.now < m.cooldownUntil) return _lastShown;
    _bowReleaseHidden = false;
    let v = true;
    // No weapon sprite over the casting hands, unless the spell is in the free hand beside the weapon.
    if ((spellArmed() || fpsSpellCasting.isPlayingAnim) && !_spellHand) v = false;
    else if ((entity?.equipCountdown ?? 0) > 0) v = false;
    else if (playerWeapon.sheathed) v = false;
    _lastShown = v;
    return v;
  }
  function spriteShown() { return shown() && !_bowReleaseHidden; }

  const _eotbHeldLast = new Set();
  function pollEotbKeys() {
    if (!actionDown) return;
    for (const [action, act] of [['ShoulderSwitch', () => eotbCamera.switchShoulder()], ['AutoPerspective', () => eotbCamera.toggleAuto()]]) {
      const down = !!actionDown(action);
      if (!down && _eotbHeldLast.has(action)) act();
      if (down) _eotbHeldLast.add(action); else _eotbHeldLast.delete(action);
    }
  }
  const eotbHidesWeapon = () => !fpArm.canThirdPerson() && eotbBody.hides().weapon;
  const eotbHidesSpellHands = () => !fpArm.canThirdPerson() && eotbBody.hides().spellHands;

  const swing = { n: 0, strike: 'StrikeDown', hand: null };
  const cast = { n: 0, rangeType: 2, element: 4 };
  const shot = { n: 0 };
  function fpAttack(strike, dt = 0) {
    swing.n = (swing.n + 1) & 0xffff; swing.strike = strike; swing.hand = pairUp() ? playerWeapon.strike?.hand ?? null : null;
    tellSpellHand({ up: _spellHand, fits: spellHandFits(), busy: true });
    if (!fpArm.ready()) return;
    const m = playerWeapon.machine;
    fpArm.attack(strike, { hold: m.isBow && m.state === 'StrikeUp', blow: playerWeapon.strikeSchedule(dt), hand: pairUp() ? playerWeapon.strike?.hand ?? null : null });
  }

  const noteShotHere = (weapon) => { shot.n = (shot.n + 1) & 0xffff; noteHeavyShot(weapon, shot, { audio }); };
  const _techRig = {};
  let _techCtx = null;
  let _armDip = 0, _dipPx = 0;
  let _techDt = 0;
  const _techCam = { pos: null, yaw: 0, pitch: 0, feet: null, move: null };

  let _toggleSheathCalls = 0;
  let _armDrewLast = false;

  function rawToggleSheath() {
    syncWorn();
    _toggleSheathCalls += 1;
    if (playerWeapon.toggleSheath() && !playerWeapon.weapon?.werecreatureClaws) {
      audio.playOneShot(equipSoundFor(playerWeapon.weapon) ?? SOUND.DrawWeapon);
    }
  }

  function bowArrowGuard() {
    if (playerWeapon.sheathed) return;
    const weapon = playerWeapon.weapon;
    const type = weaponTypeForItem(weapon);
    const ranged = type === WEAPON_TYPES.Bow;
    if (!ranged) return;
    if (hasAmmoFor(entity.items, weapon)) return;
    playerWeapon.sheathed = true;
    setMidScreenText(localizedText('youHaveNoArrows', 'You have no arrows.'));
  }

  // No ranged shot starts while the arm is still busy with the last one, or one draw would loose two arrows.
  function armCannotDraw() {
    const m = playerWeapon.machine;
    return (((!!m.ranged && m.state === 'Idle') && fpArm.active() || fpArm.thirdActive()) && fpArm.shotBusy());
  }
  // The gate is `machine.ranged`, not `isBow`, so guns hold their hit for the arm too.
  function holdShotForArm(evs, dt, armShoots) {
    if (!armShoots) {
        if (_heldHit && playerWeapon.machine.ranged) {
          const out = [...evs];
          if (_heldSound) out.push('bowSound');
          out.push('hit');
          _heldHit = false; _heldSound = false;
          return { evs: out, fired: true };
        }
        _heldHit = false;
        _heldSound = false;
        return { evs, fired: false };
      }
      const out = [];
      for (const ev of evs) {
        if (ev === 'hit') { _heldHit = true; _heldHitAge = 0; continue; }
        // The loose sound is held with the shot, so the string is never heard before the arrow leaves.
        if (ev === 'bowSound') { _heldSound = true; continue; }
        out.push(ev);
      }
      if (_heldHit) {
        _heldHitAge += dt;
        if (fpArm.takeShootRelease() || (_heldHitAge >= HELD_HIT_MAX_S && !fpArm.shotBusy()) || _heldHitAge >= HELD_HIT_CAP_S) {
          _heldHit = false;
          if (_heldSound) { _heldSound = false; out.push('bowSound'); }
          out.push('hit');
          return { evs: out, fired: true };
        }
      }
      return { evs: out, fired: false };
  }

  return {
    refreshWorn() { syncWorn(); },
    handDoor() {
      syncWorn();
      return { usingRightHand: playerWeapon.usingRightHand, switchHand: () => this.switchHand() };
    },
    toggleLight() { return handheldOn() ? handheld.toggleLightPress() === true : false; },
    // Returns true when the hands started and the spell resolves on frame 5; false means resolve it now.
    castSpellAnim: (rangeType, element, onRelease = null) => {
      cast.n = (cast.n + 1) & 0xffff; cast.rangeType = rangeType | 0; cast.element = Number.isInteger(element) && element >= 0 && element <= 4 ? element : 4;
      const rate = castRate(entity);
      const armCasts = fpArm.castSpell(rangeType, rate, castReleaseS(rate)) && (fpArm.active() || fpArm.thirdActive());
      const armHolds = armCasts && !fpArm.castPaced?.();
      const oneHand = spellHandFits();
      const started = fpsSpellCasting.playOneShot(element, onRelease, armHolds ? { hold: () => fpArm.takeCastRelease() || !fpArm.castInFlight(), rate } : { rate });
      if (started) _castOneHand = oneHand;
      return started;
    },
    playerWeapon,
    swing,
    cast,
    shot,
    noteShot(weapon) { noteShotHere(weapon); },
    attackInput(dx, dy, held) {
      // The latch mirrors the live button, so a release while sheathed still counts.
      _held = held;
      if (playerWeapon.sheathed || (entity?.equipCountdown ?? 0) > 0) return;
      _dx += dx; _dy += dy;
    },
    clickAttack() {
      if (abilityRigBusy(entity, _techRig)) return;
      if (playerWeapon.sheathed || (entity?.equipCountdown ?? 0) > 0 || _climbing) return;
      if (armCannotDraw()) return;
      if (castPlaying() || (_spellHand && castPending())) return;
      if (techniqueFlying()) return;
      const strike = playerWeapon.clickAttack();
      if (strike) fpAttack(strike);
    },
    toggleSheath() { rawToggleSheath(); },
    get toggleSheathCalls() { return _toggleSheathCalls; },
    /** @returns */
    readyWeapon() {
      syncWorn();
      const m = playerWeapon.machine;
      if (m.isBow && m.now < m.cooldownUntil) return false;
      if (m.state !== 'Idle' || _heldHit) return false;
      if (_spellHand && armCasting()) return false;
      if ((spellArmed() || fpsSpellCasting.isPlayingAnim) && spellHandHands()) { if (fpsSpellCasting.isPlayingAnim) return false; }
      else if (spellArmed() || fpsSpellCasting.isPlayingAnim) {
        abortSpell();
        if (!playerWeapon.sheathed) playerWeapon.toggleSheath();
      }
      rawToggleSheath();
      return true;
    },
    // The hand never changes mid-swing. Hosts poll this key on its release edge, unlike the ready key.
    switchHand() {
      const m = playerWeapon.machine;
      if (m.isBow && m.now < m.cooldownUntil) return false;
      if (m.state !== 'Idle' || _heldHit) return false;
      if (castPlaying()) return false;
      syncWorn();
      if (bindWorn && fpArm.ready() && !(playerWeapon.currentRightHandWeapon && playerWeapon.currentLeftHandWeapon) && playerWeapon.handsMode !== HANDS_MODE.Fists) return false;
      const line = playerWeapon.toggleHand({ entity, apply: bindWorn });
      if (line === null) return false;
      if (twoHanded(playerWeapon.handsMode)) say(line === USING_RIGHT_HAND_TEXT ? t('combat.leadRightHand', 'Leading with the right hand.') : t('combat.leadLeftHand', 'Leading with the left hand.'));
      else say(line === USING_RIGHT_HAND_TEXT ? localizedText('usingRightHand', 'Using weapon in right hand.') : localizedText('usingLeftHand', 'Using weapon in left hand.'));
      return true;
    },
    /** @returns */
    frame(dt, { paralyzed = false } = {}) {
      bindArm();
      bindBody();
      bindGlobals();
      syncWorn();
      askHeld();
      _spellHand = spellHandNow();
      tellSpellHand({ up: _spellHand, fits: spellHandFits(), busy: handsBusy() });
      _spellGuard.weapon = guardStep(_spellGuard.weapon, _spellHand && fpsSpellCasting.isPlayingAnim, dt);
      _spellGuard.hand = guardStep(_spellGuard.hand, _spellHand && playerWeapon.machine.state !== 'Idle', dt);
      pollEotbKeys();
      // Steps outside the paralysis gate, so a cast already in flight finishes.
      fpsSpellCasting.tick(dt);
      if (entity && (entity.equipCountdown ?? 0) > 0) {
        entity.equipCountdown = Math.max(0, entity.equipCountdown - dt * 980);
      }
      const c = cv();
      const camNow = camera?.() ?? null;
      const climbing = _climbing = !!camNow?.climbing;
      const handsLane = !fpArm.active() && !fpArm.thirdActive() && !eotbHidesWeapon();
      _climbLower = climbLowerStep(_climbLower, climbing || (handsLane && climbHands.showing()), dt);
      const castTakesHands = fpsSpellCasting.isPlayingAnim && !eotbHidesSpellHands();
      const handsClimb = handsLane && _climbLower >= CLIMB_HANDS_AFTER && !castTakesHands ? (camNow?.climb ?? null) : null;
      const handsLens = handsClimb || climbHands.law.present > 0 ? climbLens(cv(), { fov: fieldOfView(), viewport: renderer?.worldViewportRect ?? null, aspect: renderer?.worldProjAspect ?? null, offsetHeight: weaponOffsetHeight() }) : null;
      climbHands.update(dt, handsClimb, { yaw: camNow?.yaw, pitch: camNow?.pitch, lens: handsLens });
      const canAttack = !playerWeapon.sheathed && (entity?.equipCountdown ?? 0) <= 0 && (!spellArmed() || _spellHand) && !armCasting() && !(_spellHand && castPending()) && !fpsSpellCasting.isPlayingAnim && !climbing && !actTool();
      const armLoosing = armCannotDraw();
      const hookReady = !paralyzed && !!c && !armLoosing && !_heldHit && !fpsSpellCasting.isPlayingAnim && !climbing && !actTool() && playerWeapon.machine.state === 'Idle' && (entity?.equipCountdown ?? 0) <= 0;
      const hasHook = (entity?.items ?? []).some(isGrappleItem);
      if (hasHook && !_hookArtAsked) { _hookArtAsked = true; artFor(GRAPPLE_HAND_ITEM); }
      const gear = stepHeavyGear(_gearToken, { dt, weapon: playerWeapon.weapon, sheathed: playerWeapon.sheathed, held: _held, canAttack, paralyzed, hookDown: !!actionDown?.('GrapplingHook'), canHook: hookReady, hasHook, camera, collider, canvas: c, renderer, flip: handedFlip(), audio, say });
      _hookFrame = gear.hookFrame;
      _hooking = gear.grappling;
      // The technique key steps ahead of the gesture: both start the one machine, and the first holds it.
      _techDt = dt;
      _techCtx ??= {
        rig: _techRig, entity, pw: playerWeapon, cam: null, collider: null, held: false, ready: false, cancel: false, paralyzed: false, blocked: false, holding: false,
        startSwing: (s, offhand) => { if (!playerWeapon.techniqueStrike(s, offhand)) return false; fpAttack(s, _techDt); return true; },
        door: technique, say, noteShot: noteShotHere,
      };
      const tc = _techCtx;
      if (camNow?.pos && camNow?.feet) {
        _techCam.pos = camNow.pos; _techCam.yaw = camNow.yaw ?? 0; _techCam.pitch = camNow.pitch ?? 0;
        _techCam.feet = camNow.feet; _techCam.move = camNow.move; tc.cam = _techCam;
      } else tc.cam = null;
      tc.collider = collider?.() ?? null;
      tc.held = !!actionDown?.(TECHNIQUE_ACTION);
      tc.ready = !paralyzed && !!c && canAttack && !armLoosing && !_heldHit && !!camNow?.pos && !!camNow?.feet && !gear.grappling;
      tc.cancel = !!activateHeld();
      tc.paralyzed = !!paralyzed;
      tc.blocked = !!technique?.blocked?.();
      tc.holding = !!_heldHit;
      tc.spellReadied = spellArmed();
      const legacy = abilitiesEnabled() ? techniqueState() : null;
      tc.legacyBusy = !!(legacy?.aiming || legacy?.act);
      const abilityBusy = stepAbilityRig(dt, tc);
      if (abilityBusy) tc.ready = false;
      stepTechnique(dt, tc);
      const strike = !abilityBusy && !gear.grappling && !paralyzed && c && canAttack && !armLoosing && !techniqueFlying()
        ? playerWeapon.gesture(_dx, _dy, _held, dt, Math.max(c.clientWidth, c.clientHeight), { cancelHeld: activateHeld() })
        : null;
      if (strike) fpAttack(strike, dt);
      _dx = 0; _dy = 0;
      fpRecheck();
      // The werewolf form is handed over ahead of the ready() gate, because a refused wolf leaves no arm built.
      if (entity && !paralyzed) {
        const wolf = isMwWerewolf(entity);
        if (wolf !== wolfForm) { wolfForm = wolf; wolfSkin = wolf ? ownWerewolfSkin() : null; }
        fpArm.setWerewolf(wolf, { skin: wolfSkin });
        fpArm.setVampire?.(!!liveVampirism(entity));
      }
      // The gate is ready(), not active(), because active() needs the mesh that only update() creates.
      if (!paralyzed && fpArm.ready()) {
        fpArm.setSpellHand(_spellHand);
        fpArm.setSheathed(playerWeapon.sheathed);
        const { armItem, offItem } = handArm();
        fpArm.setTorch(isLitTorch(entity?.lightSource));
        fpArm.setHipLight(lanternAtWaist(entity?.lightSource));
        fpArm.readySpell(spellArmed());
        fpArm.setWeaponGlow?.(meshGlow(armItem), armItem);
        fpArm.setOffWeaponGlow?.(offItem ? meshGlow(offItem) : null, offItem);
        if (entity) fpArm.setWorn(dfWornEquipment(equipTableOf(entity), EQUIP_SLOTS, ARMOR_ENUM));
        const m = playerWeapon.machine;
        if (!(m.isBow && m.state === 'StrikeUp')) fpArm.release();
        fpArm.update(dt);
      }
      if (paralyzed) return [];
      // The machine alone decides a hit; for a shot the arm animates, only its announcement waits for the release.
      const evs = _climbing ? (playerWeapon.update(dt), []) : playerWeapon.update(dt);
      if (playerWeapon.machine.isBow && evs.includes('done')) _bowReleaseHidden = true;
      const armShoots = (fpArm.active() || fpArm.thirdActive()) && !!playerWeapon.machine.ranged;
      const held = holdShotForArm(evs, dt, armShoots);
      const _torchesOn = handheldOn();
      if (!_torchesOn && _handheldWasOn) handheld.dispose();
      _handheldWasOn = _torchesOn;
      const cam = camNow;
      const mv = cam?.move ?? {};
      const spd = entity ? liveStat(entity, 'speed') : 50;
      const base = Number.isFinite(mv.baseSpeed) ? mv.baseSpeed : walkSpeed(spd);
      const ratio = Number.isFinite(mv.speedRatio) ? mv.speedRatio : (Number.isFinite(mv.speedField) && base > 0 ? mv.speedField / base : 1);
      let localVel = [0, 0, 0];
      if (cam?.pos && _lastEye && dt > 0) {
        const v = [(cam.pos[0] - _lastEye[0]) / dt, (cam.pos[1] - _lastEye[1]) / dt, (cam.pos[2] - _lastEye[2]) / dt];
        const yaw = cam.yaw || 0, sy = Math.sin(yaw), cy = Math.cos(yaw);
        localVel = [v[0] * cy - v[2] * sy, v[1], v[0] * sy + v[2] * cy];
      }
      keepEye(cam?.pos);
      const frameMotion = { grounded: mv.grounded !== false, crouching: !!mv.crouching, riding: !!mv.riding, standing: !!mv.standing, speedRatio: ratio, baseSpeed: base, localVel };
      stepTwoHands(dt, mv, localVel, { climbing, handsLane });
      // A switched-off shield frame is counted here, because the block below is skipped when only that mod is on.
      if (!shieldOn()) shield.offFrame();
      if (widgetOn() || _torchesOn || shieldOn()) {
        const held = activateHeld();
        _activateStarted = held && !_activatePrev; _activatePrev = held;
        const look = takeFrameLook();
        const lookAxes = dfuLookAxes(look);
        const camThunk = () => (cam ? { ...cam, forward: [Math.sin(cam.yaw || 0) * Math.cos(cam.pitch || 0), Math.sin(cam.pitch || 0), Math.cos(cam.yaw || 0) * Math.cos(cam.pitch || 0)],
          right: [Math.cos(cam.yaw || 0), 0, -Math.sin(cam.yaw || 0)], up: [0, 1, 0] } : null);
        if (_torchesOn) {
          bindTorches();
          const tctx = {
            renderer, canvas: c, entity, machine: playerWeapon.machine, sheathed: playerWeapon.sheathed, usingRightHand: playerWeapon.usingRightHand,
            castPlaying: fpsSpellCasting.isPlayingAnim, spellArmed: spellArmed(), thirdPerson: fpArm.thirdActive() || eotbHidesWeapon(),
            climbing: !!cam?.climbing, swimming: !!mv.swimming, transformedLycanthrope: !!entity && isTransformedLycanthrope(entity),
            motion: frameMotion,
            look: lookAxes, swingHeld: _held, cursorActive: cursorActive(), camera: camThunk, collider: () => collider?.() ?? null,
            actionDown: (action) => !!actionDown?.(action), sheathWeapons: () => { if (!playerWeapon.sheathed) playerWeapon.toggleSheath(); },
          };
          handheld.update(dt, tctx);
          handheld.lateUpdate(dt, tctx);
        }
        if (shieldOn()) shield.lateUpdate({
          dt, time: _shieldTime += dt,
          screenRect: { x: 0, y: 0, width: c?.width ?? 320, height: c?.height ?? 200 },
          item: shieldItem(), entity,
          attacking: playerWeapon.machine.state !== 'Idle', sheathed: playerWeapon.sheathed,
          castingAnim: fpsSpellCasting.isPlayingAnim, hasReadySpell: spellArmed(),
          equipCountdownLeftHand: entity?.equipCountdown ?? 0,
          isClimbing: !!cam?.climbing, isPaused: false, loadInProgress: false,
          motor: {
            speed: ratio * base, baseSpeed: base,
            isGrounded: mv.grounded !== false, isCrouching: !!mv.crouching, isRiding: !!mv.riding,
            isStandingStill: !!mv.standing, moveDirectionLocal: localVel,
          },
          look: { x: lookAxes[0], y: lookAxes[1], cursorActive: cursorActive(), swingAction: _held },
        });
        const pair = pairUp(), cf = { c, motion: frameMotion, look: lookAxes, camera: camThunk };
        if (widgetOn()) widget.lateUpdate(dt, {
          ...cloneFrame(pair ? playerWeapon.handItem('R') : playerWeapon.weapon, pair ? 'R' : null, cf),
          ...(pair ? {} : { machine: playerWeapon.machine, usingRightHand: playerWeapon.usingRightHand }),
          sheathed: playerWeapon.sheathed, shown: spriteShown(),
        });
        if (widgetOn() && (pair || !twoHands.offWidget.settledHidden)) twoHands.offWidget.lateUpdate(dt, { ...cloneFrame(playerWeapon.handItem('L'), 'L', cf), sheathed: false, shown: pair && spriteShown(), clockOf: widget });
      }
      return claimShot(claimAbilityEvents(held.evs, tc), tc);
    },
    armsDrawn() { return _armDrewLast && fpArm.drewLast(); },
    climbLower() { return _climbLower; },
    armsAvailable() { return !eotbHidesWeapon() && fpArm.active(); },
    holdPaper(spec, opts) { return fpArm.holdPaper(spec, opts); },
    releasePaper() { return fpArm.releasePaper(); },
    paperCorners() { return fpArm.paperCorners(); },
    heldPose() { return fpArm.heldPose(); },
    setHeldPose(spec) { return fpArm.setHeldPose(spec); },
    draw({ paralyzed = false } = {}) {
      _armDrewLast = false;
      try { return onUiScreen(renderer, cv(), () => drawInner({ paralyzed })); } finally { widget.endOfFrame(); twoHands.offWidget.endOfFrame(); shield.endOfFrame(); }
    },
    widget,
    twoHands,
    handArm: () => handArm({ sync: true }),
    shield,
    climbHands,
    handheld,
    dispose() { handheld.dispose(); _handheldWasOn = false; cancelGrapple(); },
    silenceTorch() { handheld.silence(); },
  };
  function drawInner(o) {
    const dy = techniqueHands().y;
    if (!(dy > 0)) return drawLayer(o);
    if (fpArm.active()) { _armDip = dy; try { return drawLayer(o); } finally { _armDip = 0; } }
    if (typeof renderer?.setScreenOffset !== 'function') return drawLayer(o);
    const ox = renderer.screenOffset?.[0] ?? 0, oy = renderer.screenOffset?.[1] ?? 0;
    _dipPx = dy * (cv()?.height ?? 0);
    renderer.setScreenOffset(ox, oy + _dipPx);
    try { return drawLayer(o); } finally { renderer.setScreenOffset(ox, oy); _dipPx = 0; }
  }
  function drawLayer({ paralyzed = false } = {}) {
    {
      bindArm();
      bowArrowGuard();
      const c = cv();
      if (fpArm.thirdActive()) return;
      const fpTint = fpLightingOn() ? (renderer?.flatLightAt?.() ?? null) : null;
      let spellHandsDrawn = false;
      if (c && !fpArm.active() && !eotbHidesSpellHands()) {
        const side = _spellHand ? spellHandSide() : null;
        const castHands = (art, f, opacity = 1) => {
          if (side) drawSpellHand(renderer, c, art, f, { side, tint: fpTint, opacity, guard: fpsSpellCasting.isPlayingAnim ? 0 : _spellGuard.hand });
          else drawSpellCastHands(renderer, c, art, f, { tint: fpTint, opacity });
        };
        const intensity = spellVisualIntensity(false);
        if (intensity) castHands(spellArtFor(fpsSpellCasting.element), fpsSpellCasting.frameIndex, intensity);
        spellHandsDrawn = fpsSpellCasting.isPlayingAnim;
        if (readiedHandsOn() && !fpsSpellCasting.isPlayingAnim && !climbHands.showing()) {
          const sp = readiedSpell();
          const f = readiedHandsFrame(sp, fpsSpellCasting.isPlayingAnim);
          if (f >= 0) { castHands(spellArtFor(sp.element), f); spellHandsDrawn = true; }
        }
      }
      const tool = c && !paralyzed && !fpArm.active() && !eotbHidesWeapon() ? actTool() : null;
      if (tool) {
        const toolArt = artFor(tool);
        if (toolArt) drawFpsWeapon(renderer, c, toolArt, tool.state ?? 'Idle', tool.frame ?? 0, { tint: fpTint });
        return;
      }
      if (c && !paralyzed && !spellHandsDrawn && !fpArm.active() && !eotbHidesWeapon() && !sheetWindowUp()) climbHands.draw(c, { tint: fpTint });
      const torchOnly = !shown() && !spellArmed() && !fpsSpellCasting.isPlayingAnim
        && (entity?.equipCountdown ?? 0) <= 0 && isHeldLight(entity?.lightSource)
        && (!fpArm.active() || fpArm.torchShown())
        && !lanternAtWaist(entity?.lightSource);
      // A held sheet relaxes only the sheathe leg, stated positively, so a later shown() leg stays in force.
      const sheetOnly = playerWeapon.sheathed && !spellArmed() && !fpsSpellCasting.isPlayingAnim
        && (entity?.equipCountdown ?? 0) <= 0 && fpArm.active() && fpArm.holdingPaper();
      if (shieldOn()) shield.setThirdPerson(eotbHidesWeapon());
      const shieldRect = (shieldOn() && c && !eotbHidesWeapon() && !fpArm.active())
        ? shield.drawRect() : null;
      const armCasts = fpArm.active() && (spellArmed() || fpsSpellCasting.isPlayingAnim || fpArm.castInFlight());
      const armsClimb = fpArm.active() && !!fpArm.climbPosed?.();
      const runHands = !!c && twoHands.running && !fpArm.active() && !eotbHidesWeapon() && !sheetWindowUp();
      const armsRun = fpArm.active() && !!fpArm.runPosed?.();
      const hookDraws = hookFramesDraw(_hooking, { arms: fpArm.active(), body: eotbHidesWeapon() });
      if ((paralyzed || ((((!shown() && !hookDraws && !torchOnly && !sheetOnly && !shieldRect && !armCasts) && !armsClimb) && !runHands) && !armsRun))) return;
      const motion = playerWeapon.techniqueBlow;
      const pose = motion?.motion && !motion.cancelled && playerWeapon.machine.state !== 'Idle'
        ? strikePose(motion.motion, playerWeapon.machine.now, techniqueMotion()) : null;
      fpArm.setScreenTransform(widgetOn() && !armsClimb ? (base) => widget.armsTransform(base) : null);
      if (_climbLower > 0 && !armsClimb) { const armsBase = fpArm.screenTransform(); fpArm.setScreenTransform((base) => climbLowerRect(armsBase ? armsBase(base) : base, _climbLower)); }
      if (pose && fpArm.active()) {
        const previous = fpArm.screenTransform();
        fpArm.setScreenTransform(base => poseStrikeRect(previous ? previous(base) : base, pose, base.h));
      }
      if (_armDip > 0) { const armsBase = fpArm.screenTransform(); fpArm.setScreenTransform((base) => techniqueDipRect(armsBase ? armsBase(base) : base, _armDip, base.h)); }
      if ((!armsClimb && (_climbLower >= CLIMB_LOWER_GONE || (_climbLower >= 0.5 && !fpArm.active() && widgetOn())))) return;
      const runDrawn = runHands && (handsEmpty() || !((shown() || torchOnly || !!shieldRect || spellHandsDrawn)));
      if (c && !_hooking && !eotbHidesWeapon() && !fpArm.active() && !sheetWindowUp() && (runDrawn || (pairUp() && shown()))) {
        const o = { pose, widget, widgetOn: widgetOn(), shown: spriteShown(), tint: fpTint, offsetHeight: weaponOffsetHeight() - climbDrop(_climbLower, c.height) };
        if (runDrawn) twoHands.drawRun(renderer, c, artFor(null), pairUp() && shown() ? o : { ...o, shown: false });
        if (pairUp() && shown()) twoHands.drawPair(renderer, c, { ...o, running: runDrawn, artFor: (hand) => artFor(playerWeapon.handItem(hand)), glowFor: (hand) => glowOf(playerWeapon.handItem(hand)) });
        return;
      }
      _armDrewLast = !eotbHidesWeapon() && fpArm.active();
      if (eotbHidesWeapon()) return;
      // The arm draws whole and returns; without the return both lanes would composite.
      if (fpArm.active()) { fpArm.draw(c); return; }
      if (sheetWindowUp()) return;
      if (shieldRect) shield.draw((index, rect, uv) => drawShieldSprite(index, rect, uv, fpTint));
      if (handheldOn() && c) handheld.draw(renderer, c, fpTint);
      if (torchOnly && !_hooking) return;
      if (!shown() && !_hooking) return;
      if (!_hooking && widgetOn() && c && widget.draw(renderer, c, fpTint, {
        transform: _spellGuard.weapon > 0 ? r => ({ ...r, y: r.y + guardDrop(_spellGuard.weapon, r.h) }) : null, pose,
      })) return;
      const art = c && artFor(_hooking ? GRAPPLE_HAND_ITEM : playerWeapon.weapon);
      const m = playerWeapon.machine, offsetHeight = c ? weaponOffsetHeight() - climbDrop(_climbLower, c.height) : 0;
      const mf = _hooking ? _hookFrame : m.frame;
      const spellDrop = art && _spellGuard.weapon > 0 ? guardDrop(_spellGuard.weapon, fpsWeaponQuad(c, art, m.state, mf, { offsetHeight })?.rect.h ?? 0) : 0;
      if (art && (_hooking || spriteShown())) drawFpsWeapon(renderer, c, art, m.state, mf, { pose, tint: fpTint, offsetHeight: offsetHeight - spellDrop, glow: _hooking ? null : heldGlowNow() });
    }
  }
}

export function envAttack(actions, collider, eye, lookDir, rolls = Math.random) {
  let best = null, bestD = Infinity;
  let first;
  for (const o of actions.objects.values()) {
    const box = objectAabb(o);
    if (!box) continue;
    const d = rayAabb(eye, lookDir, box);
    if (d === null || d > WEAPON_REACH || d >= bestD) continue;
    if (hasMeshCollider(o) && collider.raycastHit) {
      first ??= collider.raycastHit(eye, lookDir, RAY_DISTANCE);
      if (first.key != null && first.key !== o.key && actions.objects.has(first.key)) continue;
    }
    const wall = collider.raycast(eye, lookDir, d - 0.05);
    if (Number.isFinite(wall) && wall < d - 0.05) continue;
    best = o; bestD = d;
  }
  if (!best) return false;
  actions.receive(best, 'Attack');
  if (best.kind === 'door') { actions.attemptBash(best, rolls()); return true; }
  return false;
}
