// @ts-check
// The road network arrives after the world has started building: the Basic Roads mod's data, or the game's own network
// when that cannot load. Every pixel built before it landed is torn down, re-queued nearest first, and built again with
// roads, holding the motor on the player's own pixel until it stands again.
import { settlementsOf, retryModRoads } from '../world/roadsProducer.js';
import { bootReads } from './bootReads.js';
import { nearestFirstFrom } from '../world/streamingWorld.js';

export function createRoadSweep(d) {
  let roadsSweepDue = false;
  function rebuildRoadless() { roadsSweepDue = true; }
  function sweepRoadless() {
    // Before the rebuild, so a crossed pixel comes back without its ruin.
    d.dropRoadedSpawns();
    const again = [];
    for (const [, p] of [...d.built()]) if (!p.withRoads) again.push({ px: p.px, py: p.py });
    if (!again.length) return;
    const under = `${d.state().current.x},${d.state().current.y}`;
    if (d.walkMode() && d.playerSpawned() && again.some((k) => `${k.px},${k.py}` === under)) d.holdSeason(under);
    for (const k of again) d.destroyPixel(k.px, k.py, { collectLoose: false });
    d.queue().push(...again.sort(nearestFirstFrom(d.state().current)));
    console.log(`[roads] ${again.length} pixel(s) built before the network landed - rebuilt with roads`);
  }
  bootReads().roads.then((his) => {
    if (!d.basicRoadsOn) {
      console.log('[roads] Basic Roads off in the Mods pane - generating the port\'s own network');
      d.terrainGen.setRoads(settlementsOf(d.maps), d.logRoads, d.roadSwitches);
      rebuildRoadless();
      return;
    }
    if (his) { d.terrainGen.setRoadsData({ ...his, ...d.roadSwitches }, (st) => console.log(`[roads] Basic Roads, 1:1: ${st.roadPixels ?? '?'} road pixels (Hazelnut)${d.roadSwitches.water ? ', rivers and streams on' : ''}${d.roadSwitches.smooth ? '' : ', smoothing off'}`)); rebuildRoadless(); return; }
    // Online the room's ground follows the mod's data, so a failed fetch is retried. The pixels stay
    // roadless meanwhile, and the game's own network is used only after every try has failed.
    if (d.params.has('online')) {
      retryModRoads({ onTry: (n, ms) => console.warn(`[roads] Basic Roads data did not load - asking again in ${ms / 1000} s (online: the room's network)`) }).then((late) => {
        if (late) { d.terrainGen.setRoadsData({ ...late, ...d.roadSwitches }, (st) => console.log(`[roads] Basic Roads, 1:1, landed late: ${st.roadPixels ?? '?'} road pixels (Hazelnut)`)); rebuildRoadless(); return; }
        console.warn('[roads] Basic Roads data did not load on any try - generating our own network');
        d.terrainGen.setRoads(settlementsOf(d.maps), d.logRoads, d.roadSwitches);
        rebuildRoadless();
      });
      return;
    }
    console.warn('[roads] Basic Roads data did not load - generating our own network');
    d.terrainGen.setRoads(settlementsOf(d.maps), d.logRoads, d.roadSwitches);
    rebuildRoadless();
  });
  return {
    // The sweep runs on the frame, between builds: a pixel in flight must publish before its key is torn down.
    /** @param {boolean} building */
    frame(building) { if (roadsSweepDue && !building) { roadsSweepDue = false; sweepRoadless(); } },
  };
}
