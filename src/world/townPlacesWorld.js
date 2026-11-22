// A town's places: the open sea and whether a port town lies on it, and each town's yards,
// shipyard, and lighthouse placed on its ground with their keepers. It also measures a model's
// ground rectangles once per model.
import { ALL_YARD_KINDS, isYardTown, yardKeeper } from './merchantYards/merchantYards.js';
import { ARENA_BLOCK } from './arenaCity.js';
import { blockBuildingCount } from '../talk/talkTopics.js';
import { BODY } from './windmillMesh.js';
import { classicModelIdOf, customModelFor, customModelNeeds, hasCustomModel } from './customModels.js';
import { collectBlockFlats } from './rmbFlats.js';
import {
  craftYardSitesOn, MONUMENT_KEEP_M, placedModelBox, townGroundOf, yardMeasuresOf, yardSitesOn,
} from './merchantYards/merchantYardSites.js';
import { flatFieldFor } from './flatFields.js';
import { hasPort } from '../travel/travelPorts.js';
import { inEther } from './ethericSea.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { isPortTown, PORT_SITE_ORDER, portKeeper, portPlaceName } from '../travel/portPlaces.js';
import { layoutLocation } from './locationLayout.js';
import { longitudeLatitudeToMapPixel } from '../formats/mapsFile.js';
import { MAP_HEIGHT, MAP_WIDTH } from '../formats/woodsFile.js';
import { modelFootRects } from '../homes/homeYards.js';
import { openSeaOf, portSitesOn, portTownOnSea, seaBearing, seaField, townSeaOf } from './portSites.js';
import { BUILDING_TYPES as TALK_BUILDING_TYPES } from './buildingNames.js';
import { transformedAabb } from '../render/frustum.js';
import { walkerRace } from '../characters/mobilePerson.js';
import { windmillsOn } from './windmills.js';

/** @param {any} shared */
export function createTownPlacesWorld(shared) {
  const { archAabb, blocks, dfMeshSize, etherSea, maps, seaPixel, tamrielLand } = shared;
  /** FIELD BUGS 2026-10-14 INLAND-PORTS: THE OPEN SEA - a pixel of the Bay's map whose water reaches the map's border
   *  (world/portSites.js openSeaOf over seaPixel, flooded the first time it is asked: every lake and pond the map draws
   *  inland left out); past the Veil, the Eltheric Ocean's water round its isles (the ether's own ground - each isle a
   *  hill of land in open water, ethericSea.js isleByte); past the map's edge, only where the land beyond the Bay stands
   *  (AUDIT CAPTAIN'S SEA B10, the harbour's sites' law, moved here: else nothing streams there) - the continent's sea,
   *  its land a province's and no lake in it (world/tamriel/tamrielGround.js authoredHeightByte). The one set the port towns, the
   *  harbour board's ports and the harbour office's sites, cargoes and charts ask. */
  let _openSea = null;
  const openSea = (x, y) => {
    if (etherSea && inEther(x, y)) return seaPixel(x, y);
    if (!(x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT)) return tamrielLand && seaPixel(x, y);
    _openSea ??= openSeaOf(seaPixel, MAP_WIDTH, MAP_HEIGHT);
    return _openSea[y * MAP_WIDTH + x] === 1;
  };
  /** SHIPYARDS: whether a town stands the port's places (systems/portPlaces.js isPortTown) - a port by its own data
   *  (Travel Options' hand-written harbours, travelPorts.js hasPort, or Daggerfall's PortTownAndUnknown byte) that the open
   *  sea bears on (INLAND-PORTS: world/portSites.js portTownOnSea - the open sea within SEA_RING, the ring its bearing is
   *  read off; the data alone stood a shipyard and a lighthouse at the middle of 36 region capitals, beside a pond in
   *  Ilessan Hills' blocks). Never a seat's members' harbour (hasPortFor's word is one guild's - every client stands the
   *  same shipyard), and never csaIsPortTown, declared below the stream (BOOT-TDZ). */
  const portOnSea = (dfLocation) => portTownOnSea(dfLocation, hasPort, openSea);
  const _yardMemo = new Map();   // mapId -> { sig, sites, ports }, the latest few towns
  const _yardBoxes = new Map();   // a registered model's local box, by id
  const palaceIn = (b) => {
    const list = b.dfBlock?.rmbBlock?.fldHeader?.buildingDataList ?? [];
    const n = Math.min(list.length, blockBuildingCount(b.dfBlock));
    for (let i = 0; i < n; i++) if (list[i]?.buildingType === TALK_BUILDING_TYPES.Palace) return true;
    return false;
  };
  /** MERCHANT-YARDS + SHIPYARDS: A TOWN'S PLACES - its yards placed on its ground as they always were (townGroundOf, then
   *  yardSitesOn - yardSitesOf's own two steps; CARP-YARD: the joinery last, on what the port left - craftYardSitesOn),
   *  and a port town's shipyard and lighthouse on what they left (portSitesOn
   *  off the sea: the town's own shoreline cells, else the sea's bearing off the map pixels round it - seaPixel), each
   *  keyed by the town and its kind, with its keepers (systems/portPlaces.js portKeeper - the shipyard's crewmaster beside
   *  its shipmaster), its name and the town's people. One memo a town, keyed by its measures and whether it is a port;
   *  one call a build (AUDIT SHIPYARDS L3-3: the yards' and the port's each asked it whole). */
  function townPlacesFor(dfLocation, lefaySpot, people, loc = null) {
    try {
      const yl = loc && isEnhanced() && windmillsOn() ? loc : layoutLocation(dfLocation, maps, blocks, { enhanced: true, windmills: true });
      const measures = {
        ...yardMeasuresOf(yl, {
          boxOf: (id, at) => placedModelBox(id, at, {
            custom: (cid) => (hasCustomModel(cid) && !customModelNeeds(cid).length ? customModelFor(cid)?.positions ?? null : null),
            classic: (cid) => dfMeshSize(classicModelIdOf(cid)),
            cache: _yardBoxes,
          }),
          fieldOf: (id) => flatFieldFor(id),
          millBox: (at) => { const box = transformedAabb(archAabb('millBody', BODY.positions), at); return [box[0], box[2], box[3], box[5]]; },
          flatsOf: (b) => collectBlockFlats(b.dfBlock, 0),
          closedBlock: (b) => b.blockName === ARENA_BLOCK || palaceIn(b),
        }),
        keep: lefaySpot ? [[lefaySpot.x, lefaySpot.z, MONUMENT_KEEP_M]] : [],
      };
      const mapId = (dfLocation.mapTableData?.mapId ?? 0) >>> 0, regionIndex = dfLocation.regionIndex ?? 0, race = walkerRace(people, dfLocation.regionIndex);
      const yardTown = isYardTown(dfLocation), port = isPortTown(dfLocation, portOnSea(dfLocation));
      const sig = `${JSON.stringify(measures)}|${yardTown ? 'yards' : ''}|${port ? 'port' : ''}`;
      let memo = _yardMemo.get(mapId);
      if (!memo || memo.sig !== sig) {
        const g = townGroundOf(yl, measures);
        const sites = g && yardTown ? yardSitesOn(g) : [];
        let ports = [];
        if (g && port) {
          const lp = longitudeLatitudeToMapPixel(dfLocation.mapTableData.longitude, dfLocation.mapTableData.latitude);
          const bearing = seaBearing(lp.x, lp.y, openSea);   // AUDIT SHIPYARDS U2: and the town's own water against it is no sea; INLAND-PORTS: nor a lake the map draws
          ports = portSitesOn(g, seaField(g.width, g.height, townSeaOf(yl, bearing), bearing));
        }
        if (g && yardTown) sites.push(...craftYardSitesOn(g));   // CARP-YARD: the joinery on what the yards and the port left - none of theirs moves
        memo = { sig, sites, ports };
        _yardMemo.delete(mapId);
        _yardMemo.set(mapId, memo);
        while (_yardMemo.size > 8) _yardMemo.delete(_yardMemo.keys().next().value);
        if (yardTown && memo.sites.length < ALL_YARD_KINDS.length) console.log(`[yards] ${dfLocation.name}: no room for ${ALL_YARD_KINDS.filter((k) => !memo.sites.some((t) => t.kind === k)).join(' or ')}`);
        if (port && memo.ports.length < PORT_SITE_ORDER.length) console.log(`[port] ${dfLocation.name}: no room for its ${PORT_SITE_ORDER.filter((k) => !memo.ports.some((t) => t.kind === k)).join(' or its ')}`);
      }
      const shipmaster = portKeeper(mapId, 'shipyard', regionIndex), crewmaster = portKeeper(mapId, 'crewhall', regionIndex), lightkeeper = portKeeper(mapId, 'lighthouse', regionIndex);
      return {
        yards: memo.sites.map((t) => ({ ...t, key: `${mapId}:${t.kind}`, mapId, regionIndex, race, keeper: yardKeeper(mapId, t.kind, regionIndex) })),
        ports: memo.ports.map((t) => {
          const keeper = t.kind === 'lighthouse' ? lightkeeper : shipmaster;
          return {
            ...t, key: `${mapId}:${t.kind}`, mapId, regionIndex, race, townName: dfLocation.name, keeper,
            name: portPlaceName(t.kind, { keeperName: keeper.name, townName: dfLocation.name }),
            ...(t.kind === 'shipyard' ? { crewmaster, crewName: portPlaceName('crewhall', { keeperName: crewmaster.name }) } : {}),
          };
        }),
      };
    } catch (e) { console.warn('[yards] the town\'s yards would not place', e?.message ?? e); return { yards: [], ports: [] }; }
  }
  /** FB1009 HOME-FOOT: each model's ground seen from above (homeYards.js modelFootRects), in its own frame - measured once. */
  const modelFeet = new Map();
  const modelFeetOf = (id, cpu) => {
    let rs = modelFeet.get(id);
    if (!rs) modelFeet.set(id, rs = modelFootRects(cpu.positions, cpu.indices));
    return rs;
  };
  return { modelFeetOf, openSea, portOnSea, townPlacesFor };
}
