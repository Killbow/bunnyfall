// Reproduces the Cromwark settlement revision from local classic data.
// Run: node tools/cromwarkSettlementPlan.mjs --arena2 <path> [--write] [--report <json>].
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MapsFile, longitudeLatitudeToMapPixel } from '../src/formats/mapsFile.js';
import { wildMaskOf, wildInside, wildRingAt } from '../src/world/wildZone.js';

export const CIVILIAN_TYPES = new Set([0, 1, 2, 3, 5, 6, 8, 9, 11]);
export const CROMWARK_HAMLET_ID = 505449455;

export function chooseCromwarkSettlements(locations) {
  const candidates = locations.filter((l) => l.inside && CIVILIAN_TYPES.has(l.type));
  const kept = new Set();
  for (const type of CIVILIAN_TYPES) {
    const pool = candidates.filter((l) => l.type === type).sort((a, b) => a.mapId - b.mapId);
    if (!pool.length) continue;
    const chosen = pool.filter((l) => l.mapId === CROMWARK_HAMLET_ID);
    if (!chosen.length) chosen.push(pool[0]);
    const target = Math.max(chosen.length, Math.round(pool.length / 3));
    while (chosen.length < target) {
      let best = null, bestDistance = -1;
      for (const l of pool) {
        if (chosen.includes(l)) continue;
        const distance = Math.min(...chosen.map((p) => (p.x - l.x) ** 2 + (p.y - l.y) ** 2));
        if (distance > bestDistance) { best = l; bestDistance = distance; }
      }
      chosen.push(best);
    }
    for (const l of chosen) kept.add(l.mapId);
  }
  return { kept: candidates.filter((l) => kept.has(l.mapId)), removed: candidates.filter((l) => !kept.has(l.mapId)) };
}

export function settlementInventory(maps) {
  const mask = wildMaskOf(maps), locations = [];
  for (let r = 0; r < maps.regionCount; r++) {
    const region = maps.getRegion(r);
    if (!region) continue;
    for (let i = 0; i < region.mapTable.length; i++) {
      const row = region.mapTable[i], p = longitudeLatitudeToMapPixel(row.longitude, row.latitude);
      locations.push({ name: region.mapNames[i], mapId: row.mapId, type: row.locationType, region: r,
        index: i, x: p.x, y: p.y, inside: wildInside(mask, p.x, p.y), ring: wildRingAt(p.x, p.y, mask) });
    }
  }
  return locations;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => process.argv[process.argv.indexOf(k) + 1];
  if (!process.argv.includes('--arena2')) throw new Error('--arena2 is required');
  const maps = new MapsFile();
  maps.load(...['MAPS.BSA', 'CLIMATE.PAK', 'POLITIC.PAK'].map((n) => new Uint8Array(readFileSync(resolve(arg('--arena2'), n)))));
  const locations = settlementInventory(maps), plan = chooseCromwarkSettlements(locations);
  if (process.argv.includes('--write')) {
    const path = new URL('../src/world/wild/cromwarkSettlements.js', import.meta.url);
    const source = readFileSync(path, 'utf8');
    const ids = plan.removed.map((l) => l.mapId).sort((a, b) => a - b);
    const rows = Array.from({ length: Math.ceil(ids.length / 8) }, (_, i) => `  ${ids.slice(i * 8, i * 8 + 8).join(', ')},`);
    writeFileSync(path, source.replace(/Object\.freeze\(\[[\s\S]*?\]\)/, `Object.freeze([\n${rows.join('\n')}\n])`));
  }
  if (process.argv.includes('--report')) writeFileSync(arg('--report'), JSON.stringify({ ...plan, unchanged: locations.filter((l) => l.inside && !CIVILIAN_TYPES.has(l.type)) }, null, 2));
  console.log(JSON.stringify({ before: plan.kept.length + plan.removed.length, kept: plan.kept.length, removed: plan.removed.length,
    byType: [...CIVILIAN_TYPES].map((type) => ({ type, before: locations.filter((l) => l.inside && l.type === type).length, after: plan.kept.filter((l) => l.type === type).length })) }, null, 2));
}
