// @ts-check
import { SHIP_PAINTS, tintPicture } from './shipLivery.js';
import { classicPictureOf } from '../../formats/derivedTexture.js';
import { toColor32 } from '../../formats/color32Order.js';
import { dfLook, lookSeed } from '../../world/dfLook.js';

export const CABIN_ARCHIVE = 38192;
export const CABIN_STAIN = 0.55;

const _records = new Map();
let _next = 0;

/** @param {number} paint */
export function cabinRestyle(paint) {
  const rgb = SHIP_PAINTS[paint]?.rgb;
  if (!rgb) return null;
  return async (texRemap, lists, { renderer, getTexture, palette }) => {
    if (!renderer?.uploadTexture) return;
    const seen = new Set();
    for (const list of lists) for (const sm of list ?? []) {
      const own = `${sm.textureArchive}_${sm.textureRecord}`;
      if (seen.has(own)) continue;
      seen.add(own);
      const key = texRemap.get(own) ?? own;
      // Glass and window pictures stay as built, so the windows still light.
      if (renderer.windowMasks?.has?.(key) || renderer.glassMasks?.has?.(key)) continue;
      const [archive, record] = key.split('_').map(Number);
      const k = `${key}|${paint}`;
      let rec = _records.get(k);
      if (rec == null || !renderer.heldTexture?.(CABIN_ARCHIVE, rec, { opaque: true })) {
        const pic = await classicPictureOf(getTexture, palette, archive, record);
        if (!pic) continue;
        if (rec == null) { rec = _next++; _records.set(k, rec); }
        renderer.uploadTexture(CABIN_ARCHIVE, rec, toColor32(dfLook(tintPicture(pic, rgb, CABIN_STAIN), lookSeed(archive, record))), { opaque: true });
      }
      texRemap.set(own, `${CABIN_ARCHIVE}_${rec}`);
    }
  };
}
