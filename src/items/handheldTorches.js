import { modSettingsOf } from '../mods/modSettings.js';
import { getBool, getInt } from '../platform/settings.js';
import { liveStat } from '../characters/statMods.js';
import { TEMPLATES, isLightSource } from './useItem.js';
import { getItem, addItem } from './inventory.js';
import { conditionWord, itemLongName } from './itemInfo.js';
import { getItemHands, EQUIP_SLOTS, ITEM_HANDS, addEquipChangeListener } from '../characters/equip.js';
import { weaponTypeForItem, WEAPON_TYPES, NATIVE_W, NATIVE_H } from '../combat/fpsWeapon.js';
import { weaponOffsetHeight } from '../ui/hudLarge.js';
import { SOUND } from '../audio/soundClips.js';
import { moveTowards, moveTowards2, snap, BOB_SHAPE, STEP_CONDITION } from '../combat/weaponWidget.js';
import { IDLE_BREATH } from '../combat/weaponWidgetMotion.js';
import { setPlayerTorchOffsetOverride } from '../player/playerTorch.js';
import { beltLanternOf } from './beltLantern.js';
import { toScreenOrder } from '../formats/color32Order.js';
import { decodePng } from '../render/textureReplacement.js';
import { setLightSource, addLightSourceListener } from './lightSource.js';
import { noteFirstUse } from '../ui/tutorials.js';

export const HANDHELD_TORCHES_VENDOR = 'handheld-torches';
export const HANDHELD_TORCHES_MOD = Object.freeze({
  guid: '5922796c-9fa0-4e2f-8aaa-7c9702015813', title: 'Handheld Torches', version: '1.4.1', author: 'RedRoryOTheGlen',
});

export const ON_STOW = Object.freeze({ Unequip: 0, Drop: 1 });
export const ON_PICK = Object.freeze({ Store: 0, Equip: 1, ForceEquip: 2 });
export { BOB_SHAPE, STEP_CONDITION };
export const FREE_HAND = Object.freeze({ None: 0, Left: 1, Right: 2 });

export const DROPPED_ARCHIVE = 112358;
export const SPRITE_ARCHIVE = 112359;
export const DROPPED_RECORD = Object.freeze({ Torch: 0, Candle: 1, HolyCandle: 2, DousedOffset: 10 });
export const CLIPS = Object.freeze({
  burning: SOUND.Burning,
  drop: SOUND.EquipStaff,
  throwSwing: SOUND.SwingHighPitch,
  douse: 381,
  ignite: SOUND.Ignite,
  stow: 417,
});
export const MESSAGES = Object.freeze({
  drop: 'You drop the ', dropTorchless: "You don't have a light source to drop",
  pickupEquip: 'You pick up the ', pickupStore: 'You stow the ',
  noFreeHand: "You can't hold a light source right now", examine: 'You see a ',
  throw: 'You throw the ', throwTorchless: "You don't have a torch to throw",
  ignite: 'You ignite the ', igniteTorchless: "You don't have a light source", douse: 'You douse the ',
});
export const ANIMATION_TIME = 0.0625;
export const DROP_FORWARD_CAST = 1.45;
export const DROP_DOWN_CAST = 145;
export const THROW_HAND_OFFSET = 0.35;
export const THROW_STRENGTH_MIN = 0.25, THROW_STRENGTH_MAX = 2;
export const TRAJECTORY_STEPS = 300, TRAJECTORY_FIXED_DT = 0.02, TRAJECTORY_SPEED = 25, TRAJECTORY_GRAVITY = 9.8;
export const TORCH_LIGHT_AT = Object.freeze({ torch: { left: 0.34, up: 0.9, forward: 0.25 }, lantern: { left: 0.26, up: 0, forward: 0.25 } });
export const SECONDS_PER_CONDITION = 20;

const T = TEMPLATES;
const isTorch = (it) => it?.templateIndex === T.Torch;
const isLantern = (it) => it?.templateIndex === T.Lantern;
export const isHeldLight = (it) => isTorch(it) || isLantern(it);

export function readTorchSettings(read = () => modSettingsOf(HANDHELD_TORCHES_VENDOR)) {
  const s = read();
  return {
    enabled: !!s.Enabled,
    lastLight: !!s['Handling.RememberLastLightSource'], onStow: s['Handling.OnStow'] | 0, onPick: s['Handling.OnPick'] | 0,
    stowOnSpellcasting: !!s['Handling.StowWhenSpellcasting'], stowOnClimbing: !!s['Handling.StowWhenClimbing'], stowOnSwimming: !!s['Handling.StowWhenSwimming'],
    twoHandedRelaxed: !!s['Handling.RelaxedTwoHandedWeapons'], lanternRelaxed: !!s['Handling.RelaxedLanterns'],
    lanternsAtWaist: !!s['Handling.LanternsAtWaist'],
    throwStrength: Number(s['Throwing.ThrowStrength']), throwAngle: Number(s['Throwing.ThrowAngleOffset']), throwSpread: Number(s['Throwing.ThrowDispersion']),
    throwGravity: Number(s['Throwing.GravityStrength']), throwBounce: Number(s['Throwing.Bounciness']), throwScale: Number(s['Throwing.ThrowScaleSpeed']),
    throwDrawTrajectory: !!s['Throwing.ShowTrajectory'], fire: !!s['Throwing.Combustion'], fireAccuracy: s['Throwing.Accuracy'] | 0,
    fireDuration: s['Throwing.Duration'] | 0, fireChance: s['Throwing.Chance'] | 0, fireDamageRange: [s['Throwing.Magnitude'][0] | 0, s['Throwing.Magnitude'][1] | 0],
    fireLight: !!s['Throwing.Emission'], fireLightShadows: !!s['Throwing.EmissionShadows'],
    showSprite: !!s['Modules.Sprite'], bob: !!s['Modules.Bob'], inertia: !!s['Modules.Inertia'], stepTransforms: !!s['Modules.Step'],
    mirrorSprite: !!s['Presentation.Ambidexterity'], tintSprite: !!s['Presentation.Tint'], playAudio: !!s['Presentation.PlayerTorchAudio'],
    sfxVolume: Number(s['Presentation.AudioVolume']), offsetX: Number(s['Presentation.Offset'][0]), offsetY: Number(s['Presentation.Offset'][1]),
    scale: Number(s['Presentation.Scale']), offsetSpeed: Number(s['Presentation.Speed']) * 2000, lockAspectRatio: !!s['Presentation.LockAspectRatio'],
    bobLength: (s['Bob.Length'] | 0) / 100, bobOffset: Number(s['Bob.Offset']), bobSizeXMod: Number(s['Bob.SizeX']) * 2, bobSizeYMod: Number(s['Bob.SizeY']) * 2,
    moveSmoothSpeed: Number(s['Bob.SpeedMove']) * 4, bobSmoothSpeed: Number(s['Bob.SpeedState']) * 500, bobShape: (s['Bob.Shape'] | 0) * 0.5, bobWhileIdle: !!s['Bob.BobWhileIdle'],
    inertiaScale: Number(s['Inertia.Scale']) * 500, inertiaSpeed: Number(s['Inertia.Speed']) * 500,
    inertiaForwardScale: Number(s['Inertia.ForwardDepth']) * 0.2, inertiaForwardSpeed: Number(s['Inertia.ForwardSpeed']) * 0.2,
    stepLength: s['Step.Length'] | 0, stepCondition: s['Step.Condition'] | 0,
    scaleTextureFactor: Number(s['Compatibility.TextureScaleFactor']) || 1,
  };
}

export const torchItemWords = (item) => `${conditionWord(item).toLowerCase()} ${itemLongName(item).toLowerCase()}`;

export const spriteUrl = (record, frame) => new URL(`../../vendor/handheld-torches/Textures/${SPRITE_ARCHIVE}_${record}-${frame}.png`, import.meta.url).href;

// Frame probes check the vendored set first: a missing frame's bundled URL would fetch /assets/undefined.
const VENDORED_TEXTURES = typeof window !== 'undefined'
  ? import.meta.glob('../../vendor/handheld-torches/Textures/*.png', { eager: true, query: '?url', import: 'default' })
  : null;
export const inVendoredSet = (table, file) => table == null || `../../vendor/handheld-torches/Textures/${file}` in table;
export const vendoredTexture = (file) => inVendoredSet(VENDORED_TEXTURES, file);

// Only the component whose update ran last answers equip changes; other hosts' rigs hold a stale frame.
// Equip changes run the hand law at once, because an open window holds the frames that would run it.
let _liveHandLaw = null;
addEquipChangeListener((entity) => _liveHandLaw?.(entity));

export function createHandheldTorches({
  settings = readTorchSettings, audio = null, say = () => {}, rolls = Math.random, torches = () => null, dropRefusal = () => null,
  handedness = () => getInt('Controls', 'Handedness', 0, 3) === 1,
  loadSprite = defaultLoadSprite,
} = {}) {
  const w = {
    handLeft: true, handRight: true, attacking: false, attacked: false, spellcasting: false, climbing: false, swimming: false,
    sheathed: false, usingRightHand: true, hasLightSource: false, lightSourceTemplateIndexLast: -1, lastLightSource: null, lastLightTemplateIndex: 0,
    hasDroppedOrThrownLight: false, isInThirdPerson: false,
    flipped: false, flippedCurrent: false, flippedLast: false, curAnimRect: { u0: 0, v0: 0, u1: 1, v1: 1 },
    textures: [], currentTexture: null, animTorchLength: 0, animLanternLength: 0, offsetFrame: -1, currentFrame: 0, animationTimer: 0,
    screenRect: { x: 0, y: 0, width: NATIVE_W, height: NATIVE_H }, screenRectLast: null, weaponOffsetHeight: 0, weaponOffsetHeightLast: 0,
    weaponScaleX: 1, weaponScaleY: 1,
    positionCurrent: { x: 0, y: 0, w: 0, h: 0 }, positionTarget: { x: 0, y: 0, w: 0, h: 0 },
    position: [0, 0], offset: [0, 0], scale: [1, 1],
    moveSmooth: 0, bobSmooth: [0, 0], inertiaCurrent: [0, 0], inertiaTarget: [0, 0], inertiaSpeedMod: 1, inertiaForwardCurrent: [0, 0], inertiaForwardTarget: [0, 0],
    throwTimer: 0, throwTime: 1, keysLast: new Set(), loop: null, loopVolume: 0, time: 0, s: settings(),
  };
  let ctx = null;
  let lightOffsetSet = null;
  const onLight = (entity, now) => {
    if (!w.loop || !ctx?.entity || entity !== ctx.entity || (now && isTorch(now))) return;
    w.loop.stop?.(); w.loop = null;
  };
  let offLight = null;

  const light = () => ctx?.entity?.lightSource ?? null;
  const items = () => ctx?.entity?.items ?? [];
  const hasFreeHand = () => w.handLeft || w.handRight;
  const getFreeHand = () => (!hasFreeHand() ? FREE_HAND.None : w.handLeft ? FREE_HAND.Left : FREE_HAND.Right);
  const liveSpeed = () => (ctx?.entity ? liveStat(ctx.entity, 'speed') : 50);
  const offsetSpeedLive = () => liveSpeed() / 100 * w.s.offsetSpeed;
  const contains = (group, template) => items().some((it) => it.group === group && it.templateIndex === template);
  const firstOf = (group, template) => getItem(items(), group, template, { allowEnchantedItem: true, allowQuestItem: true, priorityToConjured: false });
  const removeFromPack = (item) => { const l = items(); const i = l.indexOf(item); if (i >= 0) l.splice(i, 1); };
  const oneShot = (clip, volume = 1, pitch = 1) => audio?.playOneShot?.(clip, volume, pitch);
  const setLight = (it) => { if (ctx?.entity) setLightSource(ctx.entity, it); };
  const atWaist = (it) => isLantern(it) && (!!w.s.lanternsAtWaist || it.beltLantern === true);
  const lanternFirst = () => beltLanternOf(ctx?.entity) ?? firstOf('UselessItems2', T.Lantern);

  const loadTextures = (renderer) => {
    if (w.texturesLoading || !renderer) return;
    w.texturesLoading = (async () => {
      const list = [];
      let torchLen = 0, lanternLen = 0;
      for (let record = 0; record <= 1; record++) {
        let frame = 0;
        for (;;) {
          const img = await loadSprite(record, frame).catch(() => null);
          if (!img) break;
          const tex = renderer.uploadTexture('img', `ht:${SPRITE_ARCHIVE}_${record}-${frame}`, img);
          list.push({ tex, width: img.width, height: img.height });
          frame++;
          if (frame >= 99) break;
        }
        if (record === 1) lanternLen = frame; else torchLen = frame;
      }
      w.textures = list; w.animTorchLength = torchLen; w.animLanternLength = lanternLen;
      w.currentTexture = list[0] ?? null;
      refreshSprite();
    })().catch((e) => console.warn('[handheld torches] the sprites would not load', e));
  };

  function refreshSprite() {
    if (!w.currentTexture) return;
    const l = light();
    if (atWaist(l)) { w.offsetFrame = -1; setSheathe(); return; }
    if (l) w.offsetFrame = isLantern(l) ? 4 : 0;
    w.currentTexture = w.textures[w.currentFrame + w.offsetFrame] ?? w.currentTexture;
    if (w.s.lanternRelaxed && l && isLantern(l) && !hasFreeHand()) { setGuard(); return; }
    if (w.attacking) setAttack(); else setGuard();
  }
  const screenScale = () => {
    w.weaponScaleX = w.screenRect.width / NATIVE_W;
    w.weaponScaleY = w.s.lockAspectRatio ? w.weaponScaleX : w.screenRect.height / NATIVE_H;
  };
  const spriteW = () => (w.currentTexture?.width ?? 0) * w.s.scale * w.weaponScaleX / w.s.scaleTextureFactor;
  const spriteH = () => (w.currentTexture?.height ?? 0) * w.s.scale * w.weaponScaleY / w.s.scaleTextureFactor;
  function setGuard() {
    screenScale();
    const r = w.screenRect;
    const x = w.flipped ? r.x + r.width - r.width * 0.5 * w.s.offsetX : r.x + r.width * 0.5 * w.s.offsetX;
    w.positionTarget = { x, y: r.y + r.height - w.weaponOffsetHeight - r.height * 0.25 * w.s.offsetY, w: spriteW(), h: spriteH() };
  }
  function setAttack() {
    screenScale();
    const r = w.screenRect;
    w.positionTarget = { x: w.flipped ? r.x + r.width : r.x, y: r.y + r.height - w.weaponOffsetHeight, w: spriteW(), h: spriteH() };
  }
  function setSheathe() {
    screenScale();
    const r = w.screenRect;
    const h = spriteH();
    w.positionTarget = { x: w.flipped ? r.x + r.width : r.x, y: r.y + r.height - w.weaponOffsetHeight + h, w: spriteW(), h };
  }
  function getSpriteRect() {
    let x = w.positionCurrent.x + w.position[0], y = w.positionCurrent.y + w.position[1];
    const width = w.positionCurrent.w + w.positionCurrent.w * w.scale[0], height = w.positionCurrent.h + w.positionCurrent.h * w.scale[1];
    x -= width * 0.5; y -= height * 0.5;
    x += width * w.offset[0]; y += height * w.offset[1];
    const floor = w.weaponOffsetHeight;
    y = Math.max(w.screenRect.height - height - floor, Math.min(w.screenRect.height, y));
    if (w.s.stepTransforms) {
      const interval = w.s.stepLength * (w.screenRect.height / 64);
      x = snap(x, interval); y = snap(y, interval);
    }
    return { x, y, w: width, h: height };
  }

  function updateFreeHand() {
    w.handRight = true; w.handLeft = true;
    // Read the slot table as it stands, never mint one here: the rig's worn-item sync reads the same slot.
    const slots = ctx?.entity?.equip?.slots ?? {};
    const left = slots[EQUIP_SLOTS.LeftHand] ?? null, right = slots[EQUIP_SLOTS.RightHand] ?? null;
    const isBow = (it) => weaponTypeForItem(it) === WEAPON_TYPES.Bow;
    // Unlike the mod, a worn item takes its hand even when sheathed: Daggerfall's sheathed weapon is still held.
    // The mod compares with 2, which is Both in classic ItemHands but LeftOnly in ITEM_HANDS.
    const sheathedNow = !!ctx?.sheathed, usingRightNow = ctx?.usingRightHand !== false;
    if (left) {
      w.handLeft = false;
      if (getItemHands(left) === ITEM_HANDS.Both || isBow(left)) w.handRight = false;
    } else if (!sheathedNow && !usingRightNow) w.handLeft = false;
    if (right) {
      w.handRight = false;
      if (getItemHands(right) === ITEM_HANDS.Both) {
        if (w.s.twoHandedRelaxed) { if (isBow(right) || w.attacking) w.handLeft = false; }
        else w.handLeft = false;
      }
    } else if (!sheathedNow && usingRightNow) w.handRight = false;
    if (w.s.stowOnSpellcasting && w.spellcasting) { w.handRight = false; w.handLeft = false; }
    if (w.s.stowOnClimbing && w.climbing) { w.handRight = false; w.handLeft = false; }
    if (w.s.stowOnSwimming && w.swimming) { w.handRight = false; w.handLeft = false; }
    if (ctx?.transformedLycanthrope) { w.handRight = false; w.handLeft = false; }
    if (w.s.mirrorSprite) {
      w.flippedCurrent = !!handedness();
      if (!w.handLeft && w.handRight) w.flippedCurrent = !w.flippedCurrent;
      else if (!w.handLeft && !w.handRight) w.flippedCurrent = w.flippedLast;
      if (w.flippedCurrent !== w.flippedLast) {
        w.flipped = w.flippedCurrent; w.flippedLast = w.flippedCurrent;
        w.curAnimRect = w.flipped ? { u0: 1, v0: 0, u1: 0, v1: 1 } : { u0: 0, v0: 0, u1: 1, v1: 1 };
        refreshSprite();
        const l = light();
        if (l) {
          const sign = w.flipped ? -1 : 1;
          lightOffsetSet = isLantern(l) ? { ...TORCH_LIGHT_AT.lantern } : { left: TORCH_LIGHT_AT.torch.left * sign, up: TORCH_LIGHT_AT.torch.up, forward: TORCH_LIGHT_AT.torch.forward };
          setPlayerTorchOffsetOverride(lightOffsetSet);
          setSheathe();
          w.positionCurrent = { ...w.positionTarget };
        }
      }
    } else w.flipped = !!handedness();
  }

  function dropLightSource(item) {
    const no = dropRefusal?.() ?? null;
    if (no) { say(no); return; }
    const cam = ctx?.camera?.();
    const col = ctx?.collider?.();
    const centre = cam?.feet ? [cam.feet[0], cam.feet[1] + 0.9, cam.feet[2]] : (cam?.pos ? [cam.pos[0], cam.pos[1] - 0.8, cam.pos[2]] : [0, 0, 0]);
    const yaw = cam?.yaw || 0;
    const fwd = [Math.sin(yaw), 0, Math.cos(yaw)];
    let d = col?.raycast?.(centre, fwd, DROP_FORWARD_CAST);
    let at = Number.isFinite(d) ? [centre[0] + fwd[0] * d, centre[1] + fwd[1] * d, centre[2] + fwd[2] * d] : [centre[0] + fwd[0], centre[1] + fwd[1], centre[2] + fwd[2]];
    d = col?.raycast?.(at, [0, -1, 0], DROP_DOWN_CAST);
    at = Number.isFinite(d) ? [at[0], at[1] - d, at[2]] : [at[0], at[1] - 1, at[2]];
    torches()?.spawnLightSource(item.templateIndex, at, (item.currentCondition ?? 0) * SECONDS_PER_CONDITION);
    if (item === light()) setLight(null);
    removeFromPack(item);
    say(MESSAGES.drop + torchItemWords(item));
    audio?.play3d?.(CLIPS.drop, at, 1);
    w.hasDroppedOrThrownLight = true;
  }
  function throwLightSource(item, strength) {
    const no = dropRefusal?.() ?? null;
    if (no) { say(no); return; }
    const cam = ctx?.camera?.();
    const centre = cam?.feet ? [cam.feet[0], cam.feet[1] + 0.9, cam.feet[2]] : (cam?.pos ? [cam.pos[0], cam.pos[1] - 0.8, cam.pos[2]] : [0, 0, 0]);
    torches()?.spawnLightSourceProjectile(item.templateIndex, (item.currentCondition ?? 0) * SECONDS_PER_CONDITION, centre, cam?.forward ?? [0, 0, 1], strength, getFreeHand());
    if (item === light()) setLight(null);
    removeFromPack(item);
    oneShot(CLIPS.throwSwing, 1, 1);
    say(MESSAGES.throw + torchItemWords(item));
    w.hasDroppedOrThrownLight = true;
  }
  function throwLightSourceAction(l, strength) {
    if (l && isTorch(l)) { throwLightSource(l, strength); return; }
    const torch = contains('UselessItems2', T.Torch) ? firstOf('UselessItems2', T.Torch) : null;
    if (torch) throwLightSource(torch, strength); else say(MESSAGES.throwTorchless);
  }
  function dropLightSourceAction(l) {
    if (l && !isLantern(l)) { dropLightSource(l); return; }
    for (const [group, template] of [['UselessItems2', T.Torch], ['UselessItems2', T.Candle], ['ReligiousItems', T.Holy_candle]]) {
      if (contains(group, template)) { dropLightSource(firstOf(group, template)); return; }
    }
    say(MESSAGES.dropTorchless);
  }
  function toggleLightPress() {
    // With no free hand, the press reaches only the waist lantern; a torch lit here would be stowed the next frame.
    if ((w.s.lanternsAtWaist || beltLanternOf(ctx?.entity)) && !hasFreeHand() && waistPress()) return true;
    if (w.s.lanternRelaxed) {
      if (hasFreeHand() || contains('UselessItems2', T.Lantern)) { toggleLightSourceAction(); return true; }
    } else if (hasFreeHand()) { toggleLightSourceAction(); return true; }
    say(MESSAGES.noFreeHand);
    return false;
  }

  function toggleLightSourceAction() {
    noteFirstUse('torches');
    const l = light();
    if (l) {
      w.lastLightTemplateIndex = l.templateIndex;
      say(MESSAGES.douse + torchItemWords(l));
      setLight(null);
      oneShot(CLIPS.douse, 1, 1);
      return;
    }
    if (w.lastLightSource) { setLight(w.lastLightSource); w.lastLightSource = null; return; }
    w.lastLightSource = null;
    if (w.s.lastLight && w.lastLightTemplateIndex) {
      if (w.lastLightTemplateIndex === T.Lantern && contains('UselessItems2', T.Lantern)) setLight(lanternFirst());
      else if (contains('UselessItems2', w.lastLightTemplateIndex)) setLight(firstOf('UselessItems2', w.lastLightTemplateIndex));
      else if (contains('ReligiousItems', w.lastLightTemplateIndex)) setLight(firstOf('ReligiousItems', w.lastLightTemplateIndex));
    }
    if (!light()) {
      if (contains('UselessItems2', T.Lantern)) setLight(lanternFirst());
      else if (contains('UselessItems2', T.Torch)) setLight(firstOf('UselessItems2', T.Torch));
      else if (contains('UselessItems2', T.Candle)) setLight(firstOf('UselessItems2', T.Candle));
      else if (contains('ReligiousItems', T.Holy_candle)) setLight(firstOf('ReligiousItems', T.Holy_candle));
      else say(MESSAGES.igniteTorchless);
    }
    igniteTail();
  }
  function igniteTail() {
    const lit = light();
    if (lit) {
      w.lastLightTemplateIndex = lit.templateIndex;
      oneShot(CLIPS.ignite, 0.5, 1);
      say(MESSAGES.ignite + torchItemWords(lit));
      refreshSprite();
    }
  }
  function waistPress() {
    const l = light();
    if (l) { if (!atWaist(l)) return false; toggleLightSourceAction(); return true; }
    const lantern = lanternFirst();
    if (!lantern) return false;
    setLight(lantern);
    igniteTail();
    return true;
  }
  function receivePickedUp(item) {
    if (!ctx?.entity) return;
    addItem(items(), item, 'back');
    const inst = w;
    if (inst.s.onPick > ON_PICK.Store && !light()) {
      if (hasFreeHand()) { setLight(item); say(MESSAGES.pickupEquip + torchItemWords(item)); }
      else if (inst.s.onPick === ON_PICK.ForceEquip && !w.sheathed) {
        ctx.sheathWeapons?.();
        setLight(item); say(MESSAGES.pickupEquip + torchItemWords(item));
      } else {
        say(MESSAGES.pickupStore + torchItemWords(item));
        if (!inst.lastLightSource) inst.lastLightSource = item;
      }
    } else say(MESSAGES.pickupStore + torchItemWords(item));
    oneShot(CLIPS.stow, 1, 1);
  }

  const clampStrength = (v) => Math.max(THROW_STRENGTH_MIN, Math.min(THROW_STRENGTH_MAX, v));

  function handLaw(l) {
    if (atWaist(l)) { w.lastLightSource = null; return; }
    if (!hasFreeHand() && l && !isLantern(l)) {
      // A floor that refuses drops stows the light instead, or the refusal would repeat every frame.
      if (w.s.onStow > ON_STOW.Unequip && !(dropRefusal?.() ?? null)) dropLightSource(l);
      else { w.lastLightSource = l; setLight(null); }
    } else if (!hasFreeHand() && l && isLantern(l) && !w.s.lanternRelaxed) {
      if (!w.sheathed) say(MESSAGES.noFreeHand);
      w.lastLightSource = l; setLight(null);
    } else if (hasFreeHand() && w.lastLightSource) {
      setLight(w.lastLightSource); w.lastLightSource = null;
    }
  }

  const applyHandLaw = (entity) => {
    if (ctx?.entity !== entity) return;
    w.s = settings();
    updateFreeHand();
    handLaw(light());
  };

  /**
   * @param dt
   * @param c
   */
  function update(dt, c) {
    ctx = c;
    // Subscribe here, not at creation: switching the mod off disposes the component and on again reuses it.
    offLight ??= addLightSourceListener(onLight);
    _liveHandLaw = applyHandLaw;
    w.s = settings();
    w.time += dt;
    if (!w.textures.length) loadTextures(c.renderer);
    const l = light();
    updateFreeHand();
    const wantLoop = w.s.playAudio && l && isTorch(l);
    if (wantLoop && (!w.loop || w.loopVolume !== w.s.sfxVolume)) { w.loop?.stop?.(); w.loop = audio?.loop?.(CLIPS.burning, w.s.sfxVolume) ?? null; w.loopVolume = w.s.sfxVolume; }
    else if (!wantLoop && w.loop) { w.loop.stop?.(); w.loop = null; }
    if (!c.sheathed) { if (w.sheathed) w.sheathed = false; }
    else if (!w.sheathed) { w.sheathed = true; if (w.s.lanternRelaxed && l && isLantern(l) && hasFreeHand()) setGuard(); }
    if (c.usingRightHand !== false) { if (!w.usingRightHand) { w.usingRightHand = true; if (w.s.lanternRelaxed && l && isLantern(l) && hasFreeHand()) setGuard(); } }
    else if (w.usingRightHand) { w.usingRightHand = false; if (w.s.lanternRelaxed && l && isLantern(l) && hasFreeHand()) setGuard(); }
    handLaw(l);
    if (w.s.showSprite) {
      const cur = light();
      w.offsetFrame = cur && !atWaist(cur) ? (isLantern(cur) ? 4 : isTorch(cur) ? 0 : -1) : -1;
      if (w.offsetFrame !== -1) {
        if (w.animationTimer > ANIMATION_TIME) {
          w.animationTimer = 0;
          const len = w.offsetFrame === 4 ? w.animLanternLength : w.animTorchLength;
          w.currentFrame = w.currentFrame < len - 1 ? w.currentFrame + 1 : 0;
          w.currentTexture = w.textures[w.offsetFrame + w.currentFrame] ?? w.currentTexture;
        } else w.animationTimer += dt;
      }
    }
    let refresh = false;
    const cur = light();
    if (cur) {
      if (!w.hasLightSource) { w.hasLightSource = true; if (isTorch(cur) || isLantern(cur)) refresh = true; }
      if (w.lightSourceTemplateIndexLast !== cur.templateIndex) { w.lightSourceTemplateIndexLast = cur.templateIndex; if (isTorch(cur) || isLantern(cur)) refresh = true; }
    } else if (w.hasLightSource) { w.hasLightSource = false; w.lightSourceTemplateIndexLast = -1; }
    if (refresh) refreshSprite();
    const down = (action) => !!c.actionDown?.(action);
    const pressed = (action) => down(action) && !w.keysLast.has(action);
    const released = (action) => !down(action) && w.keysLast.has(action);
    if (pressed('TorchToggleLight')) toggleLightPress();
    if (pressed('TorchDrop')) { if (hasFreeHand()) dropLightSourceAction(light()); else say(MESSAGES.noFreeHand); }
    if (pressed('TorchThrow')) {
      if (contains('UselessItems2', T.Torch)) {
        if (!hasFreeHand()) say(MESSAGES.noFreeHand);
        else if (!(dropRefusal?.() ?? null)) {
          const lit = light();
          if (lit && !((w.s.lanternRelaxed || w.s.lanternsAtWaist) && isLantern(lit))) setLight(null);
        }
      } else say(MESSAGES.throwTorchless);
    }
    if (down('TorchThrow') && contains('UselessItems2', T.Torch) && hasFreeHand()) {
      w.throwTimer += dt * w.s.throwScale;
    }
    if (released('TorchThrow')) {
      if (hasFreeHand()) throwLightSourceAction(light(), clampStrength(w.throwTimer / w.throwTime)); else say(MESSAGES.noFreeHand);
      w.throwTimer = 0;
    }
    w.keysLast = new Set(['TorchToggleLight', 'TorchDrop', 'TorchThrow'].filter(down));
  }

  function lateUpdate(dt, c) {
    ctx = c;
    const l = light();
    w.position = [0, 0]; w.offset = [0, 0]; w.scale = [0, 0];
    w.attacking = !!c.machine && c.machine.state !== 'Idle';
    if (c.castPlaying || c.spellArmed) { if (!w.spellcasting) w.spellcasting = true; } else if (w.spellcasting) w.spellcasting = false;
    w.climbing = !!c.climbing; w.swimming = !!c.swimming;
    const m = c.motion ?? {};
    if (!l || w.offsetFrame < 0) {
      setSheathe();
      if (w.hasDroppedOrThrownLight) { w.positionCurrent = { ...w.positionTarget }; w.hasDroppedOrThrownLight = false; return; }
      if (w.s.lanternRelaxed && !hasFreeHand()) { w.positionCurrent = { ...w.positionTarget }; return; }
      const p = moveTowards2([w.positionCurrent.x, w.positionCurrent.y], [w.positionTarget.x, w.positionTarget.y], dt * offsetSpeedLive() * 3);
      w.positionCurrent = { x: p[0], y: p[1], w: w.positionTarget.w, h: w.positionTarget.h };
      return;
    }
    w.screenRect = { x: 0, y: 0, width: c.canvas?.width ?? NATIVE_W, height: c.canvas?.height ?? NATIVE_H };
    w.weaponOffsetHeight = weaponOffsetHeight();
    const rectChanged = !w.screenRectLast || w.screenRectLast.width !== w.screenRect.width || w.screenRectLast.height !== w.screenRect.height;
    if (rectChanged || w.weaponOffsetHeight !== w.weaponOffsetHeightLast) refreshSprite();
    w.screenRectLast = { ...w.screenRect }; w.weaponOffsetHeightLast = w.weaponOffsetHeight;
    if (w.s.lanternRelaxed && isLantern(l) && !hasFreeHand()) setSheathe();
    else if (w.attacking) { if (!w.attacked) { w.attacked = true; setAttack(); } }
    else if (w.attacked) { w.attacked = false; refreshSprite(); }
    const p = moveTowards2([w.positionCurrent.x, w.positionCurrent.y], [w.positionTarget.x, w.positionTarget.y], dt * offsetSpeedLive());
    w.positionCurrent = { x: p[0], y: p[1], w: w.positionTarget.w, h: w.positionTarget.h };
    const baseSpeed = Number.isFinite(m.baseSpeed) ? m.baseSpeed : 1;
    const speedRatio = Number.isFinite(m.speedRatio) ? m.speedRatio : 1;
    const atRest = w.positionCurrent.x === w.positionTarget.x && w.positionCurrent.y === w.positionTarget.y
      && w.positionCurrent.w === w.positionTarget.w && w.positionCurrent.h === w.positionTarget.h;
    if (w.s.bob && !w.attacking && atRest) {
      const shape = w.s.bobShape;
      const moveMul = m.grounded === false ? 0 : 1;
      w.moveSmooth = moveTowards(w.moveSmooth, moveMul, dt * w.s.moveSmoothSpeed);
      let s = speedRatio;
      if (m.crouching) s *= 0.5;
      if (m.riding) s *= 0.5;
      let reach = s;
      if (m.standing) { s = w.s.bobWhileIdle ? IDLE_BREATH.rate : 0; reach = w.s.bobWhileIdle ? IDLE_BREATH.size : 0; }
      const rate = baseSpeed * 1.25 * s * w.s.bobLength;
      const rate2 = rate * 2;
      const amp = 0.01;
      const size = [w.screenRect.width * amp * reach * w.s.bobSizeXMod, w.screenRect.height * amp * reach * w.s.bobSizeYMod];
      const xMin = w.flipped ? -1 : 1, yMax = 1;
      const target = [
        (xMin + Math.sin(w.s.bobOffset + w.time * rate)) * -size[0],
        (yMax - Math.sin(w.s.bobOffset + shape + w.time * rate2)) * size[1],
      ];
      const eased = moveTowards2(w.bobSmooth, target, dt * w.s.bobSmoothSpeed);
      w.bobSmooth = [eased[0] * w.moveSmooth, eased[1] * w.moveSmooth];
      w.position = [w.position[0] + w.bobSmooth[0], w.position[1] + w.bobSmooth[1]];
    } else if (w.s.bob) {
      // Out of rest the bob eases back, like the shield bob, so a swing never starts with a jump.
      w.bobSmooth = moveTowards2(w.bobSmooth, [0, 0], dt * w.s.bobSmoothSpeed);
      w.position = [w.position[0] + w.bobSmooth[0], w.position[1] + w.bobSmooth[1]];
    }
    if (w.s.inertia) {
      if (w.attacking || !atRest) {
        w.inertiaCurrent = [0, 0]; w.inertiaTarget = [0, 0]; w.inertiaForwardCurrent = [0, 0]; w.inertiaForwardTarget = [0, 0];
        return;
      }
      const lv = m.localVel ?? [0, 0, 0];
      const clamp1 = (v) => Math.max(-1, Math.min(1, v));
      const mx = clamp1(lv[0] / 10);
      const my = m.grounded === false ? clamp1(lv[1] / 10) : 0;
      const mz = clamp1(lv[2] / 10);
      const look = c.look ?? [0, 0];
      if (!c.cursorActive && c.swingHeld) w.inertiaTarget = [-mx * 0.5 * w.s.inertiaScale, 0];
      else w.inertiaTarget = [-(look[0] + mx) * 0.5 * w.s.inertiaScale, (look[1] + my) * 0.5 * w.s.inertiaScale];
      w.inertiaSpeedMod = w.s.inertiaScale > 0 ? Math.hypot(w.inertiaCurrent[0] - w.inertiaTarget[0], w.inertiaCurrent[1] - w.inertiaTarget[1]) / w.s.inertiaScale : 0;
      let speedMul = (w.inertiaTarget[0] !== 0 || w.inertiaTarget[1] !== 0) ? 3 : 1;
      w.inertiaCurrent = moveTowards2(w.inertiaCurrent, w.inertiaTarget, dt * w.s.inertiaSpeed * w.inertiaSpeedMod * speedMul);
      w.position = [w.position[0] + w.inertiaCurrent[0], w.position[1] + w.inertiaCurrent[1]];
      speedMul = (w.inertiaForwardTarget[0] !== 0 || w.inertiaForwardTarget[1] !== 0) ? 3 : 1;
      w.inertiaForwardTarget = [mz * w.s.inertiaForwardScale, mz * w.s.inertiaForwardScale];
      w.inertiaForwardCurrent = moveTowards2(w.inertiaForwardCurrent, w.inertiaForwardTarget, dt * w.s.inertiaForwardSpeed * speedMul);
      w.scale = [w.scale[0] + w.inertiaForwardCurrent[0], w.scale[1] + w.inertiaForwardCurrent[1]];
    }
  }

  function draw(renderer, canvas, tint = null) {
    if (!w.s.showSprite || !ctx || !renderer || !canvas) return false;
    if (ctx.thirdPerson || w.isInThirdPerson) return false;
    const held = light();
    if (!held || !(isTorch(held) || isLantern(held))) return false;
    if (atWaist(held)) return false;
    if (!w.currentTexture?.tex) return false;
    renderer.drawScreenQuad(w.currentTexture.tex, getSpriteRect(), w.curAnimRect, tint ?? undefined);
    return true;
  }

  function silence() { w.loop?.stop?.(); w.loop = null; }
  // Hosts call this for the rig they leave, so its burning loop stops; the next rig restarts it if the torch burns.
  function dispose() { offLight?.(); offLight = null; w.loop?.stop?.(); w.loop = null; if (lightOffsetSet) { setPlayerTorchOffsetOverride(null); lightOffsetSet = null; } if (_liveHandLaw === applyHandLaw) _liveHandLaw = null; }

  return {
    update, lateUpdate, draw, dispose, silence, receivePickedUp,
    toggleLightSourceAction, dropLightSourceAction, throwLightSourceAction, toggleLightPress,
    get hasFreeHand() { return hasFreeHand(); },
    get freeHand() { return getFreeHand(); },
    get flipped() { return w.flipped; },
    get rect() { return getSpriteRect(); },
    get positionTarget() { return { ...w.positionTarget }; },
    get positionCurrent() { return { ...w.positionCurrent }; },
    get settings() { return w.s; },
    get lastLightSource() { return w.lastLightSource; },
    get throwStrength() { return clampStrength(w.throwTimer / w.throwTime); },
    get burning() { return !!w.loop; },
    _w: w,
  };
}

async function defaultLoadSprite(record, frame) {
  if (!vendoredTexture(`${SPRITE_ARCHIVE}_${record}-${frame}.png`)) return null;
  const res = await fetch(spriteUrl(record, frame));
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  // A screen sprite keeps the PNG's row order; the world texture flip would draw the flame under the hand.
  return toScreenOrder(await decodePng(bytes));
}

// No host draws this arc, so ShowTrajectory is inert. Its gravity is 9.8 and the flight uses 9.81, as in the mod.
/**
 * @param {object} p
 * @returns {number[][]}
 */
export function throwArcPoints({
  origin, forward = [0, 0, 1], right = [1, 0, 0], freeHand = FREE_HAND.Right, strength = 1,
  throwAngle = 0, throwGravity = 1, throwStrength = 1, bodyStrength = 50, collider = null,
} = {}) {
  const side = freeHand === FREE_HAND.Right ? THROW_HAND_OFFSET : -THROW_HAND_OFFSET;
  let pos = [origin[0] + right[0] * side, origin[1] + right[1] * side, origin[2] + right[2] * side];
  const points = [pos];
  const dir = rotateAboutAxis(forward, right, -throwAngle);
  const speed = TRAJECTORY_SPEED * (bodyStrength / 100) * throwStrength * strength;
  const vel = [dir[0] * speed, dir[1] * speed, dir[2] * speed];
  let gravity = [0, 0, 0];
  for (let i = 0; i < TRAJECTORY_STEPS; i++) {
    gravity = [gravity[0], gravity[1] - TRAJECTORY_GRAVITY * (throwGravity * 0.05), gravity[2]];
    const step = [(vel[0] + gravity[0]) * TRAJECTORY_FIXED_DT, (vel[1] + gravity[1]) * TRAJECTORY_FIXED_DT, (vel[2] + gravity[2]) * TRAJECTORY_FIXED_DT];
    const len = Math.hypot(step[0], step[1], step[2]) || 1;
    const d = collider?.raycast?.(pos, [step[0] / len, step[1] / len, step[2] / len], len);
    if (Number.isFinite(d)) { points.push([pos[0] + step[0] / len * d, pos[1] + step[1] / len * d, pos[2] + step[2] / len * d]); break; }
    pos = [pos[0] + step[0], pos[1] + step[1], pos[2] + step[2]];
    points.push(pos);
  }
  return points;
}

export function rotateAboutAxis(v, axis, deg) {
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const k = [axis[0] / len, axis[1] / len, axis[2] / len];
  const t = deg * Math.PI / 180, ct = Math.cos(t), st = Math.sin(t);
  const dot = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cross = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return [
    v[0] * ct + cross[0] * st + k[0] * dot * (1 - ct),
    v[1] * ct + cross[1] * st + k[1] * dot * (1 - ct),
    v[2] * ct + cross[2] * st + k[2] * dot * (1 - ct),
  ];
}

export { isLightSource };
