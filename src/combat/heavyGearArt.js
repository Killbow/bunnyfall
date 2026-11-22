// BUNNYFALL: THE ROYAL BALLISTA'S AND THE GRAPPLING HOOK'S FIRST-PERSON ART - the owner's own animations, cut into strips
// of frames (public/art/bunnyfall-ballista/ballista-frames.png, five 200x130 cells; public/art/bunnyfall-grapple/
// grapple-frames.png, seven 125x105 cells; the owner's originals beside them under owner/). Same shape crossbowArt.js
// answers, which is loadFpsWeaponArt's.
//
// THE BALLISTA rides the bow's machine (seven frames: 0 idle, 1-2 drawing, 3 the hold, 4-6 loosed). The owner's five are
// the loaded engine, the bolt leaving, the bolt gone and two of the recoil, laid across them: loaded until the loose,
// then the bolt away and the recoil.
//
// THE HOOK never runs the machine: its frame is its own (combat/grapple/grapple.js grappleFrame - the rest, the wind-up,
// the throw with the rope leaving, the recovery), so every one of its anims is the one record holding all seven.

import { WEAPON_TYPES, BOW_ANIMS, ALIGN, getWeaponAnims } from './fpsWeapon.js';
import { decodePng } from '../render/textureReplacement.js';
import { toScreenOrder } from '../formats/color32Order.js';
import { cropImage } from './pistolStrip.js';
import { APP_ROOT } from '../platform/appRoot.js';

export const BALLISTA_STRIP = Object.freeze({ file: 'art/bunnyfall-ballista/ballista-frames.png', cells: 5 });
export const GRAPPLE_STRIP = Object.freeze({ file: 'art/bunnyfall-grapple/grapple-frames.png', cells: 7 });
/** The bow machine's seven frames, as cells of the ballista's strip. */
export const BALLISTA_FRAME_MAP = Object.freeze([0, 0, 0, 0, 1, 2, 3]);
export const BALLISTA_ANIMS = Object.freeze(BOW_ANIMS.map((a) => Object.freeze({ ...a, Alignment: ALIGN.Center, Offset: 0 })));

const url = (file) => new URL(file, APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/').href;

async function cells(renderer, strip, key, { fetchBytes = null, decode = decodePng } = {}) {
  const bytes = fetchBytes ? await fetchBytes(strip.file) : await (async () => {
    const r = await fetch(url(strip.file));
    if (!r.ok) throw new Error(`${strip.file}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  })();
  const img = await decode(bytes);
  const w = Math.floor(img.width / strip.cells), h = img.height;
  const tex = [];
  for (let i = 0; i < strip.cells; i++) tex.push(renderer.uploadTexture('img', `${key}:${i}`, toScreenOrder(cropImage(img, { x: i * w, y: 0, w, h }))));
  return { tex, width: w, height: h };
}

export async function loadBallistaArt(renderer, opts = {}) {
  const { tex, width, height } = await cells(renderer, BALLISTA_STRIP, 'ballista', opts);
  return {
    weaponType: WEAPON_TYPES.Bow,
    anims: BALLISTA_ANIMS,
    records: [{ width, height, frames: BALLISTA_FRAME_MAP.map((i) => tex[i]) }],
  };
}

export async function loadGrappleArt(renderer, opts = {}) {
  const { tex, width, height } = await cells(renderer, GRAPPLE_STRIP, 'grapple', opts);
  // every state shows record 0 at the right of the screen, still - the frame is the hook's own clock's
  const anims = getWeaponAnims(WEAPON_TYPES.Dagger).map((a) => Object.freeze({ ...a, Record: 0, Alignment: ALIGN.Right, Offset: 0 }));
  return { weaponType: WEAPON_TYPES.Dagger, anims, records: [{ width, height, frames: tex }] };
}
