// @ts-check
// A face's part is read from its original archive and record, before any climate swap. A chosen record that its
// archive lacks falls back to the town's remap.

import { applyClimate, isExteriorWindow } from './climateSwaps.js';
import { HOME_LOOK_CLIMATES, HOME_LOOK_SETS, HOME_LOOK_DOOR_KEPT, homeLookOf } from '../net/homeLaw.js';

export const HOME_LOOK_BUILD_WAIT_MS = 1_500;
export const HOME_LOOK_ROOFS = 69;
export const HOME_LOOK_DOORS = 74;
export const HOME_LOOK_WALL_FAMILIES = Object.freeze(new Set([9, 10, 12, 13, 14, 15, 26, 27, 35, 36, 38, 39, 42, 43, 58, 59, 61, 62, 64, 65]));

const HOME_LOOK_BASES = new Set(/** @type {number[]} */ (Object.values(HOME_LOOK_CLIMATES)));
export function homeLookPart(archive, record) {
  if (!Number.isSafeInteger(archive) || !Number.isSafeInteger(record) || archive < 0 || archive >= 500) return null;
  const family = archive % 100;
  // A family lives only at a climate base (0, 100, 300, 400): TEXTURE.2xx are flat archives, and 210 is not a
  // winter wall even though 210 % 100 is 10.
  if (!HOME_LOOK_BASES.has(archive - family)) return null;
  if (family === HOME_LOOK_ROOFS || family === HOME_LOOK_ROOFS + 1) return 'roof';
  if (family === HOME_LOOK_DOORS) return record === HOME_LOOK_DOOR_KEPT ? null : 'door';
  if (isExteriorWindow(archive, record)) return 'windows';
  if (HOME_LOOK_WALL_FAMILIES.has(family)) return 'walls';
  return null;
}

export function homeLookTarget(archive, record, look, season) {
  const part = homeLookPart(archive, record);
  const choice = part ? look?.[part] : null;
  if (!choice) return null;
  const base = HOME_LOOK_CLIMATES[choice.climate];
  if (base == null) return null;
  if (part === 'walls') return [applyClimate(HOME_LOOK_SETS[choice.set], record, base, season), record];
  if (part === 'windows') return [applyClimate(HOME_LOOK_SETS[choice.set], 3, base, season), 3];
  if (part === 'roof') return [applyClimate(HOME_LOOK_ROOFS, choice.record, base, season), choice.record];
  return [applyClimate(HOME_LOOK_DOORS, choice.record, base, season), choice.record];
}

/**
 * Returns a new Map unless `into` is given: the renderer caches a sub-mesh texture by the remap's identity, so a
 * changed look needs a new table.
 * @param {Array<{textureArchive: number, textureRecord: number}>|undefined} subMeshes
 * @param {Map<string, string>} base
 * @param {any} look
 * @param {number} season
 * @param {{ getTexture: (a: number) => Promise<any>, uploadRecord: (a: number, r: number, o?: any) => void }} deps
 * @param {Map<string, string>|null} [into]
 */
export async function homeLookRemap(subMeshes, base, look, season, { getTexture, uploadRecord }, into = null) {
  const out = into ?? new Map();
  const want = homeLookOf(look);
  for (const sm of subMeshes ?? []) {
    const key = `${sm.textureArchive}_${sm.textureRecord}`;
    if (out.has(key)) continue;
    const t = want ? homeLookTarget(sm.textureArchive, sm.textureRecord, want, season) : null;
    if (t) {
      let tex = null;
      try { tex = await getTexture(t[0]); } catch { tex = null; }
      if (tex && t[1] < tex.recordCount) {
        uploadRecord(t[0], t[1], { opaque: true });
        out.set(key, `${t[0]}_${t[1]}`);
        continue;
      }
    }
    const swapped = base?.get?.(key);
    if (swapped) out.set(key, swapped);
  }
  return out;
}

export async function homeLookRecords(part, climate, season, getTexture) {
  const base = HOME_LOOK_CLIMATES[climate];
  const family = part === 'roof' ? HOME_LOOK_ROOFS : part === 'door' ? HOME_LOOK_DOORS : null;
  if (family == null || base == null) return 0;
  try { return (await getTexture(applyClimate(family, 0, base, season)))?.recordCount ?? 0; } catch { return 0; }
}
export function homeLookSwatch(part, choice, season) {
  if (!choice) return null;
  const record = part === 'walls' ? 0 : part === 'windows' ? 3 : choice.record;
  const probe = part === 'roof' ? HOME_LOOK_ROOFS : part === 'door' ? HOME_LOOK_DOORS : HOME_LOOK_SETS[choice.set];
  if (probe == null) return null;
  const t = homeLookTarget(probe, part === 'windows' ? 3 : record, { [part]: choice }, season);
  return t ? { archive: t[0], record: t[1] } : null;
}
