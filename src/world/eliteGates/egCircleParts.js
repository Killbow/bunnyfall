// @ts-check
// Imports pure modules only (no ui/, scenes/, or render/), because the swap worker has no DOM. It uses the same
// builders as the main-thread stand, so both produce the same level.
import { buildEgCircleModel, egCircleColliderTris, egCircleLights, egGateParts } from './egHall.js';
import { egCircleSpecs, egSpecGive } from '../../net/eliteGates/egLaw.js';
import { egBandArt } from './egBandArt.js';
import { buildEgRuinParts } from './egRuin.js';
import { buildEgVista } from './egVista.js';

export const egCircleKey = (seed, c, geo = 0) => `${seed >>> 0}:${c}:${geo || 0}`;
export function egCircleGates(seed, c, geo = 0) {
  const out = [];
  for (const spec of egCircleSpecs(seed, c, geo)) { const p = egGateParts(spec); if (p) out.push({ h: spec.h, model: p.model, tris: p.tris }); }
  return out;
}
/**
 * @param {number} seed
 * @param {number} c
 * @param {number} [geo]
 */
export function egCircleParts(seed, c, geo = 0) {
  return { key: egCircleKey(seed, c, geo), model: buildEgCircleModel(seed, c, geo), tris: egCircleColliderTris(seed, c, geo), lamps: egCircleLights(seed, c, geo), gates: egCircleGates(seed, c, geo) };
}
/**
 * Applies `given` specs before anything is laid, so the worker builds the circle of a breach whose halls came from
 * its room.
 * @param {{ seed: number, c: number, geo?: number, band?: number, given?: any[] | null, lite?: boolean }} m
 */
export function egCircleBuild(m) {
  for (const s of Array.isArray(m.given) ? m.given : []) egSpecGive(s);
  const geo = m.geo ?? 0, band = Number.isInteger(m.band) && m.band >= 0 && m.band <= 3 ? m.band : -1;
  const lite = !!m.lite;
  return { ...egCircleParts(m.seed, m.c, geo), specs: egCircleSpecs(m.seed, m.c, geo), art: band >= 0 ? egBandArt(band) : null, ruins: buildEgRuinParts(m.seed, m.c, geo, { lite }), vista: band >= 0 ? buildEgVista(band, { lite }) : null };
}
export function egCirclePartsTransfers(parts) {
  const out = new Set();
  const take = (a) => { if (ArrayBuffer.isView(a) && a.buffer instanceof ArrayBuffer) out.add(a.buffer); };
  const model = (m) => { for (const v of Object.values(m ?? {})) take(v); };
  model(parts?.model); take(parts?.tris);
  for (const g of parts?.gates ?? []) { model(g.model); take(g.tris); }
  for (const [, art] of parts?.art ?? []) { take(art?.albedo?.colors); take(art?.emission?.colors); }
  for (const r of parts?.ruins ?? []) model(r.model);
  for (const w of parts?.vista?.wings ?? []) model(w.model);
  model(parts?.vista?.under?.model);
  return [...out];
}
