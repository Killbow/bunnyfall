// BUNNYFALL: THE CROSSBOW'S FIRST-PERSON ART. Three owner frames (public/art/crossbow-*.png, 189x94): the slack string,
// the string drawn with the bolt's tip showing, and the bolt loaded. The crossbow rides the BOW's machine (a draw that
// holds, a loose, a cooldown), whose record is seven frames, so the three are laid across them:
//   0 idle (slack)   1-2 drawing   3 loaded (the hold frame)   4-6 loosed, the string slack again
// Same shape loadFpsWeaponArt answers, with the bow's anim table moved to the screen's middle (the art is symmetric).

import { WEAPON_TYPES, BOW_ANIMS, ALIGN } from './fpsWeapon.js';
import { decodePng } from '../systems/textureReplacement.js';
import { toScreenOrder } from '../formats/color32Order.js';
import { APP_ROOT } from '../systems/appRoot.js';

const FILES = Object.freeze({ idle: 'art/crossbow-idle.png', draw: 'art/crossbow-draw.png', loaded: 'art/crossbow-loaded.png' });
/** The seven bow frames, as indices into [idle, draw, loaded]. */
export const CROSSBOW_FRAME_MAP = Object.freeze([0, 1, 1, 2, 0, 0, 0]);
export const CROSSBOW_ANIMS = Object.freeze(BOW_ANIMS.map((a) => Object.freeze({ ...a, Alignment: ALIGN.Center, Offset: 0 })));

const url = (file) => new URL(file, APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/').href;

export async function loadCrossbowArt(renderer, { fetchBytes = null, decode = decodePng } = {}) {
  const get = fetchBytes ?? (async (file) => {
    const r = await fetch(url(file));
    if (!r.ok) throw new Error(`${file}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  });
  const imgs = await Promise.all([FILES.idle, FILES.draw, FILES.loaded].map(async (f) => decode(await get(f))));
  const tex = imgs.map((rgba, i) => renderer.uploadTexture('img', `crossbow:${i}`, toScreenOrder(rgba)));
  const { width, height } = imgs[0];
  return {
    weaponType: WEAPON_TYPES.Bow,
    anims: CROSSBOW_ANIMS,
    records: [{ width, height, frames: CROSSBOW_FRAME_MAP.map((i) => tex[i]) }],
  };
}
