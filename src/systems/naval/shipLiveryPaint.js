// @ts-check
import { LIVERY_ARCHIVE, SHIP_PAINTS, stainPicture, tintPicture, SAIL_TINT, liveryOfCode } from './shipLivery.js';
import { liveryArtOf } from '../../world/shipLiveryArt.js';
import { cutGlass } from '../../world/galleonArt.js';
import { dfLook, lookSeed } from '../../world/dfLook.js';
import { classicPictureOf } from '../../formats/derivedTexture.js';
import { toColor32 } from '../../formats/color32Order.js';

export const PLANK_ARCHIVE = 67;
export const CLASSIC_SAIL = Object.freeze([50, 7]);

/** @param {{ renderer: any, pipeline: any, portArchiveOf: (hull: number) => number | null, log?: any }} deps */
export function createLiveryPaint({ renderer, pipeline, portArchiveOf, log = console }) {
  const records = new Map();
  let next = 0;
  const made = new Map();
  const making = new Set();
  const joined = new WeakMap();

  function put(archive, record, code, tag, pic, opts = { opaque: true }, glow = null) {
    const k = `${archive}_${record}|${code}|${tag}`;
    let rec = records.get(k);
    if (rec == null) { rec = next++; records.set(k, rec); }
    renderer.uploadTexture(LIVERY_ARCHIVE, rec, toColor32(pic), opts);
    if (glow) renderer.uploadEmissionTexture?.(LIVERY_ARCHIVE, rec, toColor32(glow), { replacement: false });
    return `${LIVERY_ARCHIVE}_${rec}`;
  }
  const classic = (archive, record) => classicPictureOf((a) => pipeline.getTexture(a), pipeline.palette, archive, record);
  async function paint(hull, code) {
    const lv = liveryOfCode(code);
    const day = new Map(), night = new Map();
    if (!lv) return { day, night };
    const port = portArchiveOf(hull);
    if (port != null) {
      for (const { record, picture, glow, night: twin } of liveryArtOf(port, lv)) {
        const looked = dfLook(picture, lookSeed(port, record));
        const src = `${port}_${record}`;
        if (twin != null && glow) {
          day.set(src, put(port, record, code, 'd', cutGlass(looked, glow), { opaque: true, cutout: true }));
          night.set(src, put(port, record, code, 'n', looked, { opaque: true }, glow));
        } else {
          const key = put(port, record, code, 'd', looked);
          day.set(src, key); night.set(src, key);
        }
      }
    }
    const stain = SHIP_PAINTS[lv.stain]?.rgb;
    if (stain) {
      const t = await pipeline.getTexture(PLANK_ARCHIVE);
      const n = t && !t.vendor ? t.recordCount ?? 0 : 0;
      for (let r = 0; r < n; r++) {
        const pic = await classic(PLANK_ARCHIVE, r);
        if (!pic) continue;
        const key = put(PLANK_ARCHIVE, r, code, 'd', dfLook(stainPicture(pic, stain), lookSeed(PLANK_ARCHIVE, r)));
        day.set(`${PLANK_ARCHIVE}_${r}`, key); night.set(`${PLANK_ARCHIVE}_${r}`, key);
      }
    }
    const sail = SHIP_PAINTS[lv.sail]?.rgb;
    if (sail) {
      const pic = await classic(CLASSIC_SAIL[0], CLASSIC_SAIL[1]);
      if (pic) {
        const key = put(CLASSIC_SAIL[0], CLASSIC_SAIL[1], code, 'd', dfLook(tintPicture(pic, sail, SAIL_TINT), lookSeed(CLASSIC_SAIL[0], CLASSIC_SAIL[1])));
        day.set(`${CLASSIC_SAIL[0]}_${CLASSIC_SAIL[1]}`, key); night.set(`${CLASSIC_SAIL[0]}_${CLASSIC_SAIL[1]}`, key);
      }
    }
    return { day, night };
  }
  function mapsOf(hull, code) {
    // A livery code fits in four nibbles, so this number key is unique per hull and code.
    const key = hull * 0x10000 + code;
    if (made.has(key)) return made.get(key);
    if (!making.has(key) && renderer?.uploadTexture && pipeline?.getTexture) {
      making.add(key);
      paint(hull, code).then((m) => { made.set(key, m); }, (e) => { made.set(key, null); log?.warn?.('[livery] a ship\'s paint could not be made - she is drawn as built', e); })
        .finally(() => making.delete(key));
    }
    return null;
  }
  function remapOf(hull, code, night, base) {
    if (!code) return base;
    const m = mapsOf(hull, code);
    if (!m) return base;
    const own = night ? m.night : m.day;
    if (!own.size) return base;
    if (!base?.size) return own;
    // The renderer caches by remap identity, so each base and paint pair reuses one joined Map.
    let by = joined.get(base);
    if (!by) { by = new Map(); joined.set(base, by); }
    let j = by.get(own);
    if (!j) { j = new Map([...base, ...own]); by.set(own, j); ownOf.set(j, own); }
    return j;
  }
  const ownOf = new WeakMap();
  const touched = new WeakMap();
  // A shared model the paint does not touch keeps the host's base remap, so the renderer cache still hits.
  function remapFor(mesh, remap, base) {
    if (remap === base || !remap || !mesh?.subMeshes) return remap;
    const own = ownOf.get(remap) ?? remap;
    let by = touched.get(mesh);
    if (!by) { by = new WeakMap(); touched.set(mesh, by); }
    let v = by.get(own);
    if (v === undefined) { v = mesh.subMeshes.some((sm) => own.has(`${sm.textureArchive}_${sm.textureRecord}`)); by.set(own, v); }
    return v ? remap : base;
  }
  return { remapOf, remapFor, mapsOf, _records: records };
}
