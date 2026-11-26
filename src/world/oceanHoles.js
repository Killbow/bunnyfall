import { MOBILE_TYPES } from '../characters/mobileTypes.js';
import { ENEMY_BASICS, MOBILE_BEHAVIOUR } from '../characters/enemyBasics.js';
import { longitudeLatitudeToMapPixel, mapPixelToWorldCoord, getMapPixelID, WORLD_MAP_TILE_DIM, WORLD_MAP_RMB_DIM } from '../formats/mapsFile.js';
import { getLocationTerrainTileOrigin } from './terrainTiles.js';
import { TORCH_ARCHIVE, TORCH_RECORDS } from '../audio/soundClips.js';
import { scaledSliderValue } from './deepWaterLook.js';
import { colorLerp } from './mathf.js';
import { dice100 } from '../combat/formulas.js';
import { dropFoundMark } from '../items/foundMark.js';
import { clampArmorVariant } from '../items/armorMaterials.js';

const f32 = Math.fround;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const OCEAN_HOLES_VENDOR = 'ocean-holes';
export const DEEP_WATERS_GUID = 'f1e8a1b3-8a4f-4f4e-bb6e-3d3a8a1b3f1e';
export const PIT_ROOT_NAME = 'OceanHole_Pit';
export const PIT_PIXEL_FREQUENCY = 48;
export const MAX_FLOOR_WAIT_FRAMES = 600;
export const PIT_RESTORE_GRACE_FRAMES = 30;
export const MINIMUM_DEPTH = 70;
export const MINIMUM_EDGE_DISTANCE = 256;
export const FLOOR_FLATTEN_VARIANCE = 5;
export const SURFACE_OUTER_RADIUS = 20;
export const FLOOR_OUTER_RADIUS = 32;
export const FLOOR_BLACK_RADIUS = 9;
export const FLOOR_FLAT_RADIUS = 9;
export const FLOOR_PIT_DEPTH = 14;
export const SLIDER_MIDPOINT = 0.5;
export const PLACEMENT_SALT = 1213156421;
export const NAME_SALT = 1094867283;
export const TEMPLATE_SALT = 1146441287;
export const ENEMY_SALT = 1162759513;
export const MINIMUM_AQUATIC_ENEMY_FRACTION = f32(0.3);
export const ABYSS_MAGIC_LIGHT_SCALE = 0.5;
export const ABYSS_FOG_BLEND_AT_MIDPOINT = f32(0.85);
export const ABYSS_FOG_DENSITY_AT_MIDPOINT = 0.25;
export const SURFACE_MIASMA_NAME = 'Abyss Miasma';
export const SURFACE_MIASMA_MAX_PARTICLES = 72;
export const SURFACE_MIASMA_HEIGHT = 300;
export const SURFACE_MIASMA_LIFETIME = 30;
export const SURFACE_MIASMA_EMISSION_RATE = 2;
export const ABYSS_FOG_COLOR = Object.freeze([f32(0.012), f32(0.022), f32(0.026), 1]);
export const ABYSS_AMBIENT_LIGHT = Object.freeze([f32(0.05), f32(0.075), f32(0.11), 1]);
export const NAME_ADJECTIVES = Object.freeze(['Drowned', 'Soundless', 'Lightless', 'Salt-Black', 'Sunken', 'Fathomless', 'Deadwater', 'Whispering']);
export const NAME_NOUNS = Object.freeze(['Maw', 'Trench', 'Sepulchre', 'Hold', 'Vault', 'Chasm', 'Gullet', 'Abyss']);
export const NAME_ENDINGS = Object.freeze(['of Lost Sound', 'of the Last Tide', 'Below All Light', 'of Drowned Stars', 'of the Pale Current', 'of Black Salt', 'of the Sleepless Deep', 'Beneath the Keel']);
export const ENTRANCE_HALF_HEIGHT = f32(0.35) / 2;

export function stableHash(mapPixelX, mapPixelY, salt) {
  const num = Math.imul(mapPixelX, 73856093) ^ Math.imul(mapPixelY, 19349663) ^ (salt | 0);
  const num2 = Math.imul(num ^ (num >>> 16), 2146121005);
  const num3 = Math.imul(num2 ^ (num2 >>> 15), -2073254261);
  return ((num3 >>> 0) ^ (num3 >>> 16)) >>> 0;
}

export function isPitPixel(mapPixelX, mapPixelY, rate) {
  const num = stableHash(mapPixelX, mapPixelY, PLACEMENT_SALT);
  const num2 = 89478486;
  const num3 = (num % 48) * num2 + Math.floor(num / 48);
  const num4 = Math.trunc(f32(clamp01(f32(Number(rate) || 0))) * (2.0 * num2));
  return num3 < num4;
}

export function placementFraction(mapPixelX, mapPixelY, salt) {
  const h = stableHash(mapPixelX, mapPixelY, (PLACEMENT_SALT ^ salt) >>> 0) & 0xffff;
  return f32(f32(0.28) + f32(f32(f32(h) / 65535) * f32(0.44)));
}

export const getScaledSliderValue = scaledSliderValue;

export function getMidpointColor(sliderValue, low, midpoint, high) {
  const num = f32(clamp01(f32(sliderValue)));
  if (!(num <= 0.5)) return colorLerp(midpoint, high, f32(f32(num - 0.5) / 0.5));
  return colorLerp(low, midpoint, f32(num / 0.5));
}

export function getFloorPitDepth(distance, scale) {
  const num = f32(32 * scale);
  const num2 = f32(9 * scale);
  if (distance >= num) return 0;
  if (distance <= num2) return 14;
  let num3 = f32(1 - f32(f32(distance - num2) / f32(num - num2)));
  num3 = f32(f32(num3 * num3) * f32(3 - f32(2 * num3)));
  return f32(14 * num3);
}

/**
 * @param {ArrayLike<number>} positions
 * @param {{fractionX:number, fractionZ:number, sizeX:number, sizeZ:number, scale:number, allowFlatten:boolean}} o
 */
export function deformSeafloorVertices(positions, { fractionX, fractionZ, sizeX, sizeZ, scale, allowFlatten }) {
  if (!positions || positions.length < 3) return null;
  const n = Math.floor(positions.length / 3);
  const out = Array.from(positions);
  const num = f32(fractionX * sizeX);
  const num2 = f32(fractionZ * sizeZ);
  const num3 = f32(32 * scale);
  let num4 = 0;
  let num5 = 0;
  for (let i = 0; i < n; i++) {
    const num6 = f32(out[i * 3] - num);
    const num7 = f32(out[i * 3 + 2] - num2);
    if (!(f32(f32(num6 * num6) + f32(num7 * num7)) > f32(num3 * num3))) { num4 = f32(num4 + out[i * 3 + 1]); num5++; }
  }
  let num8 = 0;
  if (num5 > 0) {
    num4 = f32(num4 / num5);
    const num9 = f32(num3 * 2);
    for (let j = 0; j < n; j++) {
      const num10 = f32(out[j * 3] - num);
      const num11 = f32(out[j * 3 + 2] - num2);
      if (f32(f32(num10 * num10) + f32(num11 * num11)) <= f32(num9 * num9)) num8 = Math.max(num8, Math.abs(f32(out[j * 3 + 1] - num4)));
    }
  }
  const flattened = !!allowFlatten && num5 > 0 && num8 > 5;
  const num12 = Math.min(256, num, f32(sizeX - num), num2, f32(sizeZ - num2));
  const num13 = Math.min(Math.max(num3, f32(num8 * 2)), Math.max(0, f32(num12 - num3)));
  for (let k = 0; k < n; k++) {
    const num14 = f32(out[k * 3] - num);
    const num15 = f32(out[k * 3 + 2] - num2);
    const num16 = f32(Math.sqrt(f32(f32(num14 * num14) + f32(num15 * num15))));
    let y = f32(out[k * 3 + 1]);
    if (flattened && num16 < f32(num3 + num13)) {
      let num17 = num16 <= num3 ? 1 : f32(1 - f32(f32(num16 - num3) / num13));
      num17 = f32(f32(num17 * num17) * f32(3 - f32(2 * num17)));
      y = f32(y + f32(f32(num4 - y) * clamp01(num17)));
    }
    const floorPitDepth = getFloorPitDepth(num16, scale);
    if (!(floorPitDepth <= 0)) y = f32(y - floorPitDepth);
    out[k * 3 + 1] = y;
  }
  return { positions: out, flattened };
}

export function heightGridFromPositions(positions, grid, gridSize = 65) {
  const num = gridSize * gridSize;
  if (!grid || positions.length / 3 < num) return grid;
  for (let i = 0; i < num; i++) grid[i] = positions[i * 3 + 1];
  return grid;
}

export function raycastFloorY(floorY, surfaceY) {
  if (floorY == null || !Number.isFinite(floorY)) return null;
  const top = f32(surfaceY + 5);
  return floorY <= top && top - floorY <= 1000 ? floorY : null;
}

export function findPitOpeningY(floorYAt, worldX, worldZ, surfaceY, floorY, scale) {
  const num = f32(12 * scale);
  for (let i = 0; i < 16; i++) {
    const num2 = f32(f32(f32(Math.PI * 2) * i) / 16);
    const y = raycastFloorY(floorYAt(f32(worldX + f32(f32(Math.cos(num2)) * num)), f32(worldZ + f32(f32(Math.sin(num2)) * num))), surfaceY);
    if (y != null) floorY = Math.max(floorY, y);
  }
  return floorY;
}

export function buildDungeonName(mapPixelX, mapPixelY) {
  const num = stableHash(mapPixelX, mapPixelY, NAME_SALT);
  return `The ${NAME_ADJECTIVES[num % NAME_ADJECTIVES.length]} ${NAME_NOUNS[(num >>> 8) % NAME_NOUNS.length]} ${NAME_ENDINGS[(num >>> 16) % NAME_ENDINGS.length]}`;
}

export const buildGpsDungeonName = (dungeonName, pitMapX, pitMapY) => `${dungeonName} [${pitMapX},${pitMapY}]`;

export const getAbyssMapId = (pitMapX, pitMapY) => (0x60000000 | (getMapPixelID(pitMapX, pitMapY) & 0xfffff)) >>> 0;

export function isFlameEnemy(type) {
  return type === MOBILE_TYPES.FireDaedra || type === MOBILE_TYPES.FireAtronach || type === MOBILE_TYPES.Dragonling || type === MOBILE_TYPES.Dragonling_Alternate;
}

const BEHAVIOUR = MOBILE_BEHAVIOUR;
const TEAM_UNDEAD = 'Undead';
export function enemyRow(type) {
  const b = ENEMY_BASICS[type];
  return b ? { id: type, behaviour: BEHAVIOUR[b.behaviour] ?? 0, team: b.team, level: b.level ?? 0, noShadow: !!b.noShadow, glowColor: b.glowColor ?? null, lootTableKey: b.lootTableKey ?? null } : null;
}
export { MOBILE_BEHAVIOUR };

export function isEligibleUnderwaterReplacement(type, undeadOnly, aquaticOnly, rowOf = enemyRow) {
  if (isFlameEnemy(type)) return null;
  const candidate = rowOf(type);
  if (!candidate) return null;
  if (aquaticOnly) return candidate.behaviour === BEHAVIOUR.Aquatic ? candidate : null;
  if (!undeadOnly) return candidate;
  return candidate.team === TEAM_UNDEAD && type !== MOBILE_TYPES.VampireAncient && type !== MOBILE_TYPES.AncientLich ? candidate : null;
}

export function tryPickUnderwaterEnemy(hash, undeadOnly, aquaticOnly, roster, rowOf = enemyRow) {
  let num = 0;
  for (const t of roster) {
    const c = isEligibleUnderwaterReplacement(t, undeadOnly, aquaticOnly, rowOf);
    if (c) num += Math.max(1, c.level - 5);
  }
  if (num === 0) return null;
  let num2 = (hash >>> 0) % num;
  for (const t of roster) {
    const c = isEligibleUnderwaterReplacement(t, undeadOnly, aquaticOnly, rowOf);
    if (c) {
      num2 -= Math.max(1, c.level - 5);
      if (num2 < 0) return t;
    }
  }
  return null;
}

export function enemyHash(pitMapX, pitMapY, loadID) {
  const id = BigInt.asUintN(64, BigInt(loadID));
  const lo = Number(BigInt.asIntN(32, id));
  const hi = Number(BigInt.asIntN(32, id >> 32n));
  return stableHash(pitMapX ^ lo, pitMapY ^ hi, ENEMY_SALT);
}

export function isDungeonLightFixture(archive, record) {
  if (archive === TORCH_ARCHIVE && TORCH_RECORDS.has(record)) return true;
  if (archive === 210) return (record >= 7 && record <= 13) || (record >= 22 && record <= 27);
  return false;
}

export function nextArmorMaterial(current) {
  switch (current) {
    case 0: return 256;
    case 256: case 259: return 512;
    case 512: case 513: case 514: case 515: case 516: case 517: case 518: case 519: case 520: return current + 1;
    default: return current;
  }
}

/**
 * @param {number} chance
 * @param {object[]} items
 * @param {() => ?object} createMagicItem
 * @param {() => number} [rolls]
 */
export function addBonusMagicLoot(chance, items, createMagicItem, rolls = Math.random) {
  if (chance <= 0 || !items) return 0;
  let num = 0;
  let num2 = f32(chance);
  while (dice100(Math.trunc(num2), rolls())) {
    const it = createMagicItem();
    if (it) { items.push(it); num++; }
    num2 = f32(num2 * f32(0.5));
  }
  return num;
}

/**
 * @param {object[]} items
 * @param {{remintWeapon: (templateIndex: number, material: number) => object, remintArmor: (templateIndex: number, material: number, variant: number) => object, isCustom?: (item: object) => boolean, isEnchanted: (item: object) => boolean}} mint
 */
export function upgradeLoot(items, { remintWeapon, remintArmor, isCustom = () => false, isEnchanted }) {
  if (!items) return;
  for (const item of items) {
    if (!item || isCustom(item) || item.questItem || item.artifact) continue;
    const enchanted = isEnchanted(item);
    const kept = { name: item.name, value: item.value, currentCondition: item.currentCondition, maxCondition: item.maxCondition, flags: item.flags, isIdentified: item.isIdentified };
    let fresh = null;
    if (item.group === 'Weapons') {
      const num = Math.max(0, Math.min(9, item.material ?? 0));
      if (num < 9) fresh = remintWeapon(item.templateIndex, num + 1);
    } else if (item.group === 'Armor') {
      const next = nextArmorMaterial(item.material ?? 0);
      if (next !== (item.material ?? 0)) fresh = remintArmor(item.templateIndex, next, clampArmorVariant(item.templateIndex, item.material ?? 0, item.variant ?? 0));
    }
    if (!fresh) continue;
    Object.assign(item, fresh, { flags: 0, stackCount: 1 });
    delete item.isIdentified;
    if (enchanted) for (const [k, v] of Object.entries(kept)) { if (v === undefined) delete item[k]; else item[k] = v; }
    if (!enchanted) dropFoundMark(item);
  }
}

export function getLocationRect(location) {
  const mt = location.mapTableData ?? {};
  const mapPixel = longitudeLatitudeToMapPixel(mt.longitude, mt.latitude);
  const worldOrigin = mapPixelToWorldCoord(mapPixel.x, mapPixel.y);
  const tileOrigin = getLocationTerrainTileOrigin(location);
  const x = worldOrigin.x + (tileOrigin.x * 2) * WORLD_MAP_TILE_DIM;
  const y = worldOrigin.y + (tileOrigin.y * 2) * WORLD_MAP_TILE_DIM;
  const width = location.exterior.exteriorData.width * WORLD_MAP_RMB_DIM;
  const height = location.exterior.exteriorData.height * WORLD_MAP_RMB_DIM;
  return { xMin: x, xMax: x + width, yMin: y, yMax: y + height };
}

export function tryGetTemplateSavePosition(location) {
  const mt = location.mapTableData ?? {};
  const val = longitudeLatitudeToMapPixel(mt.longitude, mt.latitude);
  const val2 = mapPixelToWorldCoord(val.x, val.y);
  const num = 32704;
  const corners = [[64, 64], [num, 64], [64, num], [num, num]];
  const rect = getLocationRect(location);
  for (const [dx, dy] of corners) {
    const num2 = val2.x + dx, num3 = val2.y + dy;
    if (num2 < rect.xMin - 4096 || num2 > rect.xMax + 4096 || num3 < rect.yMin - 4096 || num3 > rect.yMax + 4096) return { x: num2, y: num3 };
  }
  return null;
}

export const SUITABLE_TEMPLATE_DUNGEON_TYPES = Object.freeze(new Set([0, 4, 5, 6, 8, 9, 11]));
export const PREFERRED_TEMPLATE_DUNGEON_TYPE = 6;

export function isSuitableTemplate(location, isMainStoryDungeon) {
  if (!location || !location.loaded || !location.hasDungeon) return false;
  const blocks = location.dungeon?.blocks;
  if (!blocks || blocks.length < 2 || isMainStoryDungeon(location.mapTableData?.mapId)) return false;
  return SUITABLE_TEMPLATE_DUNGEON_TYPES.has(location.mapTableData?.dungeonType);
}

/**
 * @param {{regionCount:number, locationCount:(r:number)=>number, location:(r:number, i:number)=>object}} maps
 * @param {(mapId:number)=>number} siteLinkCount
 */
export function tryFindTemplate(mapPixelX, mapPixelY, maps, siteLinkCount, isMainStoryDungeon) {
  const regionCount = maps.regionCount;
  if (regionCount <= 0) return null;
  const num = stableHash(mapPixelX, mapPixelY, TEMPLATE_SALT);
  const num2 = num % regionCount;
  let fallback = null;
  for (let i = 0; i < regionCount; i++) {
    const num3 = (num2 + i) % regionCount;
    const locationCount = maps.locationCount(num3);
    if (locationCount === 0) continue;
    const num4 = (num >>> 8) % locationCount;
    for (let j = 0; j < locationCount; j++) {
      const num5 = (num4 + j) % locationCount;
      const location = maps.location(num3, num5);
      if (!isSuitableTemplate(location, isMainStoryDungeon)) continue;
      const savePosition = tryGetTemplateSavePosition(location);
      if (!savePosition) continue;
      if (siteLinkCount(location.mapTableData.mapId) === 0) {
        if (location.mapTableData.dungeonType === PREFERRED_TEMPLATE_DUNGEON_TYPE) return { template: location, savePosition };
        if (!fallback) fallback = { template: location, savePosition };
      }
    }
  }
  return fallback;
}

export function cloneDungeon(template, dungeonName) {
  return { ...template, name: dungeonName, dungeon: { ...template.dungeon, blocks: template.dungeon.blocks.map((b) => ({ ...b })) } };
}

export function abyssWaterLevel(startY, maxMeshTopY, dungeonY) {
  const y = f32(startY);
  const top = Math.max(f32(y + 3), maxMeshTopY);
  const v = f32(f32(-f32(Math.max(f32(y + 2.5), f32(top + 1)) - dungeonY)) / f32(0.025));
  const f = Math.floor(v);
  const r = v - f === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(v);
  return Math.max(-32767, Math.min(32766, r));
}

export const oceanSurfaceWorldY = (terrainY, oceanLocalY) => f32(terrainY + oceanLocalY);

export function createDiscMesh() {
  const positions = new Float32Array(49 * 3);
  const normals = new Float32Array(49 * 3);
  normals[1] = 1;
  for (let i = 0; i < 48; i++) {
    const num = f32(f32(f32(Math.PI * 2) * i) / 48);
    positions[(i + 1) * 3] = f32(Math.cos(num));
    positions[(i + 1) * 3 + 2] = f32(Math.sin(num));
    normals[(i + 1) * 3 + 1] = 1;
  }
  const indices = new Uint16Array(288);
  for (let j = 0; j < 48; j++) {
    const num2 = j + 1;
    const num3 = ((j + 1) % 48) + 1;
    const num4 = j * 6;
    indices[num4] = 0; indices[num4 + 1] = num3; indices[num4 + 2] = num2;
    indices[num4 + 3] = 0; indices[num4 + 4] = num2; indices[num4 + 5] = num3;
  }
  return { positions, normals, indices };
}

export function createMiasmaTexture() {
  const px = new Uint8Array(32 * 32 * 4);
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < 32; j++) {
      const num = f32(f32(f32(f32(j + 0.5) / 32) * 2) - 1);
      const num2 = f32(f32(f32(f32(i + 0.5) / 32) * 2) - 1);
      const num3 = clamp01(f32(1 - f32(Math.sqrt(f32(f32(num * num) + f32(num2 * num2))))));
      const num4 = f32(0.85 + f32(0.15 * f32(Math.sin(f32(f32(num * 9) + f32(num2 * 7))))));
      const num5 = f32(f32(num3 * num3) * num4);
      const o = (i * 32 + j) * 4;
      px[o] = 255; px[o + 1] = 255; px[o + 2] = 255;
      px[o + 3] = Math.round(clamp01(num5) * 255);
    }
  }
  return { width: 32, height: 32, pixels: px };
}

export const SURFACE_INNER_COLOR = Object.freeze([2 / 255, 15 / 255, 46 / 255, 1]);
export const SURFACE_INNER_QUEUE = 3001;
export const SURFACE_UNDERSIDE_QUEUE = 2001;
export const FLOOR_INNER_COLOR = Object.freeze([0, 0, 0, 1]);
export const MIASMA_COLOR = Object.freeze([f32(0.04), f32(0.005), f32(0.08), f32(0.72)]);
export const MIASMA_EMISSION = Object.freeze([f32(0.25), f32(0.02), f32(0.38), 1]);
export const MIASMA_QUEUE = 3002;

export function validateDeterminism() {
  if (stableHash(17, 42, PLACEMENT_SALT) !== 1607323056) throw new Error('Ocean hole placement hash changed.');
  let flag = false;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 128; j++) {
      const flag2 = stableHash(j, i, PLACEMENT_SALT) % 48 === 0;
      const num = isPitPixel(j, i, 0);
      const flag3 = isPitPixel(j, i, 0.25);
      const flag4 = isPitPixel(j, i, 0.5);
      const flag5 = isPitPixel(j, i, 1);
      if (num || flag4 !== flag2 || (flag3 && !flag4) || (flag4 && !flag5)) throw new Error('Ocean hole spawn-rate selection is invalid.');
      flag = flag || (flag5 && !flag4);
    }
  }
  if (!flag) throw new Error('Ocean hole spawn-rate range is invalid.');
  if (Math.abs(getFloorPitDepth(0, 1) - 14) > 0.001 || getFloorPitDepth(32, 1) !== 0 || Math.abs(getScaledSliderValue(0.5, 300) - 300) > 0.001
    || getScaledSliderValue(0, 300) !== 0 || Math.abs(getScaledSliderValue(1, 300) - 600) > 0.001) throw new Error('Ocean hole floor profile is invalid.');
}
