// @ts-check

import { poiShelfProblems, POI_SHELF_VERSION, POI_LIMITS } from './poiLaw.js';
import { POI_V2_LIGHT_KEYS } from './poiLawV2.js';
import { newPart, lawName } from './poiEdit.js';
import { renderThumb, encodePng } from './poiThumb.js';

const shelfLight = (l) => { const c = structuredClone(l); for (const k of POI_V2_LIGHT_KEYS) delete c[k]; return c; };
export const shelfDropsOf = ({ parts = [], lights = [] }) => [...parts, ...lights].filter((o) => o && (o.group !== undefined || o.visible !== undefined || o.locked !== undefined)).length;

/**
 * @param {{ id: string, name: string, about?: string, tags?: string[], parts: any[], lights?: any[] }} o
 */
export function shelfEntryOf({ id, name, about = '', tags = [], parts, lights = [] }) {
  const scratch = { parts: [] };
  for (const p of parts) {
    const part = newPart(scratch, { mesh: p.mesh, submeshes: p.submeshes ?? p.materials?.length ?? 1, name: p.name ?? '', materials: p.materials ?? null, t: p.t ?? [0, 0, 0], r: p.r, s: p.s });
    if (p.collide) part.collide = p.collide;
    if (typeof p.shadow === 'boolean') part.shadow = p.shadow;
    scratch.parts.push(part);
  }
  const words = String(about ?? '').trim();
  const tagList = [...new Set(tags.map((tg) => lawName(tg, POI_LIMITS.tag)).filter(Boolean))].slice(0, POI_LIMITS.tags);
  return {
    v: POI_SHELF_VERSION, id, name: lawName(name), ...(words ? { about: words.slice(0, POI_LIMITS.about) } : {}), ...(tagList.length ? { tags: tagList } : {}),
    parts: scratch.parts, lights: lights.map(shelfLight), thumb: null,
  };
}

/**
 * @param {any} entry
 * @param {{ meshOf: (sha: string) => Promise<any>, pictureOf: (sha: string) => Promise<any> }} io
 */
export async function shelfThumb(entry, { meshOf, pictureOf }) {
  const pieces = [];
  const pictures = new Map();
  const picture = (sha) => { if (!pictures.has(sha)) pictures.set(sha, Promise.resolve().then(() => pictureOf(sha)).catch(() => null)); return pictures.get(sha); };
  for (const p of entry.parts) {
    const mesh = await meshOf(p.mesh);
    if (!mesh) continue;
    const materials = [];
    for (const m of p.materials) materials.push({ ...m, picture: m.texture ? await picture(m.texture) : null });
    pieces.push({ mesh, t: p.t, r: p.r, s: p.s, materials });
  }
  return encodePng(renderThumb(pieces));
}

/**
 * @param {any} entry
 * @param {{ meshOf: (sha: string) => Promise<any>, pictureOf: (sha: string) => Promise<any>,
 *   putAsset: (bytes: Uint8Array, kind: 'texture') => Promise<any>, shelve: (item: any) => Promise<any> }} io
 */
export async function putOnShelf(entry, { meshOf, pictureOf, putAsset, shelve }) {
  const item = { ...entry, thumb: null };
  const own = poiShelfProblems(item);
  if (own.length) return { ok: false, error: 'poi-doc', problems: own };
  let png = null;
  try { png = await shelfThumb(item, { meshOf, pictureOf }); } catch { png = null; }
  if (png) {
    const r = await putAsset(png, 'texture');
    if (!r.ok) return { ok: false, error: r.error };
    item.thumb = r.data.sha;
  }
  const s = await shelve(item);
  if (!s.ok) return { ok: false, error: s.error, ...(s.problems ? { problems: s.problems } : {}) };
  return { ok: true, id: s.data.id, item };
}
