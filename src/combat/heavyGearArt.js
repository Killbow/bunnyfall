import { WEAPON_TYPES, BOW_ANIMS, ALIGN, getWeaponAnims } from './fpsWeapon.js';
import { decodePng } from '../render/textureReplacement.js';
import { toScreenOrder } from '../formats/color32Order.js';
import { APP_ROOT } from '../platform/appRoot.js';

export const BALLISTA_STRIP = Object.freeze({ file: 'art/bunnyfall-ballista/ballista-frames.png', cells: 5 });
export const GRAPPLE_STRIP = Object.freeze({ file: 'art/bunnyfall-grapple/grapple-frames.png', cells: 7 });
// Maps the bow machine's seven frames (0 idle, 1 to 2 drawing, 3 hold, 4 to 6 loosed) onto ballista strip cells.
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

function cropImage(img, box) {
  const out = new Uint8ClampedArray(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const src = ((y + box.y) * img.width + box.x) * 4;
    for (let k = 0; k < box.w * 4; k++) out[y * box.w * 4 + k] = img.data[src + k];
  }
  return { width: box.w, height: box.h, data: out };
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
  // The hook never runs the bow machine: grappleFrame picks its frame, so every anim shows record 0.
  const anims = getWeaponAnims(WEAPON_TYPES.Dagger).map((a) => Object.freeze({ ...a, Record: 0, Alignment: ALIGN.Right, Offset: 0 }));
  return { weaponType: WEAPON_TYPES.Dagger, anims, records: [{ width, height, frames: tex }] };
}
