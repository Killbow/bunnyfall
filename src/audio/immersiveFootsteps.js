import { CLIMATES } from '../formats/mapsFile.js';
import { SEASON } from '../world/climateSwaps.js';
import { EQUIP_SLOTS } from '../characters/paperdoll.js';
import { equipTableOf } from '../characters/equip.js';
import { ARMOR_MATERIAL } from '../items/armorMaterials.js';
import { rriNativeMaterialValue } from '../mods/rriItems.js';
import { TRANSPORT_MODES } from '../travel/transport.js';
import { modSettingsOf, modSettingIfDeclared } from '../mods/modSettings.js';
import { audio as defaultAudio } from './audio.js';
import { SOUND } from './soundClips.js';

export const IMMERSIVE_FOOTSTEPS_VENDOR = 'immersive-footsteps';
export const IMMERSIVE_FOOTSTEPS_MOD = Object.freeze({
  title: 'ImmersiveFootsteps', version: '1.01', author: 'Kirk.O',
  guid: '8c75cd21-ca71-4841-b637-7728433c99f1', dfunity: '1.0.0',
});

export const FIXED_DELTA_TIME = 0.02;
export const SWIM_INTERVAL = 1.75;
// The refresh counter counts fixed ticks: 250 at 0.02 s is 5 s, whatever the mod's own comment says.
export const REFRESH_SLOTS_TICKS = 250;
// The hosts cap a frame's dt at 0.1 s, which is five ticks.
export const MAX_TICKS_PER_FRAME = 5;
export const SOUND_CLIP_QUALITY = Object.freeze({ Low: 0, High: 1 });
export const FLOOR_TYPE = Object.freeze({ Tile: 0, Stone: 1, Wood: 2 });
const FLOOR_LEFT = -2;
export const LANDING_VOLUME_SCALE = 4;
export const SWAY_WEIGHTS = Object.freeze([2, 1, 1, 3, 1, 4]);
export const SWAY_SLOTS = Object.freeze([EQUIP_SLOTS.Head, EQUIP_SLOTS.RightArm, EQUIP_SLOTS.LeftArm, EQUIP_SLOTS.ChestArmor, EQUIP_SLOTS.Gloves, EQUIP_SLOTS.LegsArmor]);

export const FOOTSTEP_SETS = Object.freeze(['Chainmail', 'Leather', 'Plate', 'Unarmored', 'DeepWater', 'Grass', 'Gravel', 'Mud', 'Path', 'Sand', 'ShallowWater', 'Snow', 'Tile', 'Wood']);
export const SWAY_SETS = Object.freeze(['Chainmail', 'Leather', 'Plate']);
export const LANDING_SETS = Object.freeze(['Chainmail', 'Leather', 'Plate', 'Unarmored']);
export const ARMOR_SETS = Object.freeze(['Chainmail', 'Leather', 'Plate', 'Unarmored']);
const FILE_WORD = Object.freeze({ DeepWater: 'Deep_Water', ShallowWater: 'Shallow_Water' });
const QUALITY_PREFIX = (q) => (q === SOUND_CLIP_QUALITY.High ? 'HQ' : 'LQ');

export function clipTable(quality) {
  const P = QUALITY_PREFIX(quality);
  const t = {};
  for (const s of FOOTSTEP_SETS) {
    const w = FILE_WORD[s] ?? s;
    t[`${s}FootstepsMain`] = Object.freeze([1, 2, 3].map((n) => `${P}_${w}_Footstep_${n}`));
    t[`${s}FootstepsAlt`] = Object.freeze([4, 5, 6].map((n) => `${P}_${w}_Footstep_${n}`));
  }
  for (const s of SWAY_SETS) t[`${s}Swaying`] = Object.freeze([1, 2, 3, 4].map((n) => `${P}_${s}_Swaying_${n}`));
  for (const s of LANDING_SETS) t[`${s}HardLanding`] = Object.freeze([1, 2].map((n) => `${P}_${s}_Hard_Landing_${n}`));
  t.WaterLandingSound = Object.freeze([`${P}_Water_Landing_1`]);
  return Object.freeze(t);
}

export const clipNames = (quality) => Object.values(clipTable(quality)).flat();

export function clipFolder(name) {
  const hq = name.startsWith('HQ_');
  const set = name.slice(3).split('_')[0];
  if (/_Swaying_\d$/.test(name)) return hq ? 'High_Quality/Armor_Swaying' : 'Low_Quality/Armor_Swaying';
  if (/_Landing_\d$/.test(name)) return hq ? 'High_Quality/Fall_Landing' : 'Low_Quality/Fall_Landing';
  if (ARMOR_SETS.includes(set)) return hq ? 'High_Quality/Armor_Footsteps' : 'Low_Quality/Armor';
  return hq ? 'High_Quality/Climate_Footsteps' : 'Low_Quality/Climate';
}
export const clipPath = (name) => `vendor/immersive-footsteps/Audio/${clipFolder(name)}/${name}.mp3`;

const IN_BROWSER = typeof window !== 'undefined';
const URLS = IN_BROWSER
  ? import.meta.glob('../../vendor/immersive-footsteps/Audio/*/*/*.mp3', { eager: true, query: '?url', import: 'default' })
  : {};
export const clipUrl = (name) => URLS[`../../${clipPath(name)}`] ?? null;
export const soundKey = (name) => `if:${name}`;

export const SHALLOW_WATER_TILES = Object.freeze(new Set([5, 6, 8, 20, 21, 23, 30, 31, 33, 34, 35, 36, 49]));
export const PATH_TILES = Object.freeze(new Set([46, 47, 55]));
export const TEMPERATE_DIRT_TILES = Object.freeze(new Set([1, 4, 7, 10, 13, 25, 26, 28, 37, 38, 39, 51, 52, 54]));
export const TEMPERATE_STONE_TILES = Object.freeze(new Set([3, 14, 16, 17, 24, 27, 29, 32, 43, 44, 45, 50]));
export const MOUNTAIN_DIRT_TILES = TEMPERATE_DIRT_TILES;
export const MOUNTAIN_STONE_TILES = TEMPERATE_STONE_TILES;
export const DESERT_GRAVEL_TILES = Object.freeze(new Set([2, 9, 11, 12, 15, 18, 19, 22, 39, 40, 41, 42, 45, 53]));
export const DESERT_STONE_TILES = Object.freeze(new Set([3, 14, 16, 17, 24, 26, 27, 29, 32, 38, 43, 44]));
export const SWAMP_BOG_TILES = Object.freeze(new Set([1, 4, 7, 10, 13, 25, 26, 28, 37, 38, 39, 50, 51, 52, 54]));
export const SWAMP_GRASS_TILES = Object.freeze(new Set([3, 14, 16, 17, 24, 27, 29, 32, 43, 44, 45]));
export const SWAMP_SNOW_ALT_TILES = Object.freeze(new Set([1, 7, 10, 11, 13, 25, 26, 28, 37, 38, 39, 43, 48, 50, 52]));
export const CLIMATE_TILE_TABLES = Object.freeze({
  Shallow_Water: SHALLOW_WATER_TILES, Path: PATH_TILES,
  Temperate_Dirt: TEMPERATE_DIRT_TILES, Temperate_Stone: TEMPERATE_STONE_TILES,
  Mountain_Dirt: MOUNTAIN_DIRT_TILES, Mountain_Stone: MOUNTAIN_STONE_TILES,
  Desert_Gravel: DESERT_GRAVEL_TILES, Desert_Stone: DESERT_STONE_TILES,
  Swamp_Bog: SWAMP_BOG_TILES, Swamp_Grass: SWAMP_GRASS_TILES, Swamp_Snow_Alt: SWAMP_SNOW_ALT_TILES,
});
export const checkClimateTileTables = (climateKey, tileKey) => CLIMATE_TILE_TABLES[climateKey]?.has(tileKey) ?? false;

export const TILE_FLOOR_ARCHIVES = Object.freeze(new Set(['16_3', '37_3', '40_3', '41_0', '41_1', '41_2', '41_3', '44_3', '63_3', '111_2', '111_3', '137_3', '141_0', '141_1', '141_2', '141_3', '144_3', '311_3', '337_3', '341_0', '341_1', '341_2', '341_3', '363_3', '411_3', '437_3', '440_3', '444_3', '463_3']));
export const STONE_FLOOR_ARCHIVES = Object.freeze(new Set(['60_3', '140_3', '160_3', '163_3', '340_3', '360_3', '366_3', '416_3', '460_3', '466_3']));
export const WOOD_FLOOR_ARCHIVES = Object.freeze(new Set(['28_3', '66_3', '116_3', '128_3', '166_3', '171_3', '316_3', '328_3', '344_3', '428_3']));
export const BUILDING_FLOOR_TABLES = Object.freeze({ Tile_Floor: TILE_FLOOR_ARCHIVES, Stone_Floor: STONE_FLOOR_ARCHIVES, Wood_Floor: WOOD_FLOOR_ARCHIVES });
export const checkBuildingClimateFloorTypeTables = (floorTypeKey, archiveKey) => BUILDING_FLOOR_TABLES[floorTypeKey]?.has(archiveKey) ?? false;

export const isSnowyClimate = (c) => !(c === CLIMATES.Desert || c === CLIMATES.Desert2 || c === CLIMATES.Rainforest || c === CLIMATES.Subtropical);
export const isGrassyClimate = (c) => c === CLIMATES.Woodlands || c === CLIMATES.HauntedWoodlands;
export const isRockyClimate = (c) => c === CLIMATES.Mountain || c === CLIMATES.MountainWoods;
export const isSandyClimate = (c) => c === CLIMATES.Desert || c === CLIMATES.Desert2 || c === CLIMATES.Subtropical;
export const isSwampyClimate = (c) => c === CLIMATES.Swamp || c === CLIMATES.Rainforest;

export const unityMaterialName = (archive, record) => `TEXTURE.${String(archive).padStart(3, '0')} [Index=${record}] (Instance)`;

export function getFormattedTextureArchiveFromMaterialName(input) {
  const m = /TEXTURE\.(\d+) \[Index=(\d+)\] \(Instance\)/.exec(String(input ?? ''));
  if (!m) return '';
  return `${m[1].replace(/^0+/, '')}_${m[2]}`;
}

export function interiorFloorType(materialNames) {
  for (const name of materialNames ?? []) {
    const key = getFormattedTextureArchiveFromMaterialName(name);
    if (key === '') continue;
    if (checkBuildingClimateFloorTypeTables('Wood_Floor', key)) return FLOOR_TYPE.Wood;
    if (checkBuildingClimateFloorTypeTables('Stone_Floor', key)) return FLOOR_TYPE.Stone;
    if (checkBuildingClimateFloorTypeTables('Tile_Floor', key)) return FLOOR_TYPE.Tile;
  }
  return FLOOR_TYPE.Tile;
}

export const SETTING_KEYS = Object.freeze([
  'Enabled',
  'AudioQualitySettings.SoundClipQuality',
  'FootstepSettings.AllowFootstepSounds', 'FootstepSettings.FootstepVolumeMulti', 'FootstepSettings.FootstepFrequency',
  'ArmorSwaySettings.AllowArmorSwaySounds', 'ArmorSwaySettings.ArmorSwayVolumeMulti', 'ArmorSwaySettings.ArmorSwayFrequency',
  'ErrorLoggingAndCompatibilitySettings.AllowModCompatWarnings', 'ErrorLoggingAndCompatibilitySettings.AllowVerboseErrorLogging', 'ErrorLoggingAndCompatibilitySettings.DoNotSpamExceptionsLogs',
]);

export function readFootstepSettings(read = () => modSettingsOf(IMMERSIVE_FOOTSTEPS_VENDOR)) {
  let s;
  try { s = read() ?? {}; } catch { s = {}; }
  return {
    Enabled: s.Enabled !== false,
    SoundClipQuality: s['AudioQualitySettings.SoundClipQuality'] ?? SOUND_CLIP_QUALITY.Low,
    AllowFootstepSounds: s['FootstepSettings.AllowFootstepSounds'] ?? true,
    FootstepVolumeMulti: s['FootstepSettings.FootstepVolumeMulti'] ?? 1.0,
    FootstepFrequency: s['FootstepSettings.FootstepFrequency'] ?? 0.6,
    AllowArmorSwaySounds: s['ArmorSwaySettings.AllowArmorSwaySounds'] ?? true,
    ArmorSwayVolumeMulti: s['ArmorSwaySettings.ArmorSwayVolumeMulti'] ?? 1.0,
    ArmorSwayFrequency: s['ArmorSwaySettings.ArmorSwayFrequency'] ?? 0.6,
    AllowCompatibilityWarnings: s['ErrorLoggingAndCompatibilitySettings.AllowModCompatWarnings'] ?? true,
    AllowVerboseErrorLogging: s['ErrorLoggingAndCompatibilitySettings.AllowVerboseErrorLogging'] ?? false,
    DoNotSpamExceptionsLogs: s['ErrorLoggingAndCompatibilitySettings.DoNotSpamExceptionsLogs'] ?? true,
  };
}
const sameSettings = (a, b) => a && b && Object.keys(a).every((k) => a[k] === b[k]);

const rangeInt = (random, min, max) => min + Math.floor(random() * (max - min));
const rangeFloat = (random, min, max) => min + random() * (max - min);
export const coinFlip = (random) => rangeInt(random, 0, 1 + 1) !== 0;

export function rollRandomAudioClip(clips, last, random) {
  let randChoice = rangeInt(random, 0, clips.length);
  let clip = clips[randChoice];
  if (clip === last) {
    if (randChoice === 0) randChoice++;
    else if (randChoice === clips.length - 1) randChoice--;
    else randChoice = coinFlip(random) ? randChoice + 1 : randChoice - 1;
    clip = clips[randChoice];
  }
  return clip;
}

export async function defaultFetchClip(name) {
  const url = clipUrl(name);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

const nativeMaterialValue = (item) => (item ? rriNativeMaterialValue(item) : -1);

export function createImmersiveFootsteps({ audio = defaultAudio, settings = readFootstepSettings, random = Math.random, fetchClip = defaultFetchClip } = {}) {
  let s = null;
  let stepInterval = 0.6;
  let plateSwayInterval = 0.6, chainSwayInterval = 0.6, leatherSwayInterval = 0.6;
  let plateWornSwayWeight = 0, chainWornSwayWeight = 0, leatherWornSwayWeight = 0;
  let lastFootstepPlayed = null, lastSwaySoundPlayed = null;
  let currInteriorFloorType = FLOOR_TYPE.Tile;
  const worn = { helmet: null, rightArm: null, leftArm: null, chestArmor: null, gloves: null, legArmor: null, boots: null };
  let clips = null;
  let loadedQuality = -1, loadingQuality = -1, loading = null, loadGen = 0;
  const registered = new Set();
  let lastPosition = null;
  let distance = 0;
  let footstepTimer = 0, plateSwayTimer = 0, chainSwayTimer = 0, leatherSwayTimer = 0;
  let refreshSlotsTimer = 0;
  // The mod declares altStep and never sets it, so every Alt table is unused.
  const altStep = false;
  let volumeScale = 1;
  let currentClimateFootsteps = null;
  let lastSeason = SEASON.Summer, lastClimateIndex = CLIMATES.Ocean, lastTileMapIndex = 0;
  let isInside = false;
  let lastFloor = null;
  let acc = 0;
  let lastM = null;
  let pendingExterior = false;
  const played = [];

  const table = (name) => (clips ? clips[name] : null);
  const cur = (main) => (altStep ? table(`${main}Alt`) : table(`${main}Main`));
  // The master bus already applies SoundVolume, so the mod's own SoundVolume multiply is not repeated here.
  const play = (clip, volume) => {
    if (!clip) return false;
    played.push({ clip, volume });
    if (played.length > 8) played.shift();
    audio.playOneShot(soundKey(clip), volume);
    return true;
  };

  async function loadAudio(quality) {
    const gen = ++loadGen;
    const names = clipNames(quality);
    const results = await Promise.all(names.map(async (name) => {
      if (registered.has(name)) return true;
      let ok = false;
      try {
        const bytes = await fetchClip(name);
        ok = !!bytes && await audio.registerSound(soundKey(name), bytes);
      } catch { ok = false; }
      if (ok) registered.add(name);
      return ok;
    }));
    const success = results.every(Boolean);
    if (gen !== loadGen) return false;
    if (!success) {
      console.warn('[Warning] ImmersiveFootsteps: Missing sound asset');
      return false;
    }
    const wasSet = currentClimateFootsteps ? Object.entries(clips).find(([, v]) => v === currentClimateFootsteps)?.[0] : null;
    clips = clipTable(quality);
    loadedQuality = quality;
    currentClimateFootsteps = (wasSet && clips[wasSet]) || clips.PathFootstepsMain;
    return true;
  }

  // This overwrites the intervals, so it runs only on a settings change; each frame would undo the leather re-roll.
  function loadSettings(next) {
    s = next;
    stepInterval = s.FootstepFrequency;
    plateSwayInterval = s.ArmorSwayFrequency;
    chainSwayInterval = s.ArmorSwayFrequency;
    leatherSwayInterval = s.ArmorSwayFrequency;
    if (s.Enabled && loadedQuality !== s.SoundClipQuality && !(loading && loadingQuality === s.SoundClipQuality)) {
      loadingQuality = s.SoundClipQuality;
      // A superseded load clears only its own marker, so a newer load in flight stays tracked.
      const pending = loadAudio(s.SoundClipQuality).finally(() => { if (loading === pending) { loading = null; loadingQuality = -1; } });
      loading = pending;
    }
  }
  const settle = () => { const p = loading; return p ? p.then(() => undefined) : Promise.resolve(); };
  const syncSettings = () => { const next = settings(); if (!sameSettings(s, next)) loadSettings(next); };

  function woodFloorFootsteps() {
    const boots = worn.boots;
    const mat = nativeMaterialValue(boots);
    if (boots && mat >= ARMOR_MATERIAL.Iron) currentClimateFootsteps = cur('PlateFootsteps');
    else if (boots && mat >= ARMOR_MATERIAL.Chain) currentClimateFootsteps = cur('ChainmailFootsteps');
    else currentClimateFootsteps = cur('WoodFootsteps');
  }

  function updateInteriorArmorFootstepSounds() {
    if (!clips) return;
    const boots = worn.boots;
    const mat = nativeMaterialValue(boots);
    if (currInteriorFloorType === FLOOR_TYPE.Wood) {
      woodFloorFootsteps();
    } else if (currInteriorFloorType === FLOOR_TYPE.Stone) {
      if (boots) {
        if (mat >= ARMOR_MATERIAL.Iron) currentClimateFootsteps = cur('PlateFootsteps');
        else if (mat >= ARMOR_MATERIAL.Chain) currentClimateFootsteps = cur('ChainmailFootsteps');
        else currentClimateFootsteps = cur('PathFootsteps');
      } else currentClimateFootsteps = cur('UnarmoredFootsteps');
    } else {
      if (boots) {
        if (mat >= ARMOR_MATERIAL.Iron) currentClimateFootsteps = cur('PlateFootsteps');
        else if (mat >= ARMOR_MATERIAL.Chain) currentClimateFootsteps = cur('ChainmailFootsteps');
        else currentClimateFootsteps = cur('TileFootsteps');
      } else currentClimateFootsteps = cur('UnarmoredFootsteps');
    }
  }

  function updateSwayMaterialWeights() {
    plateWornSwayWeight = 0; chainWornSwayWeight = 0; leatherWornSwayWeight = 0;
    const materialValues = [worn.helmet, worn.rightArm, worn.leftArm, worn.chestArmor, worn.gloves, worn.legArmor].map(nativeMaterialValue);
    for (let i = 0; i < materialValues.length; i++) {
      if (materialValues[i] <= -1) continue;
      const weight = SWAY_WEIGHTS[i];
      if (materialValues[i] >= ARMOR_MATERIAL.Iron) plateWornSwayWeight += weight;
      else if (materialValues[i] >= ARMOR_MATERIAL.Chain) chainWornSwayWeight += weight;
      else leatherWornSwayWeight += weight;
    }
  }

  function determineExteriorNow() {
    if (lastM && !lastM.inside) determineExteriorClimateFootstep(lastM);
    else pendingExterior = true;
  }

  function refreshEquipmentSlotReferences(entity) {
    if (!entity) return;
    let slots;
    try { slots = equipTableOf(entity); } catch { return; }
    if (!slots) return;
    worn.helmet = slots[EQUIP_SLOTS.Head] ?? null;
    worn.rightArm = slots[EQUIP_SLOTS.RightArm] ?? null;
    worn.leftArm = slots[EQUIP_SLOTS.LeftArm] ?? null;
    worn.chestArmor = slots[EQUIP_SLOTS.ChestArmor] ?? null;
    worn.gloves = slots[EQUIP_SLOTS.Gloves] ?? null;
    worn.legArmor = slots[EQUIP_SLOTS.LegsArmor] ?? null;
    worn.boots = slots[EQUIP_SLOTS.Feet] ?? null;
    updateSwayMaterialWeights();
    if (lastM?.inside) updateInteriorArmorFootstepSounds();
    else {
      currInteriorFloorType = FLOOR_TYPE.Tile;
      lastTileMapIndex = 0;
      determineExteriorNow();
    }
  }

  function checkToUseArmorFootsteps() {
    const boots = worn.boots;
    if (boots) {
      const mat = nativeMaterialValue(boots);
      if (mat >= ARMOR_MATERIAL.Iron) currentClimateFootsteps = cur('PlateFootsteps');
      else if (mat >= ARMOR_MATERIAL.Chain) currentClimateFootsteps = cur('ChainmailFootsteps');
      else currentClimateFootsteps = cur('LeatherFootsteps');
    } else currentClimateFootsteps = cur('UnarmoredFootsteps');
  }

  function checkToUseHardFallSounds(fallDamage) {
    const boots = worn.boots;
    const i = fallDamage ? 1 : 0;
    if (boots) {
      const mat = nativeMaterialValue(boots);
      if (mat >= ARMOR_MATERIAL.Iron) return table('PlateHardLanding')?.[i];
      if (mat >= ARMOR_MATERIAL.Chain) return table('ChainmailHardLanding')?.[i];
      return table('LeatherHardLanding')?.[i];
    }
    return table('UnarmoredHardLanding')?.[i];
  }

  function determineInteriorClimateFootstep(m) {
    if (m.inDungeon && m.waterSurfaceY != null) {
      if (m.swimming) currentClimateFootsteps = cur('DeepWaterFootsteps');
      else if (!m.swimming && (m.centreY - 0.57) < m.waterSurfaceY) currentClimateFootsteps = cur('ShallowWaterFootsteps');
      else checkToUseArmorFootsteps();
    }
  }

  function determineExteriorClimateFootstep(m) {
    // The mod reads only the tile under the player; a deck is a wooden floor and a model over water is walked on.
    const floor = m.deck ? 'deck' : m.onStaticGeometry && ((m.tileMapIndex ?? 0) === 0 || SHALLOW_WATER_TILES.has(m.tileMapIndex)) ? 'floor' : null;
    if (floor !== lastFloor) { lastFloor = floor; lastTileMapIndex = FLOOR_LEFT; }
    if (floor === 'deck') { woodFloorFootsteps(); return; }
    if (floor === 'floor') { checkToUseArmorFootsteps(); return; }
    const currentSeason = m.season ?? SEASON.Summer;
    const currentClimateIndex = m.climateIndex ?? CLIMATES.Ocean;
    const currentTileMapIndex = m.tileMapIndex ?? 0;
    if (lastTileMapIndex !== currentTileMapIndex || lastClimateIndex !== currentClimateIndex || lastSeason !== currentSeason) {
      lastSeason = currentSeason;
      lastClimateIndex = currentClimateIndex;
      lastTileMapIndex = currentTileMapIndex;
      // As in the mod, the set is re-read only on a tile change, so expired water walking keeps the shallow sound.
      if (currentTileMapIndex === 0) {
        if (m.waterWalking) currentClimateFootsteps = cur('ShallowWaterFootsteps');
        else currentClimateFootsteps = cur('DeepWaterFootsteps');
      } else if (checkClimateTileTables('Shallow_Water', currentTileMapIndex)) currentClimateFootsteps = cur('ShallowWaterFootsteps');
      else if (checkClimateTileTables('Path', currentTileMapIndex)) checkToUseArmorFootsteps();
      else if (currentSeason === SEASON.Winter && isSnowyClimate(currentClimateIndex)) {
        if (currentClimateIndex === CLIMATES.Swamp && checkClimateTileTables('Swamp_Snow_Alt', currentTileMapIndex)) currentClimateFootsteps = cur('MudFootsteps');
        else currentClimateFootsteps = cur('SnowFootsteps');
      } else if (isGrassyClimate(currentClimateIndex)) {
        if (checkClimateTileTables('Temperate_Dirt', currentTileMapIndex)) currentClimateFootsteps = cur('GravelFootsteps');
        else if (checkClimateTileTables('Temperate_Stone', currentTileMapIndex)) checkToUseArmorFootsteps();
        else currentClimateFootsteps = cur('GrassFootsteps');
      } else if (isRockyClimate(currentClimateIndex)) {
        if (checkClimateTileTables('Mountain_Dirt', currentTileMapIndex)) currentClimateFootsteps = cur('GravelFootsteps');
        else if (checkClimateTileTables('Mountain_Stone', currentTileMapIndex)) checkToUseArmorFootsteps();
        else currentClimateFootsteps = cur('GrassFootsteps');
      } else if (isSandyClimate(currentClimateIndex)) {
        if (checkClimateTileTables('Desert_Gravel', currentTileMapIndex)) currentClimateFootsteps = cur('GravelFootsteps');
        else if (checkClimateTileTables('Desert_Stone', currentTileMapIndex)) checkToUseArmorFootsteps();
        else currentClimateFootsteps = cur('SandFootsteps');
      } else if (isSwampyClimate(currentClimateIndex)) {
        if (checkClimateTileTables('Swamp_Bog', currentTileMapIndex)) currentClimateFootsteps = cur('MudFootsteps');
        else if (checkClimateTileTables('Swamp_Grass', currentTileMapIndex)) currentClimateFootsteps = cur('GrassFootsteps');
        else currentClimateFootsteps = cur('MudFootsteps');
      }
    }
    if (!currentClimateFootsteps || currentClimateFootsteps.length <= 0) currentClimateFootsteps = cur('PathFootsteps');
  }

  const rollFootstep = (set) => { const c = rollRandomAudioClip(set, lastFootstepPlayed, random); lastFootstepPlayed = c; return c; };
  const rollSway = (set) => { const c = rollRandomAudioClip(set, lastSwaySoundPlayed, random); lastSwaySoundPlayed = c; return c; };
  const swayReroll = () => rangeFloat(random, s.ArmorSwayFrequency + 0.1, s.ArmorSwayFrequency + 0.4) - (leatherWornSwayWeight * 0.02);

  function fixedUpdate(m) {
    if (m.paused) return;
    let playerSwimming = false;
    refreshSlotsTimer++;
    if (refreshSlotsTimer >= REFRESH_SLOTS_TICKS) {
      refreshSlotsTimer = 0;
      if (s.AllowFootstepSounds || s.AllowArmorSwaySounds) refreshEquipmentSlotReferences(m.entity);
    }
    playerSwimming = !!m.swimming;
    if (!m.grounded && !playerSwimming) return;
    if (m.standingStill) return;
    if (m.isRunning) {
      footstepTimer += 1.5 * FIXED_DELTA_TIME;
      plateSwayTimer += 1.8 * FIXED_DELTA_TIME; chainSwayTimer += 1.8 * FIXED_DELTA_TIME; leatherSwayTimer += 1.8 * FIXED_DELTA_TIME;
      volumeScale = 1.25;
    } else if (m.movingLessThanHalfSpeed) {
      footstepTimer += 0.7 * FIXED_DELTA_TIME;
      plateSwayTimer += 0.5 * FIXED_DELTA_TIME; chainSwayTimer += 0.5 * FIXED_DELTA_TIME; leatherSwayTimer += 0.5 * FIXED_DELTA_TIME;
      volumeScale = 0.6;
    } else {
      footstepTimer += FIXED_DELTA_TIME;
      plateSwayTimer += FIXED_DELTA_TIME; chainSwayTimer += FIXED_DELTA_TIME; leatherSwayTimer += FIXED_DELTA_TIME;
      volumeScale = 1;
    }
    if (m.transportMode === TRANSPORT_MODES.Horse || m.transportMode === TRANSPORT_MODES.Cart) footstepTimer = 0;
    if (!s.AllowFootstepSounds) footstepTimer = 0;
    if (!s.AllowArmorSwaySounds) { plateSwayTimer = 0; chainSwayTimer = 0; leatherSwayTimer = 0; }
    if (playerSwimming) {
      // The mod's horizontal position uses all three axes despite its name.
      const position = [m.pos[0], m.pos[1], m.pos[2]];
      distance += Math.hypot(position[0] - lastPosition[0], position[1] - lastPosition[1], position[2] - lastPosition[2]);
      lastPosition = position;
      if (distance > SWIM_INTERVAL) {
        isInside = !!m.inside;
        if (isInside) determineInteriorClimateFootstep(m); else determineExteriorClimateFootstep(m);
        // The swim step is not gated on AllowFootstepSounds, as in the mod.
        play(rollFootstep(currentClimateFootsteps), volumeScale * s.FootstepVolumeMulti);
        distance = 0;
      }
      footstepTimer = 0; plateSwayTimer = 0; chainSwayTimer = 0; leatherSwayTimer = 0;
    }
    if (footstepTimer >= stepInterval) {
      isInside = !!m.inside;
      if (isInside) determineInteriorClimateFootstep(m); else determineExteriorClimateFootstep(m);
      if (s.AllowFootstepSounds) play(rollFootstep(currentClimateFootsteps), volumeScale * s.FootstepVolumeMulti);
      footstepTimer = 0;
    }
    if (leatherWornSwayWeight <= 0) leatherSwayTimer = 0;
    if (chainWornSwayWeight <= 0) chainSwayTimer = 0;
    if (plateWornSwayWeight <= 0) plateSwayTimer = 0;
    if (leatherSwayTimer >= leatherSwayInterval) {
      if (s.AllowArmorSwaySounds) play(rollSway(table('LeatherSwaying')), volumeScale * s.ArmorSwayVolumeMulti);
      leatherSwayTimer = 0;
      leatherSwayInterval = swayReroll();
    }
    if (chainSwayTimer >= chainSwayInterval) {
      if (s.AllowArmorSwaySounds) play(rollSway(table('ChainmailSwaying')), volumeScale * s.ArmorSwayVolumeMulti);
      chainSwayTimer = 0;
      // The mod re-rolls the leather interval here too, not this armor's own.
      leatherSwayInterval = swayReroll();
    }
    if (plateSwayTimer >= plateSwayInterval) {
      if (s.AllowArmorSwaySounds) play(rollSway(table('PlateSwaying')), volumeScale * s.ArmorSwayVolumeMulti);
      plateSwayTimer = 0;
      // The mod re-rolls the leather interval here too, not this armor's own.
      leatherSwayInterval = swayReroll();
    }
  }

  // Until the clips load the mod owns nothing and the classic stride plays.
  const active = () => !!(s?.Enabled && clips);

  const api = {
    update(dt, m) {
      syncSettings();
      if (!s.Enabled) { acc = 0; return; }
      lastM = m;
      if (!clips) return;
      if (lastPosition === null) lastPosition = [m.pos[0], m.pos[1], m.pos[2]];
      if (pendingExterior && !m.inside) { pendingExterior = false; determineExteriorClimateFootstep(m); }
      acc += Math.max(0, Number(dt) || 0);
      // Ticks count in integers with an epsilon (0.1 / 0.02 is 4.999 in floats); a longer stall drops its
      // residue, as Unity's maximumDeltaTime does.
      let ticks = Math.floor(acc / FIXED_DELTA_TIME + 1e-9);
      if (ticks > MAX_TICKS_PER_FRAME) { ticks = MAX_TICKS_PER_FRAME; acc = 0; } else acc -= ticks * FIXED_DELTA_TIME;
      if (acc < 1e-9) acc = 0;
      for (let i = 0; i < ticks; i++) fixedUpdate(m);
    },
    onTransitionInterior({ buildingType = null, materials = [] } = {}) {
      lastM = lastM ? { ...lastM, inside: true, inDungeon: false } : { inside: true, inDungeon: false };
      // Only BuildingTypes.None (-1) skips the floor walk; a building with no discovery record is type 0.
      currInteriorFloorType = buildingType === -1 ? FLOOR_TYPE.Tile : interiorFloorType(materials);
      updateInteriorArmorFootstepSounds();
    },
    onTransitionExterior() {
      lastM = lastM ? { ...lastM, inside: false, inDungeon: false } : null;
      currInteriorFloorType = FLOOR_TYPE.Tile;
      lastTileMapIndex = 0;
      pendingExterior = true;
    },
    onTransitionDungeonInterior() {
      lastM = lastM ? { ...lastM, inside: true, inDungeon: true } : { inside: true, inDungeon: true };
      currInteriorFloorType = FLOOR_TYPE.Tile;
      updateInteriorArmorFootstepSounds();
    },
    onInventoryClose(entity) {
      syncSettings();
      if (!active()) return;
      if (s.AllowFootstepSounds || s.AllowArmorSwaySounds) refreshEquipmentSlotReferences(entity);
    },
    refreshEquipmentSlotReferences(entity) { syncSettings(); if (active()) refreshEquipmentSlotReferences(entity); },
    applyPlayerFallDamage() { syncSettings(); return active() && play(checkToUseHardFallSounds(true), LANDING_VOLUME_SCALE * s.FootstepVolumeMulti); },
    hardFallAlert() { syncSettings(); return active() && play(checkToUseHardFallSounds(false), LANDING_VOLUME_SCALE * s.FootstepVolumeMulti); },
    playLargeSplash() { syncSettings(); return active() && play(table('WaterLandingSound')?.[0], LANDING_VOLUME_SCALE * s.FootstepVolumeMulti); },
    fallSoundSink(fallback) {
      return (id, vol) => {
        if (id === SOUND.FallDamage && api.applyPlayerFallDamage()) return;
        if (id === SOUND.FallHard && api.hardFallAlert()) return;
        fallback?.(id, vol);
      };
    },
    ownsStride: active,
    settle,
    status() {
      return {
        enabled: !!s?.Enabled, loaded: !!clips, quality: loadedQuality,
        currentSet: currentClimateFootsteps ? Object.entries(clips ?? {}).find(([, v]) => v === currentClimateFootsteps)?.[0] ?? null : null,
        floorType: currInteriorFloorType,
        weights: { plate: plateWornSwayWeight, chain: chainWornSwayWeight, leather: leatherWornSwayWeight },
        intervals: { step: stepInterval, plate: plateSwayInterval, chain: chainSwayInterval, leather: leatherSwayInterval },
        timers: { footstep: footstepTimer, plate: plateSwayTimer, chain: chainSwayTimer, leather: leatherSwayTimer, refresh: refreshSlotsTimer },
        distance, lastTileMapIndex, lastClimateIndex, lastSeason, volumeScale, floor: lastFloor,
        worn: { ...worn },
        lastFootstepPlayed, lastSwaySoundPlayed,
        played: played.slice(),
      };
    },
  };
  return api;
}

export const immersiveFootsteps = createImmersiveFootsteps();

export const BETTER_AMBIENCE_GUID = 'd5655077-ba38-4dbc-a41f-2b358cb1d680';
export function modCompatibilityChecking(read = modSettingIfDeclared) {
  const enabled = read('better-ambience', 'Enabled');
  const betterAmbienceCheck = enabled === true;
  const betterAmbienceFootstepsModuleCheck = betterAmbienceCheck && read('better-ambience', 'Better Footsteps.enable') === true;
  return { betterAmbienceCheck, betterAmbienceFootstepsModuleCheck, temperedInteriorsCheck: false, travelOptionsCheck: false };
}
export const COMPAT_WARNING_LINES = Object.freeze([
  '! WARNING !',
  'Compatibility Issue Detected',
  'Immersive Footsteps:',
  '',
  'Disable the \'Better Footsteps\' setting for the Better Ambience mod.',
  'Otherwise footstep sounds will be constantly overlapping each other.',
  '',
  '(These automatic warnings can be disabled in Immersive Footsteps settings)',
]);
export const COMPAT_WARNING_LOG = Object.freeze([
  '[Warning] Immersive Footsteps: The \'Better Ambience\' mod is currently active, more importantly, the \'Better Footsteps\' module for that mod is also enabled.',
  'While using the Immersive Footsteps mod, you should always have Better Ambience\'s \'Better Footsteps\' setting disabled, otherwise you will be constantly...',
  'hearing overlapping footstep sounds, turn this feature off in Better Ambience\'s settings to resolve this issue.',
  'You can also turn these warnings off in \'Immersive Footsteps\' settings, if you wish.',
]);
export function reportModCompatibilityIssues({ showText, log = (l) => console.log(l), read = modSettingIfDeclared, settings = readFootstepSettings } = {}) {
  const s = settings();
  if (!s.Enabled || !s.AllowCompatibilityWarnings) return false;
  const c = modCompatibilityChecking(read);
  if (!(c.betterAmbienceCheck && c.betterAmbienceFootstepsModuleCheck)) return false;
  for (const l of COMPAT_WARNING_LOG) log(l);
  showText?.([...COMPAT_WARNING_LINES]);
  return true;
}
