// Classic first-person weapon art, ported from DFU FPSWeapon.cs, WeaponBasics.cs, and ConvertItemToAPIWeaponType.
// The swing state machine lives in weaponStates.js; this module maps (state, frame) to CIF art and draws it.
import { poseStrikeRect } from './abilities/strikeMotion.js';

import { CifRciFile } from '../formats/cifRciFile.js';
import { getInt } from '../platform/settings.js';
import { getPref } from '../ui/uiPrefs.js';
import { isEnchanted } from '../items/inventory.js';
import { WEAPONS, WEAPON_MATERIALS, weaponDyeColor } from '../characters/weapons.js';
import { atlasFileName } from './diverseWeapons.js';
import { customWeaponImage } from './diverseWeaponsAssets.js';
import { MATERIAL_NAMES } from '../items/itemInfo.js';
import { customItemClass } from '../mods/rriItems.js';
import { CROSSBOW_TEMPLATE } from '../characters/crossbowIds.js';
import { BALLISTA_TEMPLATE, GRAPPLE_TEMPLATE } from '../characters/heavyGearIds.js';
import { applyDyeToIndex, DYE_TARGETS } from '../characters/dyes.js';

export const WEAPON_TYPES = Object.freeze({
  None: -1,
  LongBlade: 0, LongBlade_Magic: 1,
  Staff: 2, Staff_Magic: 3,
  Dagger: 4, Dagger_Magic: 5,
  Mace: 6, Mace_Magic: 7,
  Flail: 8, Flail_Magic: 9,
  Warhammer: 10, Warhammer_Magic: 11,
  Battleaxe: 12, Battleaxe_Magic: 13,
  Bow: 14, Melee: 15, Werecreature: 16,
});

export const WEAPON_FILE = Object.freeze({
  [WEAPON_TYPES.LongBlade]: 'WEAPON04.CIF', [WEAPON_TYPES.LongBlade_Magic]: 'WEAPO104.CIF',
  [WEAPON_TYPES.Staff]: 'WEAPON01.CIF', [WEAPON_TYPES.Staff_Magic]: 'WEAPO101.CIF',
  [WEAPON_TYPES.Dagger]: 'WEAPON02.CIF', [WEAPON_TYPES.Dagger_Magic]: 'WEAPO102.CIF',
  [WEAPON_TYPES.Mace]: 'WEAPON05.CIF', [WEAPON_TYPES.Mace_Magic]: 'WEAPO105.CIF',
  [WEAPON_TYPES.Flail]: 'WEAPON06.CIF', [WEAPON_TYPES.Flail_Magic]: 'WEAPO106.CIF',
  [WEAPON_TYPES.Warhammer]: 'WEAPON07.CIF', [WEAPON_TYPES.Warhammer_Magic]: 'WEAPO107.CIF',
  [WEAPON_TYPES.Battleaxe]: 'WEAPON08.CIF', [WEAPON_TYPES.Battleaxe_Magic]: 'WEAPO108.CIF',
  [WEAPON_TYPES.Bow]: 'WEAPON09.CIF',
  [WEAPON_TYPES.Melee]: 'WEAPON10.CIF',
  [WEAPON_TYPES.Werecreature]: 'WEAPON11.CIF',
});

export { ALIGN } from './weaponAlign.js';
import { ALIGN } from './weaponAlign.js';

import { NATIVE_W, NATIVE_H } from '../ui/nativePanel.js';
import { weaponOffsetHeight } from '../ui/hudLarge.js';
import { pageParam } from '../platform/pageQuery.js';

export { NATIVE_W, NATIVE_H };

// WeaponStates order is the index into every anim table; MagicBattleAxe shuffles records, so rows carry Record.
export const STATE_INDEX = Object.freeze({
  Idle: 0, StrikeDown: 1, StrikeDownLeft: 2, StrikeLeft: 3,
  StrikeRight: 4, StrikeDownRight: 5, StrikeUp: 6,
});

const IDLE_FPS = 10, STRIKE_FPS = 10, WERE_FPS = 20, BOW_FPS = 10;

const A = (Record, NumFrames, FramePerSecond, Alignment, Offset) =>
  Object.freeze({ Record, NumFrames, FramePerSecond, Alignment, Offset });

export const MELEE_ANIMS = Object.freeze([
  A(0, 1, IDLE_FPS, ALIGN.Right, 0.15),
  A(1, 5, STRIKE_FPS, ALIGN.Center, 0),
  A(2, 5, STRIKE_FPS, ALIGN.Center, 0),
  A(3, 5, STRIKE_FPS, ALIGN.Center, 0),
  A(4, 5, STRIKE_FPS, ALIGN.Center, 0),
  A(5, 5, STRIKE_FPS, ALIGN.Center, 0),
  A(6, 5, STRIKE_FPS, ALIGN.Center, 0),
]);
export const GENERAL_ANIMS = Object.freeze([
  A(0, 1, IDLE_FPS, ALIGN.Right, 0),
  A(1, 5, STRIKE_FPS, ALIGN.Right, 0),
  A(2, 5, STRIKE_FPS, ALIGN.Right, 0),
  A(3, 5, STRIKE_FPS, ALIGN.Right, 0),
  A(4, 5, STRIKE_FPS, ALIGN.Left, 0),
  A(5, 5, STRIKE_FPS, ALIGN.Left, 0),
  A(6, 5, STRIKE_FPS, ALIGN.Right, 0),
]);
export const DAGGER_ANIMS = Object.freeze([
  A(0, 1, IDLE_FPS, ALIGN.Right, 0.04),
  A(1, 5, STRIKE_FPS, ALIGN.Right, 0),
  A(2, 5, STRIKE_FPS, ALIGN.Right, 0),
  A(3, 5, STRIKE_FPS, ALIGN.Right, 0),
  A(4, 5, STRIKE_FPS, ALIGN.Left, 0),
  A(5, 5, STRIKE_FPS, ALIGN.Left, 0),
  A(6, 5, STRIKE_FPS, ALIGN.Right, 0),
]);
export const STAFF_ANIMS = Object.freeze([
  A(0, 1, IDLE_FPS, ALIGN.Right, 0.02),
  A(1, 5, STRIKE_FPS, ALIGN.Right, 0),
  A(2, 5, STRIKE_FPS, ALIGN.Right, 0),
  A(3, 5, STRIKE_FPS, ALIGN.Center, 0),
  A(4, 5, STRIKE_FPS, ALIGN.Center, 0),
  A(5, 5, STRIKE_FPS, ALIGN.Left, 0),
  A(6, 5, STRIKE_FPS, ALIGN.Right, 0),
]);
export const MAGIC_BATTLEAXE_ANIMS = Object.freeze([
  A(0, 1, IDLE_FPS, ALIGN.Right, 0),
  A(1, 5, STRIKE_FPS, ALIGN.Right, 0),
  A(2, 5, STRIKE_FPS, ALIGN.Right, 0),
  A(4, 5, STRIKE_FPS, ALIGN.Right, 0),
  A(5, 5, STRIKE_FPS, ALIGN.Left, 0),
  A(3, 5, STRIKE_FPS, ALIGN.Left, 0),
  A(6, 5, STRIKE_FPS, ALIGN.Right, 0),
]);
export const BOW_ANIMS = Object.freeze([
  A(0, 1, BOW_FPS, ALIGN.Right, 0),
  A(0, 7, BOW_FPS, ALIGN.Right, 0),
  A(0, 7, BOW_FPS, ALIGN.Right, 0),
  A(0, 7, BOW_FPS, ALIGN.Right, 0),
  A(0, 7, BOW_FPS, ALIGN.Right, 0),
  A(0, 7, BOW_FPS, ALIGN.Right, 0),
  A(0, 4, BOW_FPS, ALIGN.Right, 0),
]);
export const WERECREATURE_ANIMS = Object.freeze([
  A(0, 1, IDLE_FPS, ALIGN.Center, 0.02),
  A(1, 5, WERE_FPS, ALIGN.Right, 0.2),
  A(2, 5, WERE_FPS, ALIGN.Right, 0),
  A(3, 5, WERE_FPS, ALIGN.Right, 0),
  A(4, 5, WERE_FPS, ALIGN.Right, 0),
  A(5, 5, WERE_FPS, ALIGN.Left, 0),
  A(6, 5, WERE_FPS, ALIGN.Left, 0.2),
]);

export function getWeaponAnims(weaponType) {
  const T = WEAPON_TYPES;
  if (weaponType === T.Melee) return MELEE_ANIMS;
  if (weaponType === T.Dagger || weaponType === T.Dagger_Magic) return DAGGER_ANIMS;
  if (weaponType === T.Staff || weaponType === T.Staff_Magic) return STAFF_ANIMS;
  if (weaponType === T.Battleaxe_Magic) return MAGIC_BATTLEAXE_ANIMS;
  if (weaponType === T.Bow) return BOW_ANIMS;
  if (weaponType === T.Werecreature) return WERECREATURE_ANIMS;
  return GENERAL_ANIMS;
}

// The plain set a magic type swings while its element glow shows, so the outline never covers WEAPO1xx art.
export function plainWeaponType(type) {
  const T = WEAPON_TYPES;
  switch (type) {
    case T.LongBlade_Magic: return T.LongBlade;
    case T.Staff_Magic: return T.Staff;
    case T.Dagger_Magic: return T.Dagger;
    case T.Mace_Magic: return T.Mace;
    case T.Flail_Magic: return T.Flail;
    case T.Warhammer_Magic: return T.Warhammer;
    case T.Battleaxe_Magic: return T.Battleaxe;
    default: return type;
  }
}

export function weaponTypeForItem(item) {
  const W = WEAPONS, T = WEAPON_TYPES;
  if (!item) return T.Melee;
  if (item.werecreatureClaws) return T.Werecreature;
  // The game's own weapons go before the switch so the switch stays exactly ConvertItemToAPIWeaponType.
  if (item.templateIndex === CROSSBOW_TEMPLATE) return T.Bow;
  if (item.templateIndex === BALLISTA_TEMPLATE) return T.Bow;
  if (item.templateIndex === GRAPPLE_TEMPLATE) return T.Dagger;
  const cls = customItemClass(item.templateIndex);
  if (cls?.weaponType) return T[cls.weaponType(isEnchanted(item))];
  let result;
  switch (item.templateIndex) {
    case W.Dagger: result = T.Dagger; break;
    case W.Staff: result = T.Staff; break;
    case W.Tanto: case W.Shortsword: case W.Wakazashi: case W.Broadsword:
    case W.Saber: case W.Longsword: case W.Katana: case W.Claymore:
    case W.Dai_Katana: result = T.LongBlade; break;
    case W.Mace: result = T.Mace; break;
    case W.Flail: result = T.Flail; break;
    case W.Warhammer: result = T.Warhammer; break;
    case W.Battle_Axe: case W.War_Axe: result = T.Battleaxe; break;
    case W.Short_Bow: case W.Long_Bow: result = T.Bow; break;
    default: return T.None;
  }
  if (isEnchanted(item)) {
    switch (result) {
      case T.Dagger: result = T.Dagger_Magic; break;
      case T.Staff: result = T.Staff_Magic; break;
      case T.LongBlade: result = T.LongBlade_Magic; break;
      case T.Mace: result = T.Mace_Magic; break;
      case T.Flail: result = T.Flail_Magic; break;
      case T.Warhammer: result = T.Warhammer_Magic; break;
      case T.Battleaxe: result = T.Battleaxe_Magic; break;
      default: break;
    }
  }
  return result;
}

// Index 0 is transparent. There is no Unchanged short-circuit: DFU's dye 18 means both Unchanged and Silver, and
// ChangeDye routes it to the silver table. Callers skip the dye for Steel and None.
export function frameToColor32(bmp, palette, dye) {
  const colors = new Uint32Array(bmp.width * bmp.height);
  const u8 = new Uint8Array(colors.buffer);
  for (let i = 0; i < bmp.data.length; i++) {
    let idx = bmp.data[i];
    if (idx === 0) continue;
    if (dye != null) idx = applyDyeToIndex(idx, dye, DYE_TARGETS.WeaponsAndArmor);
    const c = palette.get(idx);
    const o = i * 4;
    u8[o] = c.r; u8[o + 1] = c.g; u8[o + 2] = c.b; u8[o + 3] = 255;
  }
  return { width: bmp.width, height: bmp.height, colors };
}

export async function loadFpsWeaponArt(getBytes, palette, renderer, weaponType, material = WEAPON_MATERIALS.Iron, item = null, { customImage = customWeaponImage, plain = false } = {}) {
  const fileName = WEAPON_FILE[weaponType];
  if (!fileName) return null;
  const cif = new CifRciFile();
  cif.load(await getBytes(fileName), fileName, palette);
  // Steel is the files' default color, so it takes no dye (FPSWeapon.GetWeaponTexture2D).
  const dye = material === WEAPON_MATERIALS.Steel ? null : weaponDyeColor(material);
  const askName = atlasFileName(item, fileName, undefined, plain ? false : undefined);
  const metal = material != null && material !== WEAPON_MATERIALS.None ? MATERIAL_NAMES[material] : null;
  // Every frame request goes out in one batch because each is a fetch here.
  const customs = await customFrames(askName, metal, cif, customImage);
  const records = [];
  for (let r = 0; r < cif.recordCount; r++) {
    const size = cif.getSize(r);
    const frames = [];
    for (let f = 0; f < cif.getFrameCount(r); f++) {
      const name = frameName(askName, r, f, metal);
      // A custom frame replaces only this frame; the record keeps the classic width and height.
      const custom = customs[r][f];
      const c32 = custom ?? frameToColor32(cif.getDFBitmap(r, f), palette, dye);
      frames.push(renderer.uploadTexture('img', custom ? `fpw:${name}` : `fpw:${fileName}:${material}:${r}:${f}`, c32));
    }
    records.push({ width: size.width, height: size.height, frames });
  }
  return { weaponType, anims: getWeaponAnims(weaponType), records };
}

// TextureReplacement's GetNameCifRci spelling, <FILE>_<record>-<frame>[_<Metal>], which mod files are named by.
export const frameName = (askName, record, frame, metal) => `${askName}_${record}-${frame}${metal ? `_${metal}` : ''}`;

export async function customFrames(askName, metal, shape, ask = customWeaponImage) {
  const asks = [];
  const customs = [];
  for (let r = 0; r < shape.recordCount; r++) {
    const row = [];
    for (let f = 0; f < shape.getFrameCount(r); f++) {
      const name = frameName(askName, r, f, metal);
      row.push(null);
      asks.push(Promise.resolve(ask(name)).then((img) => { row[f] = img ?? null; }, () => { row[f] = null; }));
    }
    customs.push(row);
  }
  await Promise.all(asks);
  return customs;
}

// Only the hand-symmetric states mirror; a left or right strike keeps its side.
export const FLIP_STATES = Object.freeze(['Idle', 'StrikeDown', 'StrikeUp']);

export function fpLightingOn(search = globalThis.location?.search ?? '') {
  return !!getPref('firstPersonLighting') && pageParam('fplight', search) !== 'off';
}

export function drawFpsWeapon(renderer, canvas, art, state, frame, {
  flipHorizontal = getInt('Controls', 'Handedness', 0, 3) === 1,
  offsetHeight = weaponOffsetHeight(),
  tint = null,
  glow = null, pose = null,
} = {}) {
  const q = fpsWeaponQuad(canvas, art, state, frame, { flipHorizontal, offsetHeight });
  if (!q) return;
  const { tex, uv: src, rec } = q;
  const { x, y, w, h } = poseStrikeRect(q.rect, pose, canvas.height, flipHorizontal);
  renderer.drawScreenQuad(tex, { x, y, w, h }, src, tint ?? undefined);
  if (glow) renderer.drawScreenQuadGlow?.(tex, { x, y, w, h }, src, glow, { art: [rec.width, rec.height], view: [canvas.width, canvas.height] });
}

// twoHands.js places the second hand of a pair with this same arithmetic, then mirrors it.
export function fpsWeaponQuad(canvas, art, state, frame, {
  flipHorizontal = getInt('Controls', 'Handedness', 0, 3) === 1,
  offsetHeight = weaponOffsetHeight(),
} = {}) {
  if (!art) return null;
  const flip = flipHorizontal && FLIP_STATES.includes(state);
  const stateIdx = STATE_INDEX[state] ?? 0;
  const anim = art.anims[stateIdx];
  const recordIdx = art.weaponType === WEAPON_TYPES.Bow ? 0 : anim.Record;
  const rec = art.records[recordIdx];
  if (!rec) return null;
  const f = Math.min(frame, rec.frames.length - 1);
  const tex = rec.frames[f];
  const scaleX = canvas.width / NATIVE_W;
  const scaleY = canvas.height / NATIVE_H;
  const w = rec.width * scaleX;
  const h = rec.height * scaleY;
  let x;
  // As in DFU, a flip turns AlignRight into AlignLeft but leaves AlignLeft as it is.
  const alignment = (flip && anim.Alignment === ALIGN.Right) ? ALIGN.Left : anim.Alignment;
  if (alignment === ALIGN.Left) x = canvas.width * anim.Offset;
  else if (alignment === ALIGN.Center) x = canvas.width / 2 - w / 2;
  else x = canvas.width * (1 - anim.Offset) - w;
  const y = canvas.height - h - offsetHeight;
  const src = flip ? { u0: 1, v0: 0, u1: 0, v1: 1 } : undefined;
  return { tex, rect: { x, y, w, h }, uv: src, rec };
}
