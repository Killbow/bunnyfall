// @ts-check
import { portraitRenderer } from '../render/portraitRenderer.js';
import { EQUIP_SLOTS, equipTableOf } from './equip.js';
import { drawnPiece } from '../net/appearanceLaw.js';
import { shownEquipTable } from './lookHidden.js';
import { getPref } from '../ui/uiPrefs.js';

export const HEAD_RECORD = Object.freeze({ w: 32, h: 34, scale: 3 });

let _data = null;
export function _setHeadDataForTests(ds) { _data = ds; }
export function headDataStamp() {
  if (!_data) {
    import('../scenes/dataSource.js').then((m) => { _data = m; }).catch(() => {});
    return 0;
  }
  return _data.morrowindDataCount() > 0 ? _data.morrowindDataGeneration() : 0;
}
/**
 * @param {any} entity
 */
export function playerHeadKey(entity) {
  const stamp = headDataStamp();
  if (!stamp) return '0';
  const helm = drawnPiece(entity?.equip ? shownEquipTable(equipTableOf(entity))?.[EQUIP_SLOTS.Head] ?? null : null);
  return `${stamp}|${helm ? `${helm.templateIndex}/${helm.material ?? 0}/${getPref('mwSteelHelm')}/${getPref('mwBeastHelm')}` : '-'}`;
}

async function dataAttached() {
  const { morrowindDataCount } = _data ?? await import('../scenes/dataSource.js');
  return morrowindDataCount() > 0;
}

/**
 * @param {{ race?: string, gender?: string, faceIndex?: number, equip?: any, npc?: boolean }} who
 * @param {{ px?: number, ph?: number, renderer?: any }} [opts]
 */
export async function playerHeadImage(who, { px = 128, ph = px, renderer = portraitRenderer() } = {}) {
  if (!who || !renderer || !(await dataAttached())) return null;
  const [{ headPortrait }, { mwRaceId }] = await Promise.all([import('../combat/fpArm.js'), import('../formats/mwNpc.js')]);
  if (who.equip) {
    const [{ armBuildOptsOf }, { liveLycanthropy }] = await Promise.all([import('../combat/weaponRig.js'), import('../afflictions/lycanthropy.js')]);
    if (liveLycanthropy(who)?.isTransformed && !armBuildOptsOf(who).werewolf) return null;
    const o = armBuildOptsOf(who);
    return headPortrait({ renderer, race: o.race, female: o.female, faceIndex: o.faceIndex, armor: o.armor, vampire: o.vampire, werewolf: o.werewolf, skin: o.skin, ownHeads: o.ownHeads, px, ph });
  }
  return headPortrait({
    renderer, race: mwRaceId(who.race ?? 'Breton'), female: who.gender === 'female',
    faceIndex: Number.isInteger(who.faceIndex) ? who.faceIndex : 0, ownHeads: !who.npc, px, ph,
  });
}

/**
 * @param {any} look
 * @param {{ px?: number, ph?: number, renderer?: any }} [opts]
 */
export async function npcHeadImage(look, { px = 128, ph = px, renderer = portraitRenderer() } = {}) {
  if (!look || look.creature || !renderer) return null;
  const { npcBodiesOn } = await import('./npcBodies.js');
  if (!npcBodiesOn()) return null;
  const [{ headPortrait }, { peerBuildOpts }] = await Promise.all([import('../combat/fpArm.js'), import('../net/peerBodies.js')]);
  const o = /** @type {any} */ (peerBuildOpts(look));
  if (!o || o.creature || o.werewolf || !o.race) return null;
  return headPortrait({ renderer, race: o.race, female: !!o.female, faceIndex: o.faceIndex | 0, npcFace: o.npcFace ?? null, vampire: !!o.vampire, armor: o.armor ?? null, px, ph });
}

/**
 * @param {{ race?: string, gender?: string, face?: number, common?: number, resident?: string, kin?: boolean }} pose
 * @param {{ px?: number, ph?: number, renderer?: any }} [opts]
 */
export async function poseHeadImage(pose, opts = {}) {
  if (!pose) return null;
  if (Number.isInteger(pose.common) && /** @type {number} */ (pose.common) >= 0) {
    if (!pose.resident) return null;
    const [{ npcHint }, { textSeed }] = await Promise.all([import('./wardrobe.js'), import('../systems/livingWorld/seed.js')]);
    return npcHeadImage(residentHeadLook(pose, npcHint, textSeed), opts);
  }
  return playerHeadImage({ race: pose.race, gender: pose.gender, faceIndex: pose.face, npc: !!pose.kin }, opts);
}
/**
 * @param {{ race?: string, gender?: string, resident?: string }} pose
 * @param {(seed: number, tier: number) => any} npcHint
 * @param {(s: string) => number} textSeed
 */
export const residentHeadLook = (pose, npcHint, textSeed) => ({
  race: pose.race ?? 'Breton', gender: pose.gender === 'female' ? 'female' : 'male', faceIndex: 0, items: [],
  npc: npcHint(textSeed(String(pose.resident)), 0),
});

/**
 * @param {{ width: number, height: number, data: Uint8Array|Uint8ClampedArray }} img
 * @param {{ w?: number, h?: number, doc?: Document }} [opts]
 */
export function headCanvas(img, { w = 0, h = 0, doc = globalThis.document } = {}) {
  if (!img || !doc) return null;
  const src = doc.createElement('canvas');
  src.width = img.width; src.height = img.height;
  const sctx = src.getContext('2d');
  if (!sctx) return null;
  const rgba = new Uint8ClampedArray(img.width * img.height * 4);
  rgba.set(img.data);
  sctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
  if (!(w > 0 && h > 0)) return src;
  const out = doc.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return src;
  const s = Math.min(w / img.width, h / img.height);
  const dw = Math.round(img.width * s), dh = Math.round(img.height * s);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
  return out;
}
