// Travel map, Travel Options, and portals in the world. It holds the teleport map, the Travel
// Options control and navigation, the town walk, and the portal holds and wire word. It also marks
// guild halls and notice boards on the town map and renames its buildings.
import { areEnemiesNearby } from '../characters/encounters.js';
import { buildingSummaries } from '../world/buildingSummaries.js';
import { createColliderProbe, createTravelSteer } from './travelSteer.js';
import { createTownWalk } from './townWalkHost.js';
import { createTravelControlUI } from '../ui/travelControlUI.js';
import { getLocalizedFactionName, localizedText } from '../ui/textManager.js';
import { hallFactionsOf } from '../net/npcHallBook.js';
import { immersiveTravelLoaded, readImmersiveTravelSettings } from './immersiveTravel.js';
import { isOnShip } from '../systems/naval/ship.js';
import { madeRuleHere } from '../characters/madeLevel.js';
import { pathsDataPoint, playerOnPathAt } from './travelPaths.js';
import { playerEntity } from '../characters/playerEntity.js';
import { PORTAL_HOLD_TEXT, PORTAL_TEXT, portalHold } from './portalStone.js';
import { pressed } from '../ui/input.js';
import { revealBunnyHallsOnMap, revealGuildHallsOnMap, revealingMemberships } from '../guilds/guildHallReveal.js';
import { SCENE_MAP_RATIO } from '../world/streamingWorld.js';
import { ServiceFlowWindow } from '../ui/guildServiceWindows.js';
import { setDiscoveredBuildingCustomName } from '../maps/discovery.js';
import { townBoardRows } from '../ui/townMapMarks.js';
import { travelMapDoorReady } from '../ui/travelMapDoor.js';
import { worldDataPacksMissing } from '../mods/modWorldData.js';

/** @param {any} shared */
export function createTravelMapWorld(shared) {
  const {
    _mode, _questRegionIndex, _travelUIHolder, boardSplitOf, buildTravelMapWindow, built, cam, chapterSheet,
    cityGuards, collider, csaBoatUnderMe, duelEnemyNear, exteriorFoes, hallBook, homeLayoutsOnline, locationIndex,
    maps, navalHostileNear, noticeBook, noticeTownOf, player, playerTravelPixel, portalGates, state, teleportTo,
    terrainGen, toggleTravelMap, townTalk, travelOptionsOn, walkMode, worldMoveBusy,
  } = shared;
  const hasTransport = (template) => (playerEntity.items ?? []).some((it) => it.templateIndex === template);

  function rumorHere() { const p = playerTravelPixel(); return { px: p.x, py: p.y, region: _questRegionIndex() }; }

  const showQuestPlace = (find) => toggleTravelMap({ siteDetails: find });

  const immersiveSettingsIfOn = () => (immersiveTravelLoaded() ? readImmersiveTravelSettings() : null);

  function openTeleportMap() {
    if (!travelMapDoorReady()) return null;
    if (shared.veilRefused()) return null;
    let win = null;
    win = buildTravelMapWindow({
      onTeleport: (pick) => { teleportTo(pick); },
      onClose: () => { if (shared.modes?.questOverlay === win) shared.modes?.showQuestOverlay?.(null); },
    });
    win?.activateTeleportationTravel();
    return win;
  }
  const portalHoldNow = () => portalHold({
    dead: !(playerEntity.health > 0), busy: worldMoveBusy() || shared._teleporting,
    duel: duelEnemyNear(), siege: shared.inSiegeRoom(),
    enemies: areEnemiesNearby([...cityGuards.guards, ...exteriorFoes.foes]) || navalHostileNear(),
    journey: !!shared.travelOptions?.isTravelActive || shared.travelView.state !== 'off',
  });
  const portalDoorRefusal = () => {
    if (_mode() !== 'exterior' || madeRuleHere('portalStone') === 'refused') return PORTAL_TEXT.notHere;
    const hold = portalHoldNow();
    if (hold) return PORTAL_HOLD_TEXT[hold];
    if (player.isPlayerSwimming) return PORTAL_TEXT.water;
    if (csaBoatUnderMe() || isOnShip(playerEntity, playerEntity.boardShipPosition ?? null, playerTravelPixel())) return PORTAL_TEXT.aboard;
    if (portalGates.mine()) return PORTAL_TEXT.standing;
    return null;
  };

  const travelControlUI = travelOptionsOn ? createTravelControlUI({
    onOpenMap: () => toggleTravelMap(),
    onClose: () => shared.travelOptions?.interruptTravel(),
    onCancel: () => shared.travelOptions?.clearTravelDestination(),
  }) : null;
  function travellerOnRoad() {
    const net = terrainGen.roads();
    if (!net) return false;
    const wc = state.worldCoords(walkMode ? player.pos : cam.pos), mp = playerTravelPixel();
    return playerOnPathAt(pathsDataPoint(net, mp.x, mp.y), wc.x, wc.z, mp.x, mp.y) !== 0;
  }
  const travelNav = createTravelSteer();
  const travelNavProbe = createColliderProbe({ collider, feet: () => (walkMode && shared.playerSpawned ? player.pos : cam.pos) });
  const travelNavFrame = { speed: 0, dt: 0, scale: 1, asked: 0, ratio: SCENE_MAP_RATIO, strafe: 0 };
  _travelUIHolder.ui = travelControlUI;
  const townWalk = createTownWalk({ built, state });
  const tvInTown = () => !!townWalk.townPace(state.worldCoords(player.pos));

  function travelFollowPressed() { return !shared.naval?.aboard?.() && pressed(shared.latch.edge, shared.keys, 'FollowPaths'); }

  const revealMemberGuildHalls = ({ witness = false } = {}) => {
    if (witness) chapterSheet?.refresh();
    const px = playerTravelPixel();
    const key = `${px.x},${px.y}`;
    const dfLoc = locationIndex.get(key);
    const b = built.get(key);
    if (!dfLoc || !b?.locBlocks) return;
    // Resolve the location now; the reveal waits a microtask and must not read the player again.
    const locationId = `${dfLoc.regionIndex}:${dfLoc.name}`;
    const buildings = buildingSummaries(dfLoc.exterior?.buildings ?? [], b.locBlocks,
      { locationName: dfLoc.name, regionName: maps.getRegionName(dfLoc.regionIndex), locationIndex: dfLoc.locationIndex ?? 0 });
    // Wait for faction data, or an early edge saves an unknown-guild plate to the discovery record.
    Promise.resolve(townTalk.ensureFactions?.()).then(() => {
      revealGuildHallsOnMap(revealingMemberships(playerEntity), locationId, buildings,
        { factionName: (id) => { const n = townTalk.factionDict?.get(id)?.name; return n == null ? '' : getLocalizedFactionName(id, n); } });
      revealBunnyHallsOnMap(locationId, buildings);
      // Report only from a layout every client shares; an unheard pinned one has other buildings.
      if (witness && hallBook && (!homeLayoutsOnline || (shared._homeLayoutsApplied && !worldDataPacksMissing().length))) {
        const factions = hallFactionsOf(buildings, townTalk.factionDict ?? null);
        const region = (() => { try { return maps.getRegionIndexAt(px.x, px.y); } catch { return null; } })();
        if (factions.length && Number.isInteger(region)) hallBook.witness({ key: dfLoc.mapTableData.mapId >>> 0, region, factions });
      }
    }).catch(() => {});
  };

  const townBoardMarks = (p) => {
    if (!noticeBook || noticeBook.open !== true || !p?.boards?.length || !p.location) return [];
    const bountyAt = boardSplitOf(p);
    const town = noticeTownOf(p.px, p.py, bountyAt.size > 0);
    return town ? townBoardRows(p, bountyAt, noticeBook.unseen(town.mapId)) : [];
  };
  const renameMapBuilding = (locId, buildingKey, displayed) => {
    townTalk.pushOverlay(new ServiceFlowWindow([{
      rows: [localizedText('customName', 'Custom name: ')],
      field: { numeric: false, maxCharacters: 80, initial: displayed ?? '' },
      onInput: (text) => { setDiscoveredBuildingCustomName(locId, buildingKey, text); return null; },
    }]));
  };

  const portalWord = (frame, full) => {
    if (!full) return;
    const pg = portalGates.wireRecord(walkMode && shared.playerSpawned ? player.feetAt() : cam.pos);
    if (pg) frame.pg = pg;
    const ea = shared.egClient?.archWord(walkMode && shared.playerSpawned ? player.feetAt() : cam.pos);
    if (ea) frame.ea = ea;
  };
  return {
    hasTransport, immersiveSettingsIfOn, openTeleportMap, portalDoorRefusal, portalHoldNow, portalWord,
    renameMapBuilding, revealMemberGuildHalls, rumorHere, showQuestPlace, townBoardMarks, townWalk, travelControlUI,
    travelFollowPressed, travelNav, travelNavFrame, travelNavProbe, travellerOnRoad, tvInTown,
  };
}
