// Smaller Dungeons: a dungeon over five blocks is regenerated as a plus of five blocks, drawn from its own
// block list with DFRandom seeded on MapId. Main-story dungeons never shrink.
// Locations are cached objects shared with the exterior layout, so this module returns a shallow clone.

import { setSeed, randomRange } from '../formats/dfRandom.js';
import { getBool } from '../platform/settings.js';
import { SITE_TYPES } from '../systems/quest/place.js';
import { isMainStoryDungeon } from './dungeonTextures.js';
import { isArenaUndercroft } from './arenaCity.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { getPref } from '../ui/uiPrefs.js';
import { isOnlinePage } from '../platform/onlineLane.js';
import { seededFirst } from '../weather/wind.js';
import { dungeonTier } from './dungeonTier.js';

export const SMALLER_DUNGEONS_STATE = Object.freeze({ NotSet: 0, Disabled: 1, Enabled: 2 });

export const SMALLER_DUNGEON_THRESHOLD = 5;

export const MEDIUM_DUNGEON_THRESHOLD = 8;
export const MEDIUM_DUNGEONS_STATE = 3;
export const MEDIUM_DISTINCT_STAMP = 5;
export const MEDIUM_DUNGEONS_PREF = 'mediumDungeons';
export const mediumDungeonsWanted = () => isEnhanced() && getPref(MEDIUM_DUNGEONS_PREF) === true;

export const ONLINE_DUNGEONS_STATE = 4;
export const ONLINE_DUNGEON_SIZES = Object.freeze([['small', 1], ['medium', 2], ['full', 1]].map((r) => Object.freeze(r)));
export const ONLINE_DUNGEON_SIZE_SALT = 0x5d1e5a2b;
export function onlineDungeonSize(dfLocation) {
  const id = dfLocation?.mapTableData?.mapId;
  if (!Number.isFinite(id)) return 'full';
  const total = ONLINE_DUNGEON_SIZES.reduce((sum, [, w]) => sum + w, 0);
  let u = seededFirst(id ^ ONLINE_DUNGEON_SIZE_SALT) * total;
  for (const [size, w] of ONLINE_DUNGEON_SIZES) {
    if (u < w) return size;
    u -= w;
  }
  return 'full';
}
export const WORLD_DUNGEON_SIZES_PREF = 'worldDungeonSizes';
export const worldDungeonSizesWanted = () => isEnhanced() && getPref(WORLD_DUNGEON_SIZES_PREF) === true;
export const MEDIUM_LAYOUT = Object.freeze([
  [0, 0, false], [1, 0, false],
  [0, -1, true], [1, -1, true], [-1, 0, true], [2, 0, true], [0, 1, true], [1, 1, true],
].map((r) => Object.freeze(r)));

const SMALLER_LAYOUT = Object.freeze([
  [0, 0, false],
  [0, -1, true],
  [-1, 0, true],
  [1, 0, true],
  [0, 1, true],
].map((r) => Object.freeze(r)));

export function smallerDungeonsStateNow(enabled = getBool('Experimental', 'SmallerDungeons'), medium = mediumDungeonsWanted(), online = isOnlinePage(), world = worldDungeonSizesWanted()) {
  if (online) return ONLINE_DUNGEONS_STATE;
  if (enabled) return SMALLER_DUNGEONS_STATE.Enabled;
  if (world) return ONLINE_DUNGEONS_STATE;
  return medium ? MEDIUM_DUNGEONS_STATE : SMALLER_DUNGEONS_STATE.Disabled;
}

export function useSmallerDungeon(dfLocation, { questMachine = null,
  setting = getBool('Experimental', 'SmallerDungeons'), online = false } = {}) {
  if (!dfLocation?.hasDungeon || isMainStoryDungeon(dfLocation.mapTableData?.mapId)) return false;
  if (isArenaUndercroft(dfLocation)) return false;
  if (dfLocation.editorDungeon) return false;
  if (online) return false;
  const links = questMachine?.getSiteLinks(SITE_TYPES.Dungeon, dfLocation.mapTableData?.mapId) ?? [];
  if (links.length > 0) {
    const quest = questMachine.getQuest(links[0].questUID);
    if (quest && quest.smallerDungeonsState === SMALLER_DUNGEONS_STATE.Enabled) return true;
    if (quest && quest.smallerDungeonsState === SMALLER_DUNGEONS_STATE.Disabled) return false;
  }
  return setting;
}

export function dungeonSizeFor(dfLocation, { questMachine = null,
  setting = getBool('Experimental', 'SmallerDungeons'), medium = mediumDungeonsWanted(), online = false,
  world = worldDungeonSizesWanted(), whole = false } = {}) {
  if (!dfLocation?.hasDungeon || isMainStoryDungeon(dfLocation.mapTableData?.mapId)) return 'full';
  if (dfLocation.editorDungeon) return 'full';
  if (isArenaUndercroft(dfLocation)) return 'full';
  if (dungeonTier(dfLocation) === 'super') return 'full';
  if (online) return whole ? 'full' : onlineDungeonSize(dfLocation);
  const links = questMachine?.getSiteLinks(SITE_TYPES.Dungeon, dfLocation.mapTableData?.mapId) ?? [];
  if (links.length > 0) {
    const quest = questMachine.getQuest(links[0].questUID);
    if (quest && quest.smallerDungeonsState === SMALLER_DUNGEONS_STATE.Enabled) return 'small';
    if (quest && quest.smallerDungeonsState === MEDIUM_DUNGEONS_STATE) return 'medium';
    if (quest && quest.smallerDungeonsState === ONLINE_DUNGEONS_STATE) return onlineDungeonSize(dfLocation);
    if (quest && quest.smallerDungeonsState === SMALLER_DUNGEONS_STATE.Disabled) return 'full';
  }
  if (setting) return 'small';
  if (world) return onlineDungeonSize(dfLocation);
  return medium ? 'medium' : 'full';
}

export const portSize = (state) => state === MEDIUM_DUNGEONS_STATE || state === ONLINE_DUNGEONS_STATE;

export function adoptLinkedDungeonSize(quest, questMachine, online = isOnlinePage()) {
  if (online) return null;
  const known = [SMALLER_DUNGEONS_STATE.Disabled, SMALLER_DUNGEONS_STATE.Enabled, MEDIUM_DUNGEONS_STATE, ONLINE_DUNGEONS_STATE];
  for (const r of quest?.resources?.values?.() ?? []) {
    const sd = r?.isPlace ? r.siteDetails : null;
    if (sd?.siteType !== SITE_TYPES.Dungeon) continue;
    const link = questMachine?.getSiteLinks?.(SITE_TYPES.Dungeon, sd.mapId)?.[0];
    if (!link || link.questUID === quest.uid) continue;
    const held = questMachine.getQuest?.(link.questUID)?.smallerDungeonsState;
    if (!known.includes(held) || held === quest.smallerDungeonsState) continue;
    if (!portSize(held) && !portSize(quest.smallerDungeonsState)) continue;
    quest.smallerDungeonsState = held;
    return held;
  }
  return null;
}

function getRandomBlock(borderBlock, dfLocation) {
  const filtered = dfLocation.dungeon.blocks.filter((b) => {
    const isBorder = /^b/i.test(b.blockName);
    return borderBlock ? isBorder : !isBorder;
  });
  if (filtered.length === 0) {
    throw new Error(`GetRandomBlock() failed to find a suitable block. borderBlock=${borderBlock}, location=${dfLocation.name}`);
  }
  return filtered[randomRange(0, filtered.length)];
}

function generateRdbBlock(x, z, borderBlock, startingBlock, dfLocation) {
  return { ...getRandomBlock(borderBlock, dfLocation), x, z, isStartingBlock: startingBlock };
}

function distinctInterior(layout, dfLocation) {
  const pool = dfLocation.dungeon.blocks.filter((b) => !/^b/i.test(b.blockName));
  const laid = new Set();
  let taken = false;
  for (let i = 0; i < layout.length; i++) {
    const b = layout[i];
    if (/^b/i.test(b.blockName)) continue;
    if (laid.has(b.blockName)) {
      const at = pool.findIndex((p) => p.blockName === b.blockName);
      for (let k = 1; k < pool.length; k++) {
        const other = pool[(at + k) % pool.length];
        if (laid.has(other.blockName)) continue;
        layout[i] = { ...other, x: b.x, z: b.z, isStartingBlock: b.isStartingBlock };
        taken = true;
        break;
      }
    }
    laid.add(layout[i].blockName);
  }
  return taken;
}

function laidAnew(dfLocation, threshold) {
  const blocks = dfLocation?.dungeon?.blocks;
  return !!blocks && blocks.length > threshold;
}
const SIZE_THRESHOLD = Object.freeze({ small: SMALLER_DUNGEON_THRESHOLD, medium: MEDIUM_DUNGEON_THRESHOLD });

function regenerateDungeon(dfLocation, threshold, rows, mark, member) {
  if (isMainStoryDungeon(dfLocation.mapTableData?.mapId)) {
    throw new Error(`${member}() must not be called on a main story dungeon.`);
  }
  if (!laidAnew(dfLocation, threshold)) return dfLocation;
  setSeed(dfLocation.mapTableData.mapId);
  const layout = rows.map(([x, z, border], i) => generateRdbBlock(x, z, border, i === 0, dfLocation));
  const distinct = distinctInterior(layout, dfLocation);
  return { ...dfLocation, dungeon: { ...dfLocation.dungeon, blocks: layout, [mark]: true, ...(distinct ? { distinct: true } : {}) } };
}

export function generateSmallerDungeon(dfLocation) {
  return regenerateDungeon(dfLocation, SMALLER_DUNGEON_THRESHOLD, SMALLER_LAYOUT, 'smaller', 'GenerateSmallerDungeon');
}

export function isSmallerDungeon(dfLocation) {
  return dfLocation?.dungeon?.smaller === true;
}

export function generateMediumDungeon(dfLocation) {
  return regenerateDungeon(dfLocation, MEDIUM_DUNGEON_THRESHOLD, MEDIUM_LAYOUT, 'medium', 'generateMediumDungeon');
}

export function isMediumDungeon(dfLocation) {
  return dfLocation?.dungeon?.medium === true;
}

export function builtDungeonSize(dfLocation) {
  if (isMediumDungeon(dfLocation)) return 'medium';
  return isSmallerDungeon(dfLocation) ? 'small' : 'full';
}

export function smallerDungeonsStamp(dfLocation) {
  if (isMediumDungeon(dfLocation)) return dfLocation.dungeon.distinct === true ? MEDIUM_DISTINCT_STAMP : MEDIUM_DUNGEONS_STATE;
  return isSmallerDungeon(dfLocation) ? SMALLER_DUNGEONS_STATE.Enabled : SMALLER_DUNGEONS_STATE.Disabled;
}

export function needsStartWarp(savedState, dfLocation) {
  if (!savedState) return false;
  if (isMainStoryDungeon(dfLocation?.mapTableData?.mapId)) return false;
  return savedState !== smallerDungeonsStamp(dfLocation);
}

export function dungeonLocationFor(dfLocation, deps = {}) {
  const size = dungeonSizeFor(dfLocation, deps);
  if (size === 'small') return generateSmallerDungeon(dfLocation);
  return size === 'medium' ? generateMediumDungeon(dfLocation) : dfLocation;
}

export function builtSizeFor(dfLocation, deps = {}) {
  const size = dungeonSizeFor(dfLocation, deps);
  return size !== 'full' && laidAnew(dfLocation, SIZE_THRESHOLD[size]) ? size : 'full';
}
