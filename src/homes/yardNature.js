// @ts-check

import { getNatureArchive } from '../world/climateSwaps.js';
import { isNatureArchive } from '../world/rmbFlats.js';
import { floraSwayOf } from '../weather/windDrive.js';
import { windfallResponse } from '../weather/windfall.js';
import { archivePrefix } from '../mods/seasonsIliacBay.js';
import { decorFlatMirrored } from '../net/decorLaw.js';
import { LPT_SCALE_MAX, LPT_SET_FLOATS } from '../world/lowPolyTrees.js';
import { naturePicture } from '../world/naturePicture.js';

export const isNaturePiece = (piece) => piece?.model == null && Array.isArray(piece?.flat) && isNatureArchive(piece.flat[0]) && !piece.item;

export const yardNatureFlat = (flat, season) => [getNatureArchive(flat[0], season), flat[1]];

/** Degrees to radians, the same way round as decorMatrix: BB_VS turns a tree as mat4.js trs turns a model. */
export const yardTreeYaw = (piece) => (Number(piece?.rot?.[0]) || 0) * (Math.PI / 180);

/** @param {{ handle: any, pos: number[], scale: number, yaw: number }[]} trees */
export function yardTreeSet(trees) {
  const handles = [], centers = [];
  const out = new Float32Array(trees.length * LPT_SET_FLOATS);
  trees.forEach((t, k) => {
    let h = handles.indexOf(t.handle);
    if (h < 0) { h = handles.length; handles.push(t.handle); }
    out.set([h, t.pos[0], t.pos[1], t.pos[2], t.scale, t.yaw], k * LPT_SET_FLOATS);
    centers.push(t.pos);
  });
  return { handles, trees: out, centers };
}

export function createYardNature({ renderer, getTexture, uploadRecord, seasonal = () => null, trees = null }) {
  /**
   * @param {number[]} flat
   * @param {number} season
   * @param {number|null} [natureArchive]
   */
  async function picture(flat, season, natureArchive = null) {
    const [archive, record] = yardNatureFlat(flat, season);
    const t = await getTexture?.(archive);
    if (!t || !(record < t.recordCount)) return null;
    // Same choice as town pixels (naturePicture): Low Poly Trees, then the season picture, then the record.
    const door = trees?.door ?? null;
    const seasons = seasonal?.() ?? null;
    const pic = await naturePicture({ door, seasons, renderer, uploadRecord }, t, archive, record);
    const sway = floraSwayOf(archive, natureArchive ?? archive, pic.plain.h);
    const windfall = windfallResponse(archive, record, pic.sib && !pic.far && seasons ? archivePrefix(seasons.installedSeason, archive) : null);
    const far = pic.far;
    if (far) {
      door.acquire(far);
      trees?.sway?.(pic.proto, sway);
      trees?.windfall?.(pic.proto, windfall);
      let held = true;
      const release = () => { if (held) { held = false; door.release(far); } };
      return { archive, key: pic.key, size: { w: far.size.w / LPT_SCALE_MAX, h: far.size.h / LPT_SCALE_MAX }, sway, windfall, handle: far, mirrors: false, release };
    }
    return { archive, key: pic.key, size: pic.size, sway, windfall, handle: null, mirrors: true, release: () => {} };
  }

  /**
   * @param {any} piece
   * @param {number[]} at
   * @param {{ season: number, natureArchive?: number|null, live?: () => boolean }} where
   */
  async function stand(piece, at, { season, natureArchive = null, live = () => true }) {
    if (!isNaturePiece(piece) || !renderer?.createBillboardBatch) return null;
    const pic = await picture(piece.flat, season, natureArchive);
    if (!pic) return null;
    if (!live()) { pic.release(); return null; }
    const size = { w: pic.size.w * piece.scale, h: pic.size.h * piece.scale };
    const where = [[at[0] + piece.pos[0], at[1] + piece.pos[1], at[2] + piece.pos[2]]];
    if (pic.handle) {
      const batch = renderer.createBillboardBatch(pic.archive, pic.key, pic.handle.size, where, { scales: [piece.scale / LPT_SCALE_MAX] });
      batch.lptProto = pic.handle;
      batch.sway = pic.sway;
      batch.windfall = pic.windfall;
      return { batch, size, release: pic.release, tree: { handle: pic.handle, pos: [...piece.pos], scale: piece.scale, yaw: yardTreeYaw(piece) } };
    }
    const drawn = decorFlatMirrored(piece) ? { w: -size.w, h: size.h } : size;
    const batch = renderer.createBillboardBatch(pic.archive, pic.key, drawn, where);
    batch.sway = pic.sway;
    batch.windfall = pic.windfall;
    return { batch, size, release: pic.release, tree: null };
  }
  return { picture, stand };
}
