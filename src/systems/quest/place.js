// Port of the Daggerfall Unity quest Place. With a world, site resolution runs at parse time and throws where
// Daggerfall Unity throws; without one, sitePending stays true.

import { QuestResource, matchFirst } from './questResource.js';
import { Symbol as QuestSymbol } from './symbol.js';
import { intParse } from './parseUtils.js';
import { placesTable } from './tables.js';
import { mergeNamedBuildings, makeBuildingKey, blockBuildingCount } from '../../talk/talkTopics.js';
import { generateBuildingName } from '../../world/buildingNames.js';
import { surname, firstName, getNameBankOfRegion, GENDERS } from '../../characters/nameHelper.js';
import { localizedText, getLocalizedLocationName, getLocalizedRegionName } from '../../ui/textManager.js';
import { RDB_RESOURCE_TYPES } from '../../formats/blocksFile.js';
import { stampLayout, layoutStampOfMapId, recordStands, recordHeldBack, CLASSIC_LAYOUT } from '../../world/layoutPins.js';
import { curatedMarkerSpot, curateSiteMarkers } from './markerCuration.js';
import { cromwarkQuestSiteBlocked } from '../../world/wild/cromwarkSettlements.js';
import { cromwarkDoor } from '../../world/wild/cromwarkTowns.js';
import { questReachOn, questReachPixels, nearbyIndices, indicesWithin, mapTablePixel, mapPixelDistance } from './questReach.js';
import { longitudeLatitudeToMapPixel } from '../../formats/mapsFile.js';
import { stringHash } from '../../formats/netRuntime.js';
import { getSeed, setSeed } from '../../formats/dfRandom.js';
import { seededFirst } from '../../weather/wind.js';
import { isMainStoryDungeon } from '../../world/dungeonTextures.js';
import { wildMaskOf, wildInside } from '../../world/wildZone.js';
import { boundWorldDataBlocks } from '../../formats/worldDataReplacement.js';

const REMOTE_DUNGEON_DRAWS = 6;
export const Scopes = Object.freeze({ None: 'none', Local: 'local', Remote: 'remote', Fixed: 'fixed' });

export const SITE_TYPES = Object.freeze({ None: 0, Town: 1, Dungeon: 2, Building: 3 });

export const MARKER_TYPES = Object.freeze({ None: -1, QuestSpawn: 11, QuestItem: 18 });

export const MARKER_PREFERENCE = Object.freeze({ Default: 0, UseQuestMarker: 1, AnyMarker: 2 });

const EDITOR_FLAT_ARCHIVE = 199;
const SPAWN_MARKER_RECORD = 11;
const ITEM_MARKER_RECORD = 18;

// On a re-laid smaller or medium build, border blocks (names starting with B) are sealed caps.
// A dungeon Place there uses only the interior block markers while they hold any.
export const QUEST_CAP_BLOCK_RE = /^b/i;
export function questCapsSkipped(world, location) {
  const d = location?.dungeon;
  if (!d || (d.smaller !== true && d.medium !== true)) return false;
  for (const b of d.blocks ?? []) {
    if (QUEST_CAP_BLOCK_RE.test(b?.blockName ?? '')) continue;
    const blockData = world?.getBlock?.(b.blockName);
    for (const group of blockData?.rdbBlock?.objectRootList ?? []) {
      for (const obj of group?.rdbObjects ?? []) {
        if (obj?.type !== RDB_RESOURCE_TYPES.Flat) continue;
        const flat = obj.resources?.flatResource;
        if (flat?.textureArchive === EDITOR_FLAT_ARCHIVE && (flat.textureRecord === SPAWN_MARKER_RECORD || flat.textureRecord === ITEM_MARKER_RECORD)) return true;
      }
    }
  }
  return false;
}

export function dungeonQuestSpawnSpots(blocks) {
  const spots = [], inner = [];
  for (const b of blocks ?? []) {
    const cap = QUEST_CAP_BLOCK_RE.test(b?.name ?? '');
    for (const m of b?.layout?.markers ?? []) {
      if ((m.archive ?? EDITOR_FLAT_ARCHIVE) !== EDITOR_FLAT_ARCHIVE || m.record !== SPAWN_MARKER_RECORD) continue;
      const p = [m.x + b.originX, m.y, m.z + b.originZ];
      spots.push(p);
      if (!cap) inner.push(p);
    }
  }
  return inner.length ? inner : spots;
}

export const VALID_BUILDING_TYPES = Object.freeze([0, 2, 3, 5, 6, 8, 9, 11, 12, 13, 14, 15, 17, 18, 19, 20]);
export const VALID_HOUSE_TYPES = Object.freeze([17, 18, 19, 20]);
export const VALID_SHOP_TYPES = Object.freeze([0, 2, 5, 6, 7, 8, 9, 12, 13]);

const BT_GUILDHALL = 11, BT_TEMPLE = 14, BT_HOUSE1 = 17, BT_HOUSE4 = 20, BT_HOUSE6 = 22;
// A row's p3 ties these building types to a faction: the guild hall as in Daggerfall Unity, and also the temple.
const FACTION_HELD = Object.freeze([BT_GUILDHALL, BT_TEMPLE]);
export const BT_ANY_SHOP = 0xfffd, BT_ANY_HOUSE = 0xfffe, BT_ALL_VALID = 0xffff;

const THIEVES_GUILD_FACTION = 42;
const DARK_BROTHERHOOD_FACTION = 108;

const LT_DUNGEON_LABYRINTH = 4, LT_DUNGEON_KEEP = 7, LT_DUNGEON_RUIN = 10, LT_GRAVEYARD = 12;

const GLOBAL_SCALE = 0.025;

export const THE_NAMED_RESIDENCE = 'The %s Residence';

export function customParseInt(value) {
  if (/^0x/i.test(value)) {
    // As in C#, the prefix check ignores case but the removal does not, so 0X1A throws.
    const hex = value.replace('0x', '');
    if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error(`int.Parse failed on '${value}'`);
    return parseInt(hex, 16);
  }
  return intParse(value);
}

const isResidence = (buildingType) => buildingType >= BT_HOUSE1 && buildingType <= BT_HOUSE4;

const questLocationIndexCache = new WeakMap();
function findQuestLocation(maps, locationId) {
  let index = questLocationIndexCache.get(maps);
  if (!index) {
    index = new Map();
    for (let r = 0; r < maps.regionCount; r++) {
      const region = maps.getRegion(r);
      if (!region) continue;
      for (let l = 0; l < region.locationCount; l++) {
        const id = maps.readLocationIdFast(r, l);
        if (!index.has(id)) index.set(id, { regionIndex: r, locationIndex: l });
      }
    }
    questLocationIndexCache.set(maps, index);
  }
  const hit = index.get(locationId);
  return hit ? maps.getLocation(hit.regionIndex, hit.locationIndex) : null;
}

const DECL = [
  /(Place|place) (?<symbol>[a-zA-Z0-9_.-]+) (?<siteType>local|remote|permanent) (?<siteName>\w+)/,
  /(Place|place) (?<sym2>[a-zA-Z0-9_.-]+) (?<siteType2>randompermanent) (?<siteList>[a-zA-Z0-9_.,]+)/,
];

export class Place extends QuestResource {
  constructor(parentQuest, line = null, { nearTowns = true } = {}) {
    super(parentQuest);
    this.scope = Scopes.None;
    this.name = '';
    this.p1 = 0; this.p2 = 0; this.p3 = 0;
    this.siteDetails = null;
    this._die = null;
    this._nearTowns = nearTowns;
    this.sitePending = true;
    if (line !== null) this.setResource(line);
  }

  get isPlace() { return true; }

  setResource(line) {
    super.setResource(line);
    let randomSiteList = false;
    const match = matchFirst(line, DECL);
    if (!match) return;
    const g = match.groups;
    this.symbol = new QuestSymbol(g.symbol ?? g.sym2);
    const siteType = g.siteType ?? g.siteType2;
    if (/^local$/i.test(siteType)) this.scope = Scopes.Local;
    else if (/^remote$/i.test(siteType)) this.scope = Scopes.Remote;
    else if (/^permanent$/i.test(siteType)) this.scope = Scopes.Fixed;
    else if (/^randompermanent$/i.test(siteType)) { this.scope = Scopes.Fixed; randomSiteList = true; }
    else throw new Error(`Place found no site type match found for source: '${line}'. Must be local|remote|permanent.`);

    this.name = g.siteName ?? '';
    if (!this.name && !randomSiteList) throw new Error(`Place site name empty for source: '${line}'`);

    if (randomSiteList) {
      const siteNames = g.siteList.split(',');
      if (!siteNames.length) throw new Error(`Place randompermanent must have at least one site name in source: '${line}'`);
      const roll = this.parentQuest?.rolls ?? Math.random;
      this.name = siteNames[Math.floor(roll() * siteNames.length)];
    }

    const table = placesTable();
    if (!table.hasValue(this.name)) throw new Error(`Could not find place name in data table: '${this.name}'`);
    this.p1 = customParseInt(table.getValue('p1', this.name));
    this.p2 = customParseInt(table.getValue('p2', this.name));
    this.p3 = customParseInt(table.getValue('p3', this.name));

    const valid = this.scope === Scopes.Local || this.scope === Scopes.Remote
      || (this.scope === Scopes.Fixed && this.p1 > 0x300);
    if (!valid) throw new Error('Invalid placeType in line: ' + line);

    const world = this.parentQuest?.hooks?.world;
    if (!world) return;
    if (this.scope === Scopes.Local) this._setupLocalSite(world, line);
    else if (this.scope === Scopes.Remote) this._setupRemoteSite(world, line);
    else this._setupFixedLocation(world);
    this.sitePending = false;
    this._stampSiteLayout();
  }

  // A building key is valid only in the layout of its town, so a building site keeps that layout stamp.
  _stampSiteLayout() {
    const sd = this.siteDetails;
    if (sd?.siteType === SITE_TYPES.Building && sd.buildingKey > 0) stampLayout(sd, layoutStampOfMapId(sd.mapId));
  }

  // In a town now laid out differently, the key names another building, so the site is chosen again by its own law.
  // With no building of its kind it is unseated, keeping its record, until that layout returns.
  reseatMovedSite(world) {
    // A shared copy chooses by one die per share and Place, so every copy lands on the same building and marker.
    const shareId = this.parentQuest?.shareId;
    if (!shareId || !this.parentQuest.hooks?.sharedCopy?.(this.parentQuest)) return this._reseatMovedSite(world);
    let n = 0;
    this._die = () => seededFirst(stringHash(`${shareId}|reseat|${this.symbol?.name ?? ''}|${n++}`));
    try { return this._reseatMovedSite(world); } finally { this._die = null; }
  }
  _reseatMovedSite(world) {
    const sd = this.siteDetails;
    if (sd?.siteType === SITE_TYPES.Dungeon) return this._reseatStoryDungeon(world);
    if (sd?.siteType !== SITE_TYPES.Building) return false;
    const held = sd.unseated ? { ...sd, ...sd.unseated } : sd;
    if (!(held.buildingKey > 0)) return false;
    if (recordStands(held)) return sd.unseated ? this._seatBack(held) : false;
    // A town laid out differently for this session only leaves the record unseated and never restamps it.
    if (recordHeldBack(held)) return this._unseat(held);
    // A Place minted where the player stood has no P1 to P3 law, so it is unseated, never left on its old key.
    // Questors are seated first, so a hall has already moved with its questor.
    if (this.scope === Scopes.None) return this._unseat(held);
    const location = this.siteTown(world);
    if (!location) return false;
    // Uses the declared P2 and P3, never the -1 the house fallback writes, which would read as random.
    let { p2, p3 } = this.declaredSiteLaw();
    let { found } = this._searchTownSites(world, location, p2, p3);
    if (!found.length && this.scope === Scopes.Local && this.isPersonHome() && !(p2 === -1 && p3 === 1)) {
      [p2, p3] = [-1, 1];
      ({ found } = this._searchTownSites(world, location, p2, p3));
    }
    let nearSite = false;
    if (!found.length && this.scope === Scopes.Local && this._modsTookKind(world, location, p2, p3)) { found = this._nearTownSites(world, location, p2, p3)?.found ?? []; nearSite = found.length > 0; }
    const named = held.buildingName ? found.find((f) => f.buildingName === held.buildingName) ?? null : null;
    const next = found.length ? this._carryAssignments(held, named ?? found[this._range(found.length)]) : null;
    if (!next) return this._unseat(held);
    this.siteDetails = { ...next, questUID: held.questUID ?? next.questUID, magicNumberIndex: held.magicNumberIndex ?? 0, ...(nearSite ? { nearSite: true } : {}) };
    this._stampSiteLayout();
    return true;
  }

  // A building site that became another player's home before this player reached it is chosen again in its town.
  // Reached sites, sites with no law, and sites in another layout stay.
  repickHomedSite(world) {
    const sd = this.siteDetails;
    if (this.scope === Scopes.None || sd?.siteType !== SITE_TYPES.Building || !(sd.buildingKey > 0) || sd.unseated || sd.reached) return false;
    if (!world?.isPlayerHome?.(sd.mapId, sd.buildingKey) || !recordStands(sd)) return false;
    const shareId = this.parentQuest?.shareId;
    if (!shareId || !this.parentQuest.hooks?.sharedCopy?.(this.parentQuest)) return this._repickHomedSite(world);
    let n = 0;
    this._die = () => seededFirst(stringHash(`${shareId}|homed|${this.symbol?.name ?? ''}|${sd.buildingKey}|${n++}`));
    try { return this._repickHomedSite(world); } finally { this._die = null; }
  }
  _repickHomedSite(world) {
    const sd = this.siteDetails;
    const location = this.siteTown(world);
    if (!location) return false;
    let { p2, p3 } = this.declaredSiteLaw();
    let { found } = this._searchTownSites(world, location, p2, p3);
    if (!found.length && this.isPersonHome() && !(p2 === -1 && p3 === 1)) {
      [p2, p3] = [-1, 1];
      ({ found } = this._searchTownSites(world, location, p2, p3));
    }
    const next = found.length ? this._carryAssignments(sd, found[this._range(found.length)]) : null;
    if (!next) return false;
    this.siteDetails = { ...next, questUID: sd.questUID ?? next.questUID, magicNumberIndex: sd.magicNumberIndex ?? 0, ...(sd.nearSite ? { nearSite: true } : {}) };
    this._stampSiteLayout();
    return true;
  }

  // A saved remote dungeon site in a main story dungeon, or in the sealed open zone, is drawn again in its region.
  _reseatStoryDungeon(world) {
    const sd = this.siteDetails;
    if ((this.scope !== Scopes.Remote && this.scope !== Scopes.Local) || this.p1 !== 1) return false;
    const row = world.maps.getRegion(sd.regionIndex)?.mapTable?.find?.((t) => t?.mapId === sd.mapId) ?? null;
    if (!isMainStoryDungeon(sd.mapId) && !(row && this._zoneSeal(world)?.(row))) return false;
    const { p2 } = this.declaredSiteLaw();
    const origin = row ? mapTablePixel(row) : null;
    const site = this._remoteDungeonSite(world, sd.regionIndex, p2, { origin }) ?? this._remoteDungeonSite(world, sd.regionIndex, -1, { origin });
    const next = site ? this._carryAssignments(sd, site) : null;
    if (!next) return false;
    this.siteDetails = { ...next, questUID: sd.questUID ?? next.questUID, magicNumberIndex: sd.magicNumberIndex ?? 0 };
    for (const task of this.parentQuest?.tasks?.values?.() ?? []) {
      for (const a of task?.actions ?? []) {
        if (a?.typeName !== 'RevealLocation' || !a.isComplete || a.placeSymbol?.name !== this.symbol?.name) continue;
        // The reveal is best effort: a name the world cannot resolve throws, and the site has moved either way.
        try { world.discoverLocation?.(next.regionName, next.locationName); } catch { }
      }
    }
    return true;
  }
  // A site drawn again is enumerated before its link moves, so this enumerates it again on the dungeon built now.
  fitSiteToBuild(world) {
    const sd = this.siteDetails;
    if (sd?.siteType !== SITE_TYPES.Dungeon) return false;
    const index = world?.maps?.getRegion?.(sd.regionIndex)?.mapNameLookup?.get?.(sd.locationName);
    const location = index == null ? null : world.maps.getLocation(sd.regionIndex, index);
    if (!location?.dungeon?.blocks) return false;
    const { questSpawnMarkers, questItemMarkers } = this._enumerateDungeonQuestMarkers(world, location);
    const at = (list) => (list ?? []).map((m) => `${m?.dungeonX},${m?.dungeonZ},${m?.markerID}`).join(';');
    if (at(questSpawnMarkers) === at(sd.questSpawnMarkers) && at(questItemMarkers) === at(sd.questItemMarkers)) return false;
    const next = this._carryAssignments(sd, { ...sd, questSpawnMarkers, questItemMarkers });
    if (!next) return false;
    this.siteDetails = { ...next, questUID: sd.questUID, magicNumberIndex: sd.magicNumberIndex ?? 0 };
    return true;
  }

  _unseat(held) {
    if (this.siteDetails.unseated) return false;
    const { layout, ...record } = held;
    this.siteDetails = { ...record, buildingKey: 0, unseated: { buildingKey: held.buildingKey, ...(layout ? { layout } : {}) } };
    return true;
  }
  _seatBack(held) {
    const { unseated: _was, ...record } = held;
    this.siteDetails = record;
    return true;
  }

  mendCuratedMarkers(world) {
    const sd = this.siteDetails;
    if (sd?.siteType !== SITE_TYPES.Building || !(sd.buildingKey > 0) || !recordStands(sd)) return 0;
    const location = this.siteTown(world);
    if (!location) return 0;
    const key = sd.buildingKey;
    const name = world.maps?.getRmbBlockName?.(location, (key >> 16) & 0xff, (key >> 8) & 0xff);
    const dfBlock = name ? world.getBlock?.(name) : null;
    return dfBlock ? curateSiteMarkers(sd, dfBlock, key & 0xff) : 0;
  }

  // The assignments move, never the markers, because a marker position is in the interior frame of its building.
  // keepSelected keeps the selected marker only where it has a spot.
  _carryAssignments(sd, next, { keepSelected = false } = {}) {
    const fresh = (list) => (list ?? []).map((m) => ({ ...m, targetResources: null }));
    const spawn = fresh(next.questSpawnMarkers), item = fresh(next.questItemMarkers);
    if (!validateQuestMarkers(spawn, item)) return null;
    let selectedMarker = { ...next.selectedMarker, targetResources: null };
    const standing = keepSelected && !!next.selectedMarker?.flatPosition;
    const select = (type) => {
      if (standing) { selectedMarker.targetResources ??= []; return; }
      const own = type === MARKER_TYPES.QuestItem ? item : spawn;
      const pool = own.length ? own : (own === item ? spawn : item);
      selectedMarker = { ...pool[this._range(pool.length)], targetResources: [] };
    };
    if (sd.selectedMarker?.targetResources) {
      select(sd.selectedMarker.markerType);
      for (const s of sd.selectedMarker.targetResources) assignResourceToMarker(s, selectedMarker);
    }
    const carry = (from, to, type) => (from ?? []).forEach((m, i) => {
      for (const s of m?.targetResources ?? []) {
        if (to[i]) { assignResourceToMarker(s, to[i]); continue; }
        if (!selectedMarker.targetResources) select(type);
        assignResourceToMarker(s, selectedMarker);
      }
    });
    carry(sd.questSpawnMarkers, spawn, MARKER_TYPES.QuestSpawn);
    carry(sd.questItemMarkers, item, MARKER_TYPES.QuestItem);
    return { ...next, questSpawnMarkers: spawn.length ? spawn : null, questItemMarkers: item.length ? item : null, selectedMarker };
  }

  // Where the partner site names no building here but this copy's own site does, the building stays this copy's.
  // Only the assignments come from the partner.
  keepOwnSite(own) {
    const sd = this.siteDetails;
    if (sd?.siteType !== SITE_TYPES.Building || own?.siteType !== SITE_TYPES.Building) return false;
    const held = sd.unseated ? { ...sd, ...sd.unseated } : sd;
    if (!(held.buildingKey > 0) || recordStands(held)) return false;
    if (!(own.buildingKey > 0) || own.unseated || own.mapId !== held.mapId || !recordStands(own)) return false;
    const kept = this._carryAssignments(sd, own, { keepSelected: true });
    if (!kept) return false;
    this.siteDetails = { ...kept, questUID: sd.questUID ?? own.questUID };
    return true;
  }

  _rolls() { return this._die ?? this.parentQuest?.rolls ?? Math.random; }
  _range(n) { return n > 0 ? Math.floor(this._rolls()() * n) : 0; }

  _setupLocalSite(world, line) {
    if (this.p1 === 1) { this._setupRemoteSite(world, line); return; }

    const location = world.currentLocation?.();
    if (!location?.loaded) throw new Error('Tried to setup a local site but player is not in a location (i.e. player in wilderness).');

    const asked = { p2: this.p2, p3: this.p3 };
    const { found: foundSites, houseFallback } = this._searchTownSites(world, location, this.p2, this.p3);
    if (houseFallback) this.p2 = -1;
    if (!foundSites.length) {
      const near = this._nearTowns && this._modsTookKind(world, location, asked.p2, asked.p3) ? this._nearTownSites(world, location, asked.p2, asked.p3) : null;
      if (near) {
        this.p2 = near.houseFallback ? -1 : asked.p2;
        this.siteDetails = { ...near.found[this._range(near.found.length)], nearSite: true };
        return;
      }
      throw new Error(`Could not find local site for ${this.symbol.original} with P2=${this.p2} in ${location.regionName}/${location.name}.`);
    }
    this.siteDetails = foundSites[this._range(foundSites.length)];
  }

  // Where the town mods took a kind away, a local site with no building of that kind uses the nearest such town.
  _nearTownSites(world, location, p2, p3) {
    const mapId = location?.mapTableData?.mapId;
    const origin = mapTablePixel(location?.mapTableData);
    if (!mapId || !origin) return null;
    const named = p2 >= 0 && !(p2 >= BT_HOUSE1 && p2 <= BT_HOUSE6);
    const towns = [];
    for (let r = 0; r < (world.maps?.regionCount ?? 0); r++) {
      const regionData = world.maps.getRegion?.(r);
      for (let i = 0; i < (regionData?.locationCount ?? 0); i++) {
        const entry = regionData.mapTable[i];
        if (cromwarkQuestSiteBlocked(entry?.mapId)) continue;
        if (!entry || entry.mapId === mapId || this._isDungeonType(entry.locationType)) continue;
        const px = mapTablePixel(entry);
        if (px) towns.push([r, i, mapPixelDistance(px, origin)]);
      }
    }
    towns.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
    for (const [r, i] of towns) {
      const near = world.maps.getLocation(r, i);
      if (!near?.loaded || (named && !this._hasBuildingType(near, p2))) continue;
      const { found, houseFallback } = this._searchTownSites(world, near, p2, p3);
      if (found.length) return { found, houseFallback };
    }
    return null;
  }

  // True only where the modded layout offers fewer such buildings than the classic layout of the same town.
  // A town with no classic record keeps the Daggerfall Unity rule.
  _modsTookKind(world, location, p2, p3) {
    const mapId = location?.mapTableData?.mapId;
    if (!mapId || layoutStampOfMapId(mapId) === CLASSIC_LAYOUT) return false;
    const own = world.maps?.readClassicLocation?.(location.regionIndex, location.locationIndex);
    if (!own?.loaded || !own.exterior?.exteriorData) return false;
    return this._siteSupply(own, classicBlockGrid(own), p2, p3) > this._siteSupply(location, townBlockGrid(world, location), p2, p3);
  }

  _siteSupply(location, blocks, p2, p3, atLeast = Infinity) {
    let kind = p2;
    if (p2 >= BT_HOUSE1 && p2 <= BT_HOUSE6) kind = BT_ANY_HOUSE;
    else if (p2 === -1 && p3 === 0) kind = BT_ALL_VALID;
    else if (p2 === -1 && p3 === 1) kind = BT_ANY_HOUSE;
    else if (p2 === -1 && p3 === 2) kind = BT_ANY_SHOP;
    let n = 0;
    for (const { b, i } of this._townBuildingsOfType(location, blocks, kind, p3)) {
      const { questSpawnMarkers, questItemMarkers } = this._enumerateBuildingQuestMarkers(b.dfBlock, i);
      if (validateQuestMarkers(questSpawnMarkers, questItemMarkers) && ++n >= atLeast) break;
    }
    return n;
  }

  isPersonHome() {
    for (const r of this.parentQuest?.resources?.values() ?? []) if (r.isPerson && r.homePlaceSymbol?.name === this.symbol?.name) return true;
    return false;
  }

  _searchTownSites(world, location, p2, p3) {
    let found;
    if (p2 === -1 && p3 === 0) found = this._collectQuestSitesOfBuildingType(world, location, BT_ALL_VALID, p3);
    else if (p2 === -1 && p3 === 1) found = this._collectQuestSitesOfBuildingType(world, location, BT_ANY_HOUSE, p3);
    else if (p2 === -1 && p3 === 2) found = this._collectQuestSitesOfBuildingType(world, location, BT_ANY_SHOP, p3);
    else found = this._collectQuestSitesOfBuildingType(world, location, p2, p3);
    if (!found.length && p2 >= BT_HOUSE1 && p2 <= BT_HOUSE6) {
      return { found: this._collectQuestSitesOfBuildingType(world, location, BT_ANY_HOUSE, p3), houseFallback: true };
    }
    return { found, houseFallback: false };
  }

  // The house fallback writes p2 = -1, which reads as random with a p3 of 0, so the declared row is read again.
  declaredSiteLaw() {
    const table = placesTable();
    if (!this.name || !table.hasValue(this.name)) return { p2: this.p2, p3: this.p3 };
    return { p2: customParseInt(table.getValue('p2', this.name)), p3: customParseInt(table.getValue('p3', this.name)) };
  }

  _setupRemoteSite(world, line) {
    let result = false;
    switch (this.p1) {
      case 0: result = this._selectRemoteTownSite(world, this.p2); break;
      case 1: result = this._selectRemoteDungeonSite(world, this.p2); break;
      case 2: result = this._selectRemoteLocationExteriorSite(world, this.p2); break;
      default: throw new Error(`An unknown P1 value of ${this.p1} was encountered for Place ${this.symbol.original}`);
    }
    if (!result && this.p1 === 1) result = this._selectRemoteDungeonSite(world, -1);
    if (!result && this.p1 === 0 && this._nearTowns) result = this._nearRegionTownSite(world, this.p2);
    if (!result) {
      throw new Error(`Search failed to locate matching remote site for Place ${this.symbol.original} in region ${world.currentRegionName?.() ?? world.currentRegionIndex?.()}. Resource source: '${line}'`);
    }
  }

  _selectRemoteTownSite(world, requiredBuildingType) {
    const maxAttemptsBeforeFallback = 250;
    const maxAttemptsBeforeFailure = 500;
    const regionIndex = world.currentRegionIndex();
    const regionData = world.maps.getRegion(regionIndex);
    const playerLocationIndex = world.currentLocationIndex?.() ?? -1;
    if (!regionData || regionData.locationCount === 0) return false;

    // Towns within the reach are tried first, then within twice the reach, and only then the darts over the region.
    const reach = this._questReach(world);
    if (reach) {
      const towns = [];
      for (let i = 0; i < regionData.locationCount; i++) {
        if (i !== playerLocationIndex && !cromwarkQuestSiteBlocked(regionData.mapTable[i].mapId) && !this._isDungeonType(regionData.mapTable[i].locationType)) towns.push(i);
      }
      const pools = [reach.pixels, reach.pixels * 2].map((r) => indicesWithin(regionData, towns, reach.origin, r));
      const measured = pools.slice(0, pools.indexOf(null) === -1 ? pools.length : pools.indexOf(null));
      for (const pool of measured) if (this._tryTownPool(world, regionIndex, regionData, pool, requiredBuildingType)) return true;
      if (requiredBuildingType >= BT_HOUSE1 && requiredBuildingType <= BT_HOUSE6) {
        requiredBuildingType = BT_ANY_HOUSE; this.p2 = -1;
        for (const pool of measured) if (this._tryTownPool(world, regionIndex, regionData, pool, requiredBuildingType)) return true;
      }
    }

    let attempts = 0;
    let found = false;
    while (!found) {
      if (++attempts >= maxAttemptsBeforeFallback
        && requiredBuildingType >= BT_HOUSE1 && requiredBuildingType <= BT_HOUSE6) {
        requiredBuildingType = BT_ANY_HOUSE;
        this.p2 = -1;
      }
      if (attempts >= maxAttemptsBeforeFailure) {
        console.warn(`[quest] Could not find remote town site with building type ${requiredBuildingType} within ${attempts} attempts`);
        break;
      }
      const locationIndex = this._range(regionData.locationCount);
      if (locationIndex === playerLocationIndex || cromwarkQuestSiteBlocked(regionData.mapTable[locationIndex].mapId)) continue;
      if (this._isDungeonType(regionData.mapTable[locationIndex].locationType)) continue;
      found = this._tryTownLocation(world, regionIndex, locationIndex, requiredBuildingType);
    }
    return found;
  }

  // Where the mods took a kind from the region, the site uses the nearest town in the region, then in any region.
  _nearRegionTownSite(world, requiredBuildingType) {
    const regionIndex = world.currentRegionIndex?.();
    if (!this._modsTookKindFromRegion(world, regionIndex, requiredBuildingType)) return false;
    let origin = world.playerPixel?.() ?? null;
    if (!origin) origin = mapTablePixel(world.currentLocation?.()?.mapTableData);
    if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return false;
    const playerLocationIndex = world.currentLocationIndex?.() ?? -1;
    const nearestOf = (regions) => {
      const towns = [];
      for (const r of regions) {
        const region = world.maps.getRegion(r);
        for (let i = 0; i < (region?.locationCount ?? 0); i++) {
          const entry = region.mapTable[i];
          if (cromwarkQuestSiteBlocked(entry?.mapId)) continue;
          if (!entry || this._isDungeonType(entry.locationType) || (r === regionIndex && i === playerLocationIndex)) continue;
          const px = mapTablePixel(entry);
          if (px) towns.push([r, i, mapPixelDistance(px, origin)]);
        }
      }
      return towns.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
    };
    for (const [r, i] of nearestOf([regionIndex])) if (this._tryTownLocation(world, r, i, requiredBuildingType)) return true;
    const others = [];
    for (let r = 0; r < (world.maps.regionCount ?? 0); r++) if (r !== regionIndex) others.push(r);
    for (const [r, i] of nearestOf(others)) if (this._tryTownLocation(world, r, i, requiredBuildingType)) return true;
    return false;
  }

  // A town counts only where a dart would find a site, never by its directory alone, since some modded towns still
  // list a kind they lay none of.
  _modsTookKindFromRegion(world, regionIndex, requiredBuildingType) {
    const region = world.maps?.getRegion?.(regionIndex);
    if (!region || !world.maps.readClassicLocation) return false;
    const playerLocationIndex = world.currentLocationIndex?.() ?? -1;
    const wildcard = this.p2 === -1 && (this.p3 === 0 || this.p3 === 1);
    const gives = (loc, blocksOf) => !!loc?.loaded && !!loc.exterior?.exteriorData
      && (wildcard || this._hasBuildingType(loc, requiredBuildingType))
      && this._siteSupply(loc, blocksOf(loc), this.p2, this.p3, 1) > 0;
    const towns = [];
    for (let i = 0; i < region.locationCount; i++) {
      const entry = region.mapTable[i];
      if (cromwarkQuestSiteBlocked(entry?.mapId)) continue;
      if (entry && i !== playerLocationIndex && !this._isDungeonType(entry.locationType)) towns.push(i);
    }
    let own = 0;
    for (const i of towns) if (gives(world.maps.readClassicLocation(regionIndex, i), classicBlockGrid)) own++;
    if (!own) return false;
    let now = 0;
    for (const i of towns) if (gives(world.maps.getLocation(regionIndex, i), (loc) => townBlockGrid(world, loc)) && ++now >= own) return false;
    return true;
  }

  _tryTownLocation(world, regionIndex, locationIndex, requiredBuildingType) {
    const location = world.maps.getLocation(regionIndex, locationIndex);
    if (!location?.loaded) return false;

    let foundSites;
    // The house fallback asks for any house, because p2 -1 with p3 0 would read as random and take any building.
    if (requiredBuildingType === BT_ANY_HOUSE) foundSites = this._collectQuestSitesOfBuildingType(world, location, BT_ANY_HOUSE, this.p3);
    else if (this.p2 === -1 && this.p3 === 0) foundSites = this._collectQuestSitesOfBuildingType(world, location, BT_ALL_VALID, this.p3);
    else if (this.p2 === -1 && this.p3 === 1) foundSites = this._collectQuestSitesOfBuildingType(world, location, BT_ANY_HOUSE, this.p3);
    else {
      if (!this._hasBuildingType(location, requiredBuildingType)) return false;
      foundSites = this._collectQuestSitesOfBuildingType(world, location, this.p2, this.p3);
    }
    if (!foundSites.length) return false;
    this.siteDetails = foundSites[this._range(foundSites.length)];
    return true;
  }

  _tryTownPool(world, regionIndex, regionData, pool, requiredBuildingType) {
    const order = pool.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = this._range(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    for (const locationIndex of order) if (this._tryTownLocation(world, regionIndex, locationIndex, requiredBuildingType)) return true;
    return false;
  }

  _questReach(world) {
    if (!questReachOn()) return null;
    let origin = world.playerPixel?.() ?? null;
    if (!origin) {
      const t = world.currentLocation?.()?.mapTableData;
      if (t) origin = longitudeLatitudeToMapPixel(t.longitude, t.latitude);
    }
    if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return null;
    return { origin, pixels: questReachPixels(this.parentQuest?.hooks?.playerLevel?.() ?? 1) };
  }

  _selectRemoteDungeonSite(world, dungeonTypeIndex) {
    const site = this._remoteDungeonSite(world, world.currentRegionIndex(), dungeonTypeIndex);
    if (!site) return false;
    this.siteDetails = site;
    return true;
  }
  _remoteDungeonSite(world, regionIndex, dungeonTypeIndex, { origin = null } = {}) {
    const regionData = world.maps.getRegion(regionIndex);
    if (!regionData || regionData.locationCount === 0) return null;

    let foundIndices = this._collectDungeonIndicesOfType(regionData, dungeonTypeIndex, false, this._zoneSeal(world));
    if (!foundIndices.length) return null;
    const reach = origin ? { origin, pixels: 0 } : this._questReach(world);
    if (reach) foundIndices = nearbyIndices(regionData, foundIndices, reach.origin, reach.pixels);
    // A drawn dungeon whose build holds no quest marker is set aside and another drawn, a few times at most.
    let location = null, questSpawnMarkers = null, questItemMarkers = null;
    const pool = foundIndices.slice();
    for (let tries = 0; pool.length && tries < REMOTE_DUNGEON_DRAWS; tries++) {
      const [drawn] = pool.splice(this._range(pool.length), 1);
      const at = world.maps.getLocation(regionIndex, drawn);
      if (!at?.loaded) return null;
      ({ questSpawnMarkers, questItemMarkers } = this._enumerateDungeonQuestMarkers(world, at));
      if (validateQuestMarkers(questSpawnMarkers, questItemMarkers)) { location = at; break; }
    }
    if (!location) return null;

    return {
      questUID: this.parentQuest?.uid ?? 0,
      siteType: SITE_TYPES.Dungeon,
      mapId: location.mapTableData.mapId,
      locationId: location.exterior.exteriorData.locationId,
      regionIndex: location.regionIndex,
      regionName: location.regionName,
      locationName: location.name,
      buildingKey: 0, buildingName: null, magicNumberIndex: 0,
      questSpawnMarkers, questItemMarkers,
      selectedMarker: { targetResources: null },
    };
  }

  _selectRemoteLocationExteriorSite(world, locationTypeIndex) {
    const regionIndex = world.currentRegionIndex();
    const regionData = world.maps.getRegion(regionIndex);
    if (!regionData || regionData.locationCount === 0) return false;
    let foundIndices = [];
    for (let i = 0; i < regionData.locationCount; i++) {
      if (!cromwarkQuestSiteBlocked(regionData.mapTable[i].mapId) && (locationTypeIndex === -1 || regionData.mapTable[i].locationType === locationTypeIndex)) foundIndices.push(i);
    }
    if (!foundIndices.length) return false;
    const reach = this._questReach(world);
    if (reach) foundIndices = nearbyIndices(regionData, foundIndices, reach.origin, reach.pixels);
    const location = world.maps.getLocation(regionIndex, foundIndices[this._range(foundIndices.length)]);
    if (!location?.loaded) return false;
    this.siteDetails = {
      questUID: this.parentQuest?.uid ?? 0,
      siteType: SITE_TYPES.Town,
      mapId: location.mapTableData.mapId,
      locationId: location.exterior.exteriorData.locationId,
      regionIndex: location.regionIndex,
      regionName: location.regionName,
      locationName: location.name,
      buildingKey: 0, buildingName: null, magicNumberIndex: 0,
      questSpawnMarkers: null, questItemMarkers: null,
      selectedMarker: { targetResources: null },
    };
    return true;
  }

  _setupFixedLocation(world) {
    let buildingKey = 0;
    let siteType;
    let location = findQuestLocation(world.maps, this.p1);
    if (!location) {
      location = findQuestLocation(world.maps, this.p1 - 1);
      if (!location) throw new Error(`Could not find locationId from p1 using: '${this.p1}' or '${this.p1 - 1}'`);
      siteType = location.hasDungeon ? SITE_TYPES.Dungeon : SITE_TYPES.Building;
    } else if (this.p1 === 50000) {
      siteType = SITE_TYPES.Dungeon;
    } else {
      siteType = SITE_TYPES.Town;
    }

    let questSpawnMarkers = null, questItemMarkers = null;
    if (siteType === SITE_TYPES.Dungeon) {
      ({ questSpawnMarkers, questItemMarkers } = this._enumerateDungeonQuestMarkers(world, location));
      if (this.p1 === 50000) {
        if (!questSpawnMarkers?.length) throw new Error('Could not find spawn marker in MantellanCrux');
      } else if (!validateQuestMarkers(questSpawnMarkers, questItemMarkers)) {
        throw new Error(`Could not find any quest markers in random dungeon ${location.name}`);
      }
    } else if (siteType === SITE_TYPES.Building) {
      for (const locBuilding of location.exterior.buildings) {
        if (locBuilding.locationId !== this.p1) continue;
        const blockName = location.exterior.exteriorData.blockNames[locBuilding.sector];
        const blockData = world.getBlock(blockName);
        if (blockData) {
          const width = location.exterior.exteriorData.width;
          const x = locBuilding.sector % width;
          const y = Math.trunc(locBuilding.sector / width);
          const list = blockData.rmbBlock.fldHeader.buildingDataList;
          for (let recordIndex = 0; recordIndex < list.length; recordIndex++) {
            if (list[recordIndex].locationId === locBuilding.locationId) {
              ({ questSpawnMarkers, questItemMarkers } = this._enumerateBuildingQuestMarkers(blockData, recordIndex));
              buildingKey = makeBuildingKey(x, y, recordIndex);
            }
          }
        }
        break;
      }
    }

    let magicNumberIndex = 0;
    if (siteType === SITE_TYPES.Dungeon && (this.p2 >> 8) === 0xfa) magicNumberIndex = this.p2 & 0xff;

    this.siteDetails = {
      questUID: this.parentQuest?.uid ?? 0,
      siteType,
      mapId: location.mapTableData.mapId,
      locationId: location.exterior.exteriorData.locationId,
      regionIndex: location.regionIndex,
      regionName: location.regionName,
      locationName: location.name,
      buildingKey, buildingName: null, magicNumberIndex,
      questSpawnMarkers, questItemMarkers,
      selectedMarker: { targetResources: null },
    };
  }

  _isDungeonType(locationType) {
    return locationType === LT_DUNGEON_KEEP || locationType === LT_DUNGEON_LABYRINTH
      || locationType === LT_DUNGEON_RUIN || locationType === LT_GRAVEYARD;
  }

  siteTown(world) {
    const sd = this.siteDetails;
    const index = world?.maps?.getRegion?.(sd?.regionIndex)?.mapNameLookup?.get?.(sd?.locationName);
    const location = index == null ? null : world.maps.getLocation(sd.regionIndex, index);
    return location?.exterior?.exteriorData ? location : null;
  }

  siteBuilding(world) {
    const sd = this.siteDetails;
    const location = sd?.siteType === SITE_TYPES.Building && sd.buildingKey > 0 ? this.siteTown(world) : null;
    if (!location) return null;
    const blocks = townBlockGrid(world, location);
    const merged = mergeNamedBuildings(location.exterior.buildings, blocks.filter((b) => b.dfBlock), { locationIndex: location.locationIndex ?? 0 });
    for (const b of blocks) {
      if (!b.dfBlock) continue;
      const list = merged.get(b) ?? [];
      const count = Math.min(list.length, blockBuildingCount(b.dfBlock) ?? list.length);
      for (let i = 0; i < count; i++) if (makeBuildingKey(b.x, b.y, i) === sd.buildingKey) return { ...list[i], buildingKey: sd.buildingKey };
    }
    return null;
  }

  // A building site saved without a name is named again from its building, and the DFRandom state is put back.
  nameSiteAgain(world) {
    const sd = this.siteDetails;
    if (sd?.siteType !== SITE_TYPES.Building || sd.buildingName !== '' || !recordStands(sd)) return false;
    const b = this.siteBuilding(world);
    if (!b || isResidence(b.buildingType)) return false;
    const was = getSeed();
    let name;
    try { name = this._getBuildingName(world, b.buildingType, this.siteTown(world), b, sd.buildingKey); } finally { setSeed(was); }
    if (!name) return false;
    sd.buildingName = name;
    return true;
  }

  _collectQuestSitesOfBuildingType(world, location, buildingType, guildHallFaction) {
    const foundSites = [];
    const activeQuestSites = this.parentQuest?.hooks?.getAllActiveQuestSites?.() ?? [];
    const parentQuestPlaces = [...(this.parentQuest?.resources.values() ?? [])].filter((r) => r.isPlace && r !== this);

    for (const { b, i, summary, buildingKey } of this._townBuildingsOfType(location, townBlockGrid(world, location), buildingType, guildHallFaction)) {
      if (world.isHouseOwned?.(buildingKey)) continue;
      if (world.isPlayerHome?.(location.mapTableData?.mapId, buildingKey)) continue;
      if (this._isBuildingAssigned(activeQuestSites, parentQuestPlaces, location, summary, buildingKey)) continue;
      if (cromwarkDoor(world.maps, location, b.dfBlock.index, i) === 'boarded') continue;

      const { questSpawnMarkers, questItemMarkers } = this._enumerateBuildingQuestMarkers(b.dfBlock, i);
      if (!validateQuestMarkers(questSpawnMarkers, questItemMarkers)) continue;

      foundSites.push({
        questUID: this.parentQuest?.uid ?? 0,
        siteType: SITE_TYPES.Building,
        mapId: location.mapTableData.mapId,
        locationId: location.exterior.exteriorData.locationId,
        regionIndex: location.regionIndex,
        regionName: location.regionName,
        locationName: location.name,
        buildingKey,
        buildingName: this._getBuildingName(world, summary.buildingType, location, summary, buildingKey),
        magicNumberIndex: 0,
        questSpawnMarkers, questItemMarkers,
        selectedMarker: { targetResources: null },
      });
    }
    return foundSites;
  }

  *_townBuildingsOfType(location, blocks, buildingType, guildHallFaction) {
    const merged = mergeNamedBuildings(location.exterior.buildings, blocks.filter((b) => b.dfBlock), { locationIndex: location.locationIndex ?? 0 });
    for (const b of blocks) {
      if (!b.dfBlock) continue;
      const list = merged.get(b) ?? [];
      const count = Math.min(list.length, blockBuildingCount(b.dfBlock) ?? list.length);
      for (let i = 0; i < count; i++) {
        const summary = list[i];
        let wildcardFound = false;
        if (buildingType === BT_ALL_VALID) wildcardFound = VALID_BUILDING_TYPES.includes(summary.buildingType);
        else if (buildingType === BT_ANY_HOUSE) wildcardFound = VALID_HOUSE_TYPES.includes(summary.buildingType);
        else if (buildingType === BT_ANY_SHOP) wildcardFound = VALID_SHOP_TYPES.includes(summary.buildingType);
        if (summary.buildingType !== buildingType && !wildcardFound) continue;
        if (FACTION_HELD.includes(summary.buildingType)
          && !(guildHallFaction === 0 || summary.factionId === guildHallFaction)) continue;
        if (summary.factionId === DARK_BROTHERHOOD_FACTION || summary.factionId === THIEVES_GUILD_FACTION) continue;
        yield { b, i, summary, buildingKey: makeBuildingKey(b.x, b.y, i) };
      }
    }
  }

  _isBuildingAssigned(activeQuestSites, parentQuestPlaces, location, summary, buildingKey) {
    // Guild halls skip the same-building check, since the hall of a questor hosts the quest's own action.
    // A site holds its building only where its key names it in the current layout.
    if (summary.buildingType !== BT_GUILDHALL) {
      for (const place of parentQuestPlaces) {
        if (place.siteDetails?.siteType === SITE_TYPES.Building
          && place.siteDetails.mapId === location.mapTableData.mapId
          && place.siteDetails.buildingKey === buildingKey && recordStands(place.siteDetails)) return true;
      }
    }
    for (const site of activeQuestSites) {
      if (site.siteType === SITE_TYPES.Building
        && site.mapId === location.mapTableData.mapId
        && site.buildingKey === buildingKey && recordStands(site)) return true;
    }
    return false;
  }

  _getBuildingName(world, buildingType, location, summary, buildingKey = 0) {
    if (isResidence(buildingType)) {
      const bank = getNameBankOfRegion(location.regionIndex);
      const named = () => {
        let name = surname(bank);
        if (!name) name = firstName(bank, [GENDERS.Male, GENDERS.Female][this._range(1)] ?? GENDERS.Male);
        return localizedText('theNamedResidence', THE_NAMED_RESIDENCE).replaceAll('%s', name);
      };
      const shareId = this._die ? this.parentQuest?.shareId : null;
      if (!shareId) return named();
      const was = getSeed();
      setSeed(stringHash(`${shareId}|residence|${location.mapTableData?.mapId ?? 0}|${buildingKey}`));
      try { return named(); } finally { setSeed(was); }
    }
    const shownRegionName = Number.isInteger(location.regionIndex)
      ? getLocalizedRegionName(location.regionIndex, () => location.regionName) : location.regionName;
    return generateBuildingName(summary.nameSeed, summary.buildingType, {
      ...(world.buildingNameOpts?.() ?? {}), locationName: location.name, regionName: location.regionName,
      shownLocationName: getLocalizedLocationName(location.mapTableData?.mapId, location.name), shownRegionName,
      factionId: summary.factionId,
    });
  }

  _hasBuildingType(location, buildingType) {
    return location.exterior.buildings.some((b) => b.buildingType === buildingType);
  }

  _collectDungeonIndicesOfType(regionData, dungeonTypeIndex, allowFullRange = false, sealed = null) {
    const upperLimit = allowFullRange ? 18 : 16;
    const activeQuestSites = this.parentQuest?.hooks?.getAllActiveQuestSites?.() ?? [];
    const parentQuestPlaces = [...(this.parentQuest?.resources.values() ?? [])].filter((r) => r.isPlace && r !== this);
    const found = [];
    for (let i = 0; i < regionData.locationCount; i++) {
      if (!this._isDungeonType(regionData.mapTable[i].locationType)) continue;
      if (isMainStoryDungeon(regionData.mapTable[i].mapId)) continue;
      if (sealed?.(regionData.mapTable[i])) continue;
      if (this._isDungeonAssigned(activeQuestSites, parentQuestPlaces, regionData.mapTable[i].mapId)) continue;
      const type = regionData.mapTable[i].dungeonType;
      if (dungeonTypeIndex === -1) {
        if (type >= 0 && type <= upperLimit) found.push(i);
      } else if (type === dungeonTypeIndex) {
        found.push(i);
      }
    }
    return found;
  }

  // Online, a dungeon inside the open zone mask is sealed and never a quest site; offline the draw is unchanged.
  _zoneSeal(world) {
    if (!this.parentQuest?.hooks?.sharedClock?.()) return null;
    const mask = wildMaskOf(world?.maps);
    if (!mask) return null;
    return (row) => { const p = mapTablePixel(row); return !!p && wildInside(mask, p.x, p.y); };
  }

  _isDungeonAssigned(activeQuestSites, parentQuestPlaces, mapId) {
    for (const place of parentQuestPlaces) {
      if (place.siteDetails?.siteType === SITE_TYPES.Dungeon && place.siteDetails.mapId === mapId) return true;
    }
    for (const site of activeQuestSites) {
      if (site.siteType === SITE_TYPES.Dungeon && site.mapId === mapId) return true;
    }
    return false;
  }

  _createQuestMarker(markerType, flatPosition, dungeonX = 0, dungeonZ = 0, markerID = 0) {
    return {
      questUID: this.parentQuest?.uid ?? 0,
      placeSymbol: this.symbol.clone(),
      targetResources: null,
      markerType, flatPosition, dungeonX, dungeonZ, buildingKey: 0, markerID,
    };
  }

  _enumerateBuildingQuestMarkers(blockData, recordIndex) {
    const spawn = [], item = [];
    const recordData = blockData.rmbBlock.subRecords[recordIndex];
    for (const obj of recordData?.interior?.blockFlatObjectRecords ?? []) {
      if (obj.textureArchive !== EDITOR_FLAT_ARCHIVE) continue;
      const [x, y, z] = curatedMarkerSpot(blockData, recordIndex, obj.textureRecord, obj.xPos, obj.yPos, obj.zPos) ?? [obj.xPos, obj.yPos, obj.zPos];
      const position = { x: x * GLOBAL_SCALE, y: -y * GLOBAL_SCALE, z: z * GLOBAL_SCALE };
      if (obj.textureRecord === SPAWN_MARKER_RECORD) spawn.push(this._createQuestMarker(MARKER_TYPES.QuestSpawn, position));
      else if (obj.textureRecord === ITEM_MARKER_RECORD) item.push(this._createQuestMarker(MARKER_TYPES.QuestItem, position));
    }
    return { questSpawnMarkers: spawn.length ? spawn : null, questItemMarkers: item.length ? item : null };
  }

  _enumerateDungeonQuestMarkers(world, location) {
    if (questCapsSkipped(world, location)) return this._enumerateDungeonQuestMarkersOf(world, location, true);
    return this._enumerateDungeonQuestMarkersOf(world, location, false);
  }
  _enumerateDungeonQuestMarkersOf(world, location, interiorOnly) {
    const spawn = [], item = [];
    for (const dungeonBlock of location.dungeon?.blocks ?? []) {
      if (interiorOnly && QUEST_CAP_BLOCK_RE.test(dungeonBlock.blockName ?? '')) continue;
      const blockData = world.getBlock(dungeonBlock.blockName);
      if (!blockData) continue;
      for (const group of blockData.rdbBlock.objectRootList ?? []) {
        if (!group?.rdbObjects) continue;
        for (const obj of group.rdbObjects) {
          if (obj.type !== RDB_RESOURCE_TYPES.Flat) continue;
          const flat = obj.resources?.flatResource;
          if (!flat || flat.textureArchive !== EDITOR_FLAT_ARCHIVE) continue;
          const markerID = blockData.position + obj.position;
          const position = { x: obj.xPos * GLOBAL_SCALE, y: -obj.yPos * GLOBAL_SCALE, z: obj.zPos * GLOBAL_SCALE };
          if (flat.textureRecord === SPAWN_MARKER_RECORD) {
            spawn.push(this._createQuestMarker(MARKER_TYPES.QuestSpawn, position, dungeonBlock.x, dungeonBlock.z, markerID));
          } else if (flat.textureRecord === ITEM_MARKER_RECORD) {
            item.push(this._createQuestMarker(MARKER_TYPES.QuestItem, position, dungeonBlock.x, dungeonBlock.z, markerID));
          }
        }
      }
    }
    return { questSpawnMarkers: spawn.length ? spawn : null, questItemMarkers: item.length ? item : null };
  }

  // Returns false when the caller must not assign to selectedMarker, because a marker index was assigned directly.
  _getSiteMarker(resource, markerIndex, markerIndexPreference) {
    const sd = this.siteDetails;
    if (sd.selectedMarker.targetResources !== null) {
      if (markerIndex > -1) {
        const nth = (list) => (list?.length && markerIndex >= list.length ? list[markerIndex % list.length] : list[markerIndex]);
        if (resource.isPerson || resource.isFoe || markerIndexPreference === MARKER_PREFERENCE.UseQuestMarker) {
          assignResourceToMarker(resource.symbol.clone(), nth(sd.questSpawnMarkers));
        } else if (resource.isItem) {
          assignResourceToMarker(resource.symbol.clone(), nth(sd.questItemMarkers));
        }
        return false;
      }
      return true;
    }
    if (markerIndexPreference === MARKER_PREFERENCE.AnyMarker) {
      if (!sd.questSpawnMarkers || !sd.questItemMarkers) {
        throw new Error('Value cannot be null. (AnyMarker pool AddRange on a null marker array)');
      }
      const all = [...sd.questSpawnMarkers, ...sd.questItemMarkers];
      if (all.length > 0) { sd.selectedMarker = { ...all[this._range(all.length)] }; return true; }
      return false;
    }
    let preferred = MARKER_TYPES.None;
    if (resource.isPerson || resource.isFoe || markerIndexPreference === MARKER_PREFERENCE.UseQuestMarker) preferred = MARKER_TYPES.QuestSpawn;
    else if (resource.isItem) preferred = MARKER_TYPES.QuestItem;

    const hasSpawn = !!sd.questSpawnMarkers?.length;
    const hasItem = !!sd.questItemMarkers?.length;
    // QuestMarker is a C# struct, so selecting copies it; only the direct index arm writes into an array slot.
    if (preferred === MARKER_TYPES.QuestSpawn && hasSpawn) {
      sd.selectedMarker = { ...(markerIndex === -1 ? sd.questSpawnMarkers[this._range(sd.questSpawnMarkers.length)] : sd.questSpawnMarkers[markerIndex]) };
    } else if (preferred === MARKER_TYPES.QuestItem && hasItem) {
      sd.selectedMarker = { ...(markerIndex === -1 ? sd.questItemMarkers[this._range(sd.questItemMarkers.length)] : sd.questItemMarkers[markerIndex]) };
    } else if (hasSpawn) {
      sd.selectedMarker = { ...sd.questSpawnMarkers[this._range(sd.questSpawnMarkers.length)] };
    } else if (hasItem) {
      sd.selectedMarker = { ...sd.questItemMarkers[this._range(sd.questItemMarkers.length)] };
    }
    return true;
  }

  // When the player is already here, the resource is placed now because layout already ran.
  // Without mountCurrentSiteQuestResources it returns before the hot-remove, as in C#.
  assignQuestResource(targetSymbol, markerIndex = -1, markerIndexPreference = MARKER_PREFERENCE.Default, cullExisting = true) {
    const sd = this.siteDetails;
    if (!sd || !validateQuestMarkers(sd.questSpawnMarkers, sd.questItemMarkers)) {
      throw new Error(`Tried to assign resource ${targetSymbol?.name} to Place without at least a spawn or item marker.`);
    }
    const resource = this.parentQuest.getResource(targetSymbol);
    if (!resource) throw new Error(`Could not locate quest resource with symbol ${targetSymbol?.name}`);
    if (cullExisting) this.parentQuest.hooks?.cullResourceTarget?.(resource, this.symbol);
    if (this._getSiteMarker(resource, markerIndex, markerIndexPreference)) {
      assignResourceToMarker(targetSymbol.clone(), sd.selectedMarker);
    }
    const world = this.parentQuest.hooks?.world;
    if (this.isPlayerHere()) {
      if (!world?.mountCurrentSiteQuestResources) return;
      world.mountCurrentSiteQuestResources();
    }
    if (!this.isPlayerHere() && resource.questResourceBehaviour) {
      resource.questResourceBehaviour.destroyGameObject();
    }
  }

  configureFromPlayerLocation(world, symbolName) {
    const location = world.currentLocation?.();
    if (!location?.loaded) return false;
    const inside = world.playerInside?.() ?? null;
    let siteType, buildingKey = 0, buildingName = '';
    if (inside?.dungeon) {
      siteType = SITE_TYPES.Dungeon;
      buildingName = inside.dungeon.name ?? '';
    } else if (inside?.building) {
      siteType = SITE_TYPES.Building;
      buildingKey = inside.building.buildingKey;
      buildingName = inside.building.name ?? '';
    } else {
      siteType = SITE_TYPES.Town;
    }
    this.siteDetails = {
      questUID: this.parentQuest?.uid ?? 0,
      siteType,
      mapId: location.mapTableData.mapId,
      locationId: location.exterior.exteriorData.locationId,
      regionIndex: location.regionIndex,
      regionName: location.regionName,
      locationName: location.name,
      buildingKey, buildingName, magicNumberIndex: 0,
      questSpawnMarkers: null, questItemMarkers: null,
      selectedMarker: { targetResources: null },
    };
    this._stampSiteLayout();
    this.symbol = new QuestSymbol(symbolName);
    this.sitePending = false;
    return true;
  }

  expandMacro(macroType) {
    const quest = this.parentQuest;
    // Sets only lastPlaceReferenced, so a place in a message never takes the pronoun context from the questor.
    quest.lastPlaceReferenced = this;
    const sd = this.siteDetails;
    if (!sd) return false;
    const world = quest.hooks?.world;
    switch (macroType) {
      case 1: return sd.buildingName;
      case 2: case 3: return getLocalizedLocationName(sd.mapId, sd.locationName);
      case 4: {
        const index = sd.regionIndex === 0 && sd.regionName !== "Alik'r Desert"
          ? world?.maps?.getRegionIndex?.(sd.regionName) : sd.regionIndex;
        const canonical = (i) => world?.maps?.getRegion?.(i)?.name ?? sd.regionName;
        return Number.isInteger(index) ? getLocalizedRegionName(index, canonical) : canonical(index);
      }
      default: return false;
    }
  }

  isPlayerHere() {
    const world = this.parentQuest?.hooks?.world;
    const sd = this.siteDetails;
    if (!world || !sd) return false;
    const inside = world.playerInside?.() ?? null;
    if (sd.siteType === SITE_TYPES.Building) {
      if (!inside?.building) return false;
      const location = world.currentLocation?.();
      if (!location?.loaded || location.mapTableData.mapId !== sd.mapId) return false;
      return inside.building.buildingKey === sd.buildingKey;
    }
    if (sd.siteType === SITE_TYPES.Town) {
      if (inside) return false;
      const location = world.currentLocation?.();
      return !!(location?.loaded && world.isPlayerInLocationRect?.() && location.mapTableData.mapId === sd.mapId);
    }
    if (sd.siteType === SITE_TYPES.Dungeon) {
      if (!inside?.dungeon) return false;
      const location = world.currentLocation?.();
      return !!(location?.loaded && location.mapTableData.mapId === sd.mapId);
    }
    return false;
  }

  getSaveData() {
    return {
      scope: this.scope,
      name: this.name,
      p1: this.p1, p2: this.p2, p3: this.p3,
      siteDetails: this.siteDetails ? structuredClone(this.siteDetails) : null,
    };
  }

  restoreSaveData(dataIn) {
    if (dataIn == null) return;
    this.scope = dataIn.scope;
    this.name = dataIn.name;
    this.p1 = dataIn.p1; this.p2 = dataIn.p2; this.p3 = dataIn.p3;
    this.siteDetails = dataIn.siteDetails ? structuredClone(dataIn.siteDetails) : null;
    this.sitePending = !this.siteDetails;
  }
}

export function classicBlockGrid(location) {
  const { width, height, blockNames } = location.exterior.exteriorData;
  const bsa = boundWorldDataBlocks();
  const read = new Map();
  const blockOf = (name) => {
    if (!read.has(name)) { const i = bsa?.getBlockIndex?.(name) ?? -1; read.set(name, i >= 0 ? bsa.readClassicBlock?.(i) ?? null : null); }
    return read.get(name);
  };
  const blocks = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) blocks.push({ dfBlock: blockOf(blockNames[y * width + x]), x, y });
  }
  return blocks;
}

export function townBlockGrid(world, location) {
  const width = location.exterior.exteriorData.width;
  const height = location.exterior.exteriorData.height;
  const blocks = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const blockName = world.maps.getRmbBlockName(location, x, y);
      const dfBlock = world.getBlock(blockName);
      blocks.push({ dfBlock, x, y });
    }
  }
  return blocks;
}

export function validateQuestMarkers(questSpawnMarkers, questItemMarkers) {
  return !!(questSpawnMarkers?.length || questItemMarkers?.length);
}

export function assignResourceToMarker(symbol, marker) {
  if (!marker.targetResources) marker.targetResources = [];
  marker.targetResources.push(symbol);
}

export function isPlayerAtBuildingType(world, p2, p3) {
  const inside = world?.playerInside?.() ?? null;
  if (!inside?.building) return false;
  const buildingType = inside.building.buildingType;
  if (p2 === -1) {
    switch (p3) {
      case 0: return VALID_BUILDING_TYPES.includes(buildingType);
      case 1: return VALID_HOUSE_TYPES.includes(buildingType);
      case 2: return VALID_SHOP_TYPES.includes(buildingType);
      default:
        console.warn(`[quest] Unhandled building type: p1=0, p2=${p2}, p3=${p3}`);
        return false;
    }
  } else if (FACTION_HELD.includes(p2)) {
    if (buildingType !== p2) return false;
    if (p3 === 0) return true;
    return inside.building.factionId === p3;
  }
  return buildingType === p2;
}

export function isPlayerAtDungeonType(world, p2) {
  const inside = world?.playerInside?.() ?? null;
  if (!inside?.dungeon) return false;
  if (p2 === -1) return true;
  return p2 === inside.dungeon.dungeonType;
}
