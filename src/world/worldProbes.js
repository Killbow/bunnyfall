// Shot-mode test helpers for the world: the test room entry and preset, and the sea test that takes the player
// to open water and the helm. It also holds the ride-out to the next pixel edge and the door spots shifted
// through the floating origin. The window hooks that use them stay in the world.

import { doorSpotsNear } from '../characters/foeSpacing.js';
import { dungeonEntranceLanding, floorLanding, repositionFeetY } from '../player/enterExit.js';
import { playerEntity } from '../characters/playerEntity.js';
import { TEST_SEA, TEST_SEA_TEXT, testEntryById } from '../characters/testRoom.js';
import { DOOR_TYPE } from './meshReader.js';
import { TRANSPORT_MODES } from '../travel/transport.js';

/** @param {any} shared */
export function createWorldProbes(shared) {
  const {
    _teleportToPixel, buildingDoors, cam, collider, heightAt, inFlight, locationLandingFor, params, player, queue,
    setTransportModeHere, startPixel, state, townTalk, tvSeaLandAlong, tvSeaY,
  } = shared;
  const testEntry = !playerEntity.chargenDone && params.has('test') ? testEntryById(params.get('test'), params) : null;
  const testPreset = testEntry?.preset ?? null;

  let rideOutEdge = null;

  const seaTest = () => {
    if (shared.seaTestStage === 0) {
      if (!shared.navalOn()) { shared.seaTestWanted = false; townTalk.say(TEST_SEA_TEXT.refused); return; }
      shared.seaTestStage = 1;
      _teleportToPixel(TEST_SEA.pixel.x, TEST_SEA.pixel.y).then(() => { shared.seaTestStage = 2; }, (e) => { shared.seaTestWanted = false; console.warn('[testroom] sea battle: the Bay was not reached', e); });
      return;
    }
    if (shared.seaTestStage === 1 || !shared.csa.ready()) return;
    if (shared.seaTestStage === 2) {
      const at = [player.pos[0], tvSeaY(), player.pos[2]];
      let bow = [0, 0, 1], sea = -1;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4, run = tvSeaLandAlong(at, Math.sin(a), Math.cos(a));
        if (run > sea) { sea = run; bow = [Math.sin(a), 0, Math.cos(a)]; }
      }
      let boat = null;
      shared.csaCall(() => { boat = shared.csaRuntime.PlaceBoat(at, bow, TEST_SEA.hull, 0, shared.csaTerrainOf(shared.csaPixelAt(at[0], at[2]))); });
      if (!boat) { shared.seaTestWanted = false; townTalk.say(TEST_SEA_TEXT.refused); return; }
      shared.csaCall(() => shared.csaRuntime.StartSailing(boat));
      shared.seaTestStage = 3;
      return;
    }
    if (!shared.csaRuntime?.isSailing() || !shared.naval) return;
    shared.seaTestWanted = false;
    const f = player.pos, heading = Math.atan2(shared.csaRuntime.state.CurrentBoat.GameObject.worldMatrix()[8], shared.csaRuntime.state.CurrentBoat.GameObject.worldMatrix()[10]);
    for (const off of [0.6, -0.6, 1.1, -1.1, 0, 1.6, -1.6, Math.PI]) {
      const b = heading + off;
      if (!shared.navalIsWater(f[0] + Math.sin(b) * TEST_SEA.range, f[2] + Math.cos(b) * TEST_SEA.range, TEST_SEA.hull)) continue;
      shared.naval.spawnShip(TEST_SEA.foe, { range: TEST_SEA.range, bearing: b });
      townTalk.say(TEST_SEA_TEXT.begun);
      return;
    }
    townTalk.say(TEST_SEA_TEXT.noRoom);
  };
  const rideOut = () => {
    if (rideOutEdge === null) rideOutEdge = locationLandingFor(startPixel.x, startPixel.y, { noMarkers: true }) ?? false;
    const edge = rideOutEdge;
    const groundThere = !!edge && Number.isFinite(heightAt(edge.pos[0], edge.pos[2]));
    if (edge && !groundThere && (shared.building || queue.length || inFlight.size)) return;
    shared.rideOutWanted = false;
    if (groundThere) {
      const pos = floorLanding(collider, edge.pos, shared.ARRIVAL_REACH, shared.ARRIVAL_LIFT);
      player.spawn(pos[0], pos[1], pos[2]);
      cam.yaw = edge.yaw;
    } else if (edge) {
      console.warn('[testroom] ride out: no terrain under the edge landing after the ring built - mounting where you stand');
    }
    setTransportModeHere(TRANSPORT_MODES.Horse);
    console.log(`[testroom] ride out: mounted ${groundThere ? 'outside the location, facing it' : 'where you stand'}`);
  };

  let _tactDoorGen = -1, _tactDoorWorld = [];
  const _tactDoorSpots = (near, range = 40) => {
    if (_tactDoorGen !== shared.doorGeneration) { _tactDoorGen = shared.doorGeneration; _tactDoorWorld = doorSpotsNear(buildingDoors, null, Infinity, shiftedDoor); }
    const out = [];
    for (const d of _tactDoorWorld) if (Math.hypot(d.pos[0] - near[0], d.pos[2] - near[2]) <= range) out.push(d);
    return out;
  };
  const shiftedDoor = (entry) => {
    const [px, py] = entry.pixelKey.split(',').map(Number);
    const t = state.pixelTranslation(px, py);
    const m = entry.door.matrix;
    const matrix = m.slice();
    matrix[12] = m[12] + t[0];
    matrix[13] = m[13] + t[1];
    matrix[14] = m[14] + t[2];
    return { ...entry.door, matrix };
  };
  const spawnOutsideHold = () => {
    const key = `${startPixel.x},${startPixel.y}`;
    const doors = buildingDoors.filter(entry => entry.pixelKey === key && entry.door.doorType === DOOR_TYPE.DUNGEON_ENTRANCE);
    const landing = dungeonEntranceLanding(doors.map(shiftedDoor));
    if (!landing) return false;
    const [x, y, z] = landing.pos;
    player.spawn(x, repositionFeetY(collider.heightAt(x, z), y), z);
    cam.pos = player.eyeAt();
    cam.yaw = Math.atan2(landing.normal[0], landing.normal[2]);
    cam.pitch = 0;
    return true;
  };
  return { _tactDoorSpots, rideOut, seaTest, shiftedDoor, spawnOutsideHold, testEntry, testPreset };
}
