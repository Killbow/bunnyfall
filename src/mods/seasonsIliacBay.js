// Seasons of the Iliac Bay 1.1 (RosyTheRascal): SeasonHelper ported from its IL.

import { SEASONS } from '../world/gameDate.js';
import { scaledBillboardSize } from '../world/rmbFlats.js';

export const SEASONS_MOD = Object.freeze({
  vendor: 'seasons-iliac-bay',
  title: 'Seasons of the Iliac Bay',
  version: '1.1',
  author: 'RosyTheRascal',
  guid: '25064a75-7e50-40b0-9d08-e2c3418f0940',
});

export const NO_INSTALLED_SEASON = -1;

export const BILLBOARD_SCALE = Math.fround(3.1);

export function managedArchivesForSeason(season) {
  if (season === SEASONS.Fall || season === SEASONS.Spring) return [504, 506, 508, 510];
  if (season === SEASONS.Winter) return [505, 507, 509];
  return [];
}

export function archivePrefix(season, archive) {
  if (season === SEASONS.Winter) {
    if (archive === 505) return 'K';
    if (archive === 507) return 'F';
    if (archive === 509) return 'C';
    return null;
  }
  if (season === SEASONS.Fall) {
    if (archive === 504) return 'I';
    if (archive === 506) return 'D';
    if (archive === 508) return 'A';
    if (archive === 510) return 'G';
    return null;
  }
  if (season === SEASONS.Spring) {
    if (archive === 504) return 'J';
    if (archive === 506) return 'E';
    if (archive === 508) return 'B';
    if (archive === 510) return 'H';
    return null;
  }
  return null;
}

export const PREFIX_FOLDER = Object.freeze({
  A: 'HauntedF', B: 'HauntedS', C: 'HauntedW',
  D: 'HillsF', E: 'HillsS', F: 'HillsW',
  G: 'MountainF', H: 'MountainsS',
  I: 'TempF', J: 'TempS', K: 'TempW',
});

const baseName = (p) => String(p).slice(Math.max(String(p).lastIndexOf('/'), String(p).lastIndexOf('\\')) + 1);
const withoutExtension = (b) => { const d = b.lastIndexOf('.'); return d > 0 ? b.slice(0, d) : b; };
const startsWithIgnoreCase = (s, prefix) => s.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase();

const DOTNET_WHITE = /^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g;
export function parseRecordFromFilename(fileName, prefix) {
  const stem = withoutExtension(baseName(fileName));
  if (!startsWithIgnoreCase(stem, prefix)) return -1;
  const rest = stem.slice(prefix.length).replace(DOTNET_WHITE, '');
  if (!/^[+-]?\d+$/.test(rest)) return -1;
  const n = Number(rest);
  if (n > 2147483647 || n < -2147483648) return -1;
  return n;
}

export function filesForPrefix(fileNames, prefix) {
  const out = [];
  for (const f of fileNames ?? []) {
    const base = baseName(f);
    if (startsWithIgnoreCase(withoutExtension(base), prefix)) out.push(f);
  }
  return out;
}

export function seasonalRecordSet(prefix, archive, recordCount, textures) {
  if (!textures || !textures.length) {
    return { ok: false, reason: `SeasonHelper: No textures found for prefix '${prefix}' and TEXTURE.${String(archive).padStart(3, '0')}.` };
  }
  const byRecord = new Map();
  for (const t of textures) {
    const rec = parseRecordFromFilename(t.name, prefix);
    if (rec >= 0) byRecord.set(rec, t);
  }
  if (recordCount < 2) {
    return { ok: false, reason: `SeasonHelper: TEXTURE.${String(archive).padStart(3, '0')} has invalid record metadata.` };
  }
  for (let r = 1; r < recordCount; r++) {
    if (!byRecord.has(r)) {
      return { ok: false, reason: `SeasonHelper: Missing ${prefix}${r}.png for TEXTURE.${String(archive).padStart(3, '0')}. Atlas replacement was skipped so stock billboard batching remains valid.` };
    }
  }
  const records = new Array(recordCount);
  records[0] = byRecord.get(1);
  for (let r = 1; r < recordCount; r++) records[r] = byRecord.get(r);
  return { ok: true, records };
}

export function seasonalBillboardSize(width, height) {
  return scaledBillboardSize(
    { width: Math.fround(width * BILLBOARD_SCALE), height: Math.fround(height * BILLBOARD_SCALE) },
    { width: 0, height: 0 },
  );
}

export const atlasKey = (season, archive) => `${season}:${archive}`;

export class SeasonHelper {
  constructor(deps) {
    this.deps = deps;
    this.installedSeason = NO_INSTALLED_SEASON;
    this.vanillaAtlasByArchive = new Set();
    this.seasonalAtlasByKey = new Map();
    this.cache = new Map();
    this.refreshNatureBatchesAfterTravel = false;
    this._refreshAfterLoad = false;
    this._applying = null;
    this.generation = 0;
  }

  async apply(force = false) {
    if (this._applying) await this._applying;
    const run = (async () => {
      const season = this.deps.currentSeason();
      if (force) this.installedSeason = NO_INSTALLED_SEASON;
      if (season === this.installedSeason) return false;
      await this.ensureSeasonalAtlasesInstalled(season);
      this.deps.refresh?.();
      return true;
    })();
    this._applying = run;
    try { return await run; } finally { if (this._applying === run) this._applying = null; }
  }

  async ensureSeasonalAtlasesInstalled(season) {
    if (season === this.installedSeason) return;
    this.cache.clear();
    this.installedSeason = season;
    this.generation++;
    for (const archive of managedArchivesForSeason(season)) {
      const prefix = archivePrefix(season, archive);
      if (!prefix) continue;
      const key = atlasKey(season, archive);
      let atlas;
      if (this.seasonalAtlasByKey.has(key)) {
        atlas = this.seasonalAtlasByKey.get(key);
      } else {
        atlas = await this.tryBuildSeasonalAtlas(archive, prefix);
        if (atlas) this.seasonalAtlasByKey.set(key, atlas);
      }
      if (!atlas) continue;
      this.cache.set(archive, atlas.records);
    }
  }

  async tryBuildSeasonalAtlas(archive, prefix) {
    let recordCount = 0;
    try { recordCount = await this.deps.recordCount(archive); } catch { recordCount = 0; }
    if (!(recordCount > 0)) {
      this.deps.warn?.(`SeasonHelper: Could not load the native atlas metadata for TEXTURE.${String(archive).padStart(3, '0')}.`);
      return null;
    }
    this.vanillaAtlasByArchive.add(archive);
    const textures = await this.deps.load(prefix);
    const set = seasonalRecordSet(prefix, archive, recordCount, textures);
    if (!set.ok) {
      this.deps.warn?.(set.reason);
      return null;
    }
    return { records: set.records };
  }

  lookup(archive, record) {
    const records = this.cache.get(archive);
    if (!records) return null;
    const t = records[record];
    if (!t) return null;
    return { texture: t, size: seasonalBillboardSize(t.width, t.height) };
  }

  manages(archive) { return this.vanillaAtlasByArchive.has(archive); }

  get installing() { return !!this._applying; }


  onTerrainInstantiated() { return this.apply(false); }
  onNewMonth() { return this.apply(false); }
  async onLoad() {
    await this.apply(true);
    this._refreshAfterLoad = true;
  }
  async onPostFastTravel() {
    await this.apply(true);
    this.refreshNatureBatchesAfterTravel = true;
  }
  onUpdateTerrainsEnd() {
    if (!this.refreshNatureBatchesAfterTravel) return false;
    this.refreshNatureBatchesAfterTravel = false;
    this.deps.refresh?.();
    return true;
  }
  tick() {
    if (!this._refreshAfterLoad) return null;
    this._refreshAfterLoad = false;
    return this.apply(false);
  }
}
