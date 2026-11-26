import { BAND_LIFE_MS, bandLifeOf } from '../travel/travelBands.js';
import { CLIMATES, getWorldClimateSettings, REGION_NAMES } from '../formats/mapsFile.js';
import {
  createSpawnGround, dungeonSightLine, isEliteSpawn, pathFreePixel, pickTemplate, spawnedLocationCentreLocal,
  spawnsDungeon, spawnTemplates, synthesizeDungeonLocation,
} from './spawnedDungeons.js';
import { directionHintString } from '../talk/talk.js';
import { dungeonTier } from './dungeonTier.js';
import { ETHER_REGION, ETHER_REGION_NAME, etherTemplateOf, synthesizeEtherLocation } from './etherPlaces.js';
import { inEther, inEtherLaw, isleAt } from './ethericSea.js';
import { isCellRoom } from '../net/wire.js';
import { isMainStoryDungeon } from './dungeonTextures.js';
import { RAIDER_LIFE_MS, raiderLifeOf } from '../systems/naval/seaRaiders.js';
import { cromwarkDesolateAt } from './wild/cromwarkTowns.js';
import { wildInside, wildMaskOf } from './wildZone.js';

/** @param {any} shared */
export function createOverworldSpawns(shared) {
  const {
    _announcedSpawnPixels, _etherTemplates, _spawnLedger, _spawnSalt, etherSea, locationIndex, maps, params,
    playerTravelPixel, terrainGen, tvSay,
  } = shared;
  const _capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const _announceT = [0, 0, 0];
  function announceNearbySpawns(px, py, feet) {
    const key = `${px},${py}`;
    const loc = locationIndex.get(key);
    if (!loc?.spawned || _announcedSpawnPixels.has(key)) return;
    _announcedSpawnPixels.add(key);
    const t = shared.state.pixelTranslation(px, py, _announceT);
    const [lx, lz] = spawnedLocationCentreLocal(loc);
    const dx = t[0] + lx - feet[0], dz = t[2] + lz - feet[2];
    tvSay(dungeonSightLine(Math.hypot(dx, dz), _capitalize(directionHintString(dx, dz)), dungeonTier(loc)), 5);
  }
  let _spawnTemplates = null;

  const _insideSpawn = (key) => (shared.modes?.mode ?? 'exterior') === 'dungeon'
    && `${playerTravelPixel().x},${playerTravelPixel().y}` === key;
  const _noteSpawnCleared = () => {
    const p = playerTravelPixel();
    const key = `${p.x},${p.y}`;
    if (!locationIndex.get(key)?.spawned) return;
    if (locationIndex.get(key).superTier) return;
    if (locationIndex.get(key).wildHall) return;
    _spawnLedger.clear(key, shared._spawnClock());
    owSayRow(key);
  };
  const OW_SAY_MS = 1000;
  const OW_SAY_KEEP_MS = 10 * 60 * 1000;
  const OW_SAY_MAX = 64;
  const _owSay = { sp: new Map(), dg: new Map() };
  let _owSaidAt = -Infinity;
  function owSaySpent(id) { _owSay.sp.delete(id); _owSay.sp.set(id, performance.now()); owSayBound(_owSay.sp); }
  function owSayRow(key) { if (!_spawnLedger.wireRow(key)) return; _owSay.dg.delete(key); _owSay.dg.set(key, performance.now()); owSayBound(_owSay.dg); }
  function owSayBound(m) { while (m.size > OW_SAY_MAX) m.delete(m.keys().next().value); }
  function overworldLedgerFrame(now) {
    if (!shared.online?.owOk || now - _owSaidAt < OW_SAY_MS || (!_owSay.sp.size && !_owSay.dg.size)) return;
    _owSaidAt = now;
    if (!isCellRoom(shared.online.room)) { for (const k of _owSay.dg.keys()) _owSay.dg.set(k, now); return; }
    const bandLife = Math.floor(shared.bandNowMs() / BAND_LIFE_MS), raidLife = Math.floor(shared.raidNowMs() / RAIDER_LIFE_MS);
    for (const id of [..._owSay.sp.keys()]) if ((id[0] === 'b' ? bandLifeOf(id) < bandLife - 1 : raiderLifeOf(id) < raidLife - 1)) _owSay.sp.delete(id);
    for (const [key, since] of [..._owSay.dg]) if (now - since > OW_SAY_KEEP_MS) _owSay.dg.delete(key);
    if (_owSay.sp.size) for (const id of shared.online.sendOverworld('sp', [..._owSay.sp.keys()])) _owSay.sp.delete(id);
    if (_owSay.dg.size) {
      const rows = [..._owSay.dg.keys()].map((k) => _spawnLedger.wireRow(k)).filter(Boolean);
      for (const r of shared.online.sendOverworld('dg', rows)) _owSay.dg.delete(`${r[0]},${r[1]}`);
    }
  }
  function overworldLedgerHeard(msg) {
    if (msg?.k === 'sp') {
      for (const id of msg.ids) {
        if (id[0] === 'b') { shared._bandSpent.add(id); shared._bandChase.delete(id); shared._bandPeer.delete(id); }
        else { shared.tvRaid.spent.add(id); shared.tvRaid.chase.delete(id); shared.tvRaid.peer.delete(id); }
      }
      return;
    }
    if (msg?.k !== 'dg') return;
    let moved = false;
    const now = shared._spawnClock();
    for (const [px, py, seen, cleared] of msg.rows) moved = _spawnLedger.merge(`${px},${py}`, seen, cleared, now) || moved;
    if (moved) shared.tvDng.at = null;
  }
  function _spawnSeen(key) {
    if (locationIndex.get(key)?.superTier) return;
    if (locationIndex.get(key)?.wildHall) return;
    const now = shared._spawnClock();
    const fresh = !_spawnLedger.has(key, now);
    _spawnLedger.note(key, now);
    if (fresh) owSayRow(key);
  }
  const _spawnUnroaded = new Set();
  function _dropRoadedSpawns() {
    const net = terrainGen.roads();
    if (!net) return;
    if (_spawnUnroaded.size) shared._locIndexGen += 1;
    for (const key of _spawnUnroaded) {
      const [px, py] = key.split(',').map(Number);
      if (!pathFreePixel(net, px, py) && !_insideSpawn(key)) { locationIndex.delete(key); _spawnLedger.forget(key); }
    }
    _spawnUnroaded.clear();
  }
  const _spawnGround = createSpawnGround(shared.woods);

  const spawnedDungeonAt = (px, py) => {
    if (!params.has('online')) return null;
    try {
      { const _wm = wildMaskOf(maps); if (_wm && wildInside(_wm, px, py)) return shared.wildHallStandOf(_wm, px, py); }
      if (!spawnsDungeon(_spawnSalt, px, py) || maps.getClimateIndex(px, py) === CLIMATES.Ocean || !_spawnGround(px, py)) return null;
      const net = terrainGen.roads();
      if (net && !pathFreePixel(net, px, py)) return null;
      const key = `${px},${py}`;
      if (_spawnLedger.expired(key, shared._spawnClock()) && !_insideSpawn(key)) {
        shared._locIndexGen += 1;
        locationIndex.delete(key);
        return null;
      }
      const loc = _spawnCloneAt(px, py);
      if (!loc) return null;
      shared._locIndexGen += 1;
      locationIndex.set(key, loc);
      if (!net) _spawnUnroaded.add(key);
      return loc;
    } catch (e) { console.warn('[spawned dungeons]', px, py, e?.message ?? e); return null; }
  };
  function _locationToBuild(px, py) {
    if (etherSea && inEther(px, py)) return etherPlaceAt(px, py);
    const key = `${px},${py}`;
    const loc = locationIndex.get(key);
    if (loc?.spawned && !loc.wildHall && _spawnLedger.expired(key, shared._spawnClock()) && !_insideSpawn(key)) {
      shared._locIndexGen += 1;
      locationIndex.delete(key);
      return null;
    }
    return loc || spawnedDungeonAt(px, py);
  }
  function etherPlaceAt(px, py) {
    const key = `${px},${py}`;
    const had = locationIndex.get(key);
    if (had?.ether) return had;
    const isle = isleAt(px, py);
    if (!isle || isle.px !== px || isle.py !== py) return null;
    const loc = etherPlaceClone(isle);
    if (!loc) return null;
    shared._locIndexGen += 1;
    locationIndex.set(key, loc);
    return loc;
  }
  function etherPlaceClone(isle) {
    const template = etherTemplateOf(_etherTemplates, isle);
    if (!template) return null;
    return synthesizeEtherLocation(template, isle, { regionIndex: ETHER_REGION, regionName: REGION_NAMES[ETHER_REGION] ?? ETHER_REGION_NAME, politic: 128 + ETHER_REGION, climate: getWorldClimateSettings(isle.climate) });
  }
  function _spawnCloneAt(px, py) {
    _spawnTemplates ??= spawnTemplates(locationIndex.values(), isMainStoryDungeon);
    const template = pickTemplate(_spawnTemplates, _spawnSalt, px, py);
    if (!template) return null;
    const regionIndex = maps.getRegionIndexAt(px, py);
    return synthesizeDungeonLocation(template, { salt: _spawnSalt, px, py, where: {
      regionIndex, regionName: REGION_NAMES[regionIndex], politic: maps.getPoliticIndex(px, py), climate: getWorldClimateSettings(maps.getClimateIndex(px, py)),
    }, elite: isEliteSpawn(_spawnSalt, px, py) });
  }
  const tvSpawnGone = (x, y) => { const key = `${x},${y}`; if (_insideSpawn(key)) return false; const b = shared.built.get(key); return b ? b.location == null : _spawnLedger.expired(key, shared._spawnClock()); };

  const tvLocationAt = (x, y) => locationIndex.get(`${x},${y}`) ?? (params.has('online') && !inEtherLaw(x, y) && spawnsDungeon(_spawnSalt, x, y) ? shared.tvSpawnAt(x, y) : null);
  const _liftLocationAt = (x, y) => shared.spawnGroundPlace.groundLocationAt(x, y, locationIndex.get(`${x},${y}`));

  function _spawnGuards(immediate) {
    if (cromwarkDesolateAt(maps, playerTravelPixel().x, playerTravelPixel().y) || shared.modes?.spawnCityGuardsInside?.(immediate)) return;
    const feet = shared.walkMode && shared.playerSpawned ? shared.player.pos : shared.cam.pos;
    const fwd = [Math.sin(shared.cam.yaw), 0, Math.cos(shared.cam.yaw)];
    shared.cityGuards.spawnCityGuards(!!immediate, { playerFeet: [...feet], playerFwd: fwd, pool: shared._guardPool() }).catch((e) => console.error('[guards]', e));
  }
  return {
    _dropRoadedSpawns, _insideSpawn, _liftLocationAt, _locationToBuild, _noteSpawnCleared, _owSay, _spawnCloneAt,
    _spawnGround, _spawnGuards, _spawnSeen, announceNearbySpawns, etherPlaceAt, etherPlaceClone, overworldLedgerFrame,
    overworldLedgerHeard, owSaySpent, tvLocationAt, tvSpawnGone,
  };
}
