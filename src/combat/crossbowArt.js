import { WEAPON_TYPES, BOW_ANIMS, ALIGN } from './fpsWeapon.js';
import { decodePng } from '../render/textureReplacement.js';
import { toScreenOrder } from '../formats/color32Order.js';
import { APP_ROOT } from '../platform/appRoot.js';

const FILES = Object.freeze({ idle: 'art/crossbow-idle.png', draw: 'art/crossbow-draw.png', loaded: 'art/crossbow-loaded.png' });
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
