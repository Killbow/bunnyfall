// @ts-check
import { CARAVAN_BUILDING_KEY, CARAVAN_TEXT, CARAVAN_ROOM_MODEL_ID, caravanRoomBlock, readCaravanRoom } from './caravanRoom.js';
import { BUILDING_TYPES } from '../world/buildingNames.js';
import { trs } from '../world/mat4.js';
import { caravanRoomModel, CARAVAN_ENTER, CARAVAN_LANTERN } from '../world/caravanRoomModel.js';
import { wagonArt, wagonLookArt, isGlassRecord, lookRecord, LOOK_RECORDS, LOOK_RECORD_STRIDE, TEX, WAGON_ARCHIVE } from '../world/wagonArt.js';
import { readWagonLook, CARAVAN_INSIDE_LOOKS, CARAVAN_INSIDE_PARTS } from './wagonLooks.js';
import { toColor32 } from '../formats/color32Order.js';
import { dfLook, lookSeed } from '../world/dfLook.js';
import { wearPainted } from '../systems/studioArt/studioArt.js';
import { quatRotate } from '../world/quat.js';
import { WAGON_MODE } from './horseCartLaw.js';

import { CARAVAN_STANDS_NATIVES, CARAVAN_STANDS_TURN, turnGap } from './caravanRoom.js';
import { repositionFeetY, heldInSolid, openGroundNear } from '../player/enterExit.js';
export { CARAVAN_STANDS_NATIVES };

/**
 * A landing inside a static solid moves to the nearest open ground (above the sea when `seaY` is given), or stays
 * at the door spot if none is open.
 * @param {any} collider
 * @param {number[]} p
 * @param {(() => number) | null} [seaY]
 */
export function caravanStepOut(collider, p, seaY = null) {
  const at = [p[0], repositionFeetY(collider.heightAt(p[0], p[2]), p[1]), p[2]];
  return heldInSolid(collider, at) ? openGroundNear(collider, p[0], p[2], { dry: seaY ? (floor) => floor >= seaY() : null }) ?? at : at;
}
const parkedTurnOf = (st) => (Number.isFinite(st.HeadingX) && Number.isFinite(st.HeadingZ) && (st.HeadingX || st.HeadingZ) ? (Math.atan2(st.HeadingX, st.HeadingZ) * 180) / Math.PI : null);
export const parkedCaravanAt = (st) => (st && st.Mode === WAGON_MODE.Deployed && Number.isFinite(st.WorldX) && Number.isFinite(st.WorldZ) ? [st.WorldX, st.WorldZ, parkedTurnOf(st)] : null);
export const caravanStandsAt = (room, at) => !!room && Array.isArray(at) && Math.hypot(room.origin[0] - at[0], room.origin[2] - at[1]) <= CARAVAN_STANDS_NATIVES
  && (!Number.isFinite(at[2]) || turnGap(room.turn, at[2]) <= CARAVAN_STANDS_TURN);

// The room's faces use live records (choice 9) that the paint is uploaded into, so a repaint shows on the next
// frame without rebuilding the merged mesh.
export const CARAVAN_LIVE_CHOICE = 9;
export function caravanRoomRecords() {
  const out = {};
  for (const part of CARAVAN_INSIDE_PARTS) for (const rec of LOOK_RECORDS[part]) out[Object.keys(TEX).find((k) => TEX[k] === rec)] = lookRecord(rec, CARAVAN_LIVE_CHOICE);
  return out;
}

export function caravanRoomPictures(look) {
  const l = readWagonLook(look);
  const built = new Map(wagonArt());
  const out = [];
  for (const part of CARAVAN_INSIDE_PARTS) {
    const i = l[part[0]];
    const painted = i ? new Map(wagonLookArt(part, i, CARAVAN_INSIDE_LOOKS[part][i]).map(([rec, pic]) => [rec % LOOK_RECORD_STRIDE, pic])) : null;
    for (const rec of LOOK_RECORDS[part]) out.push([lookRecord(rec, CARAVAN_LIVE_CHOICE), painted?.get(rec) ?? built.get(rec), painted?.has(rec) ? lookRecord(rec, i) : rec]);
  }
  return out;
}

const _painted = new WeakMap();
// Each record is evicted before upload, because the renderer keeps the first picture uploaded under a key.
export function paintCaravanRoom(renderer, look) {
  if (!renderer?.uploadTexture) return;
  const sig = JSON.stringify(readWagonLook(look));
  const live = Object.values(caravanRoomRecords());
  if (_painted.get(renderer) === sig && live.every((r) => renderer.heldTexture?.(WAGON_ARCHIVE, r, isGlassRecord(r) ? {} : { opaque: true }))) return;
  _painted.set(renderer, sig);
  for (const [rec, pic, from] of caravanRoomPictures(look)) {
    const key = `${WAGON_ARCHIVE}_${rec}`;
    wearPainted(WAGON_ARCHIVE, from, () => toColor32(dfLook(pic, lookSeed(WAGON_ARCHIVE, rec % LOOK_RECORD_STRIDE))), (c32) => {
      renderer.evictTexture?.(key); renderer.evictTexture?.(`${key}#opaque`);
      renderer.uploadTexture(WAGON_ARCHIVE, rec, c32, isGlassRecord(rec) ? { cutout: true } : { opaque: true });
    // The slot key lets a newer paint win over a picture from an older paint that is still loading.
    }, { slot: key });
  }
}

export const caravanTurnOf = (rotation) => { const f = quatRotate(rotation, [0, 0, 1]); return (Math.atan2(f[0], f[2]) * 180) / Math.PI; };

export function caravanRoomEntry(saved, fromNative, { look = null, renderer = null } = {}) {
  const room = readCaravanRoom(saved);
  if (!room || typeof fromNative !== 'function') return null;
  const origin = fromNative(room.origin);
  if (!Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)) return null;
  const dfBlock = caravanRoomBlock(CARAVAN_ENTER, CARAVAN_LANTERN);
  paintCaravanRoom(renderer, look);
  const door = { matrix: trs(...origin, 0, room.turn, 0), blockIndex: dfBlock.index, recordIndex: 0, doorIndex: 0, centre: { x: 0, y: 0, z: 0 } };
  // `sailingCabin` is the interior host's single private-room slot, shared by ship cabins and caravan rooms.
  const hit = { dfBlock, recordIndex: 0, door, climateBase: 2, season: 0, sailingCabin: room, roomModels: new Map([[CARAVAN_ROOM_MODEL_ID, caravanRoomModel({ records: caravanRoomRecords() })]]) };
  const building = { buildingType: BUILDING_TYPES.Ship, buildingKey: CARAVAN_BUILDING_KEY, regionIndex: -1, name: 'Caravan', factionId: 0, quality: 0, insideOpenShop: false };
  return { hit, entries: [hit], building, room };
}

export const caravanDescriptorAt = (at, toNative) => readCaravanRoom({ v: 2, kind: 'caravan', origin: toNative(at.position), turn: caravanTurnOf(at.rotation), step: toNative(at.step), yaw: at.yaw });

export function createCaravanAccess(deps) {
  let entering = false;
  async function go(at, visit) {
    const room = caravanDescriptorAt(at, deps.toNative);
    if (!room) return false;
    entering = true;
    try {
      const entered = !!(await (visit ? deps.enterInterior(room, visit) : deps.enterInterior(room)));
      if (!entered) deps.say(CARAVAN_TEXT.unavailable);
      return entered;
    } catch (e) { deps.log?.(e); deps.say(CARAVAN_TEXT.unavailable); return false; } finally { entering = false; }
  }
  return {
    fromNative: deps.fromNative,
    look: () => deps.look?.() ?? null,
    paint: (part, i) => deps.paint?.(part, i) ?? null,
    canRestore: (saved, at = deps.parkedAt?.()) => { const room = readCaravanRoom(saved); return deps.available() && !!room && !!deps.ownsCaravan?.() && (at === undefined || caravanStandsAt(room, at)); },
    async enter() {
      if (entering || deps.mode() !== 'exterior' || deps.busy()) return false;
      const at = deps.parked();
      if (!at || !deps.available()) { deps.say(at ? CARAVAN_TEXT.unavailable : CARAVAN_TEXT.notHere); return false; }
      return go(at, null);
    },
    async visit(t, room) {
      if (entering || deps.mode() !== 'exterior' || deps.busy() || !t || typeof room !== 'string' || !room || typeof t.owner !== 'string' || !t.owner) return false;
      if (!deps.available()) { deps.say(CARAVAN_TEXT.unavailable); return false; }
      return go(t, { privateRoom: room, cabinOwner: t.owner, look: t.look ?? null, k: t.k, at: Array.isArray(t.at) ? [...t.at] : null, cell: typeof t.cell === 'string' ? t.cell : null });
    },
    returnToWagon(saved) {
      const room = readCaravanRoom(saved);
      if (!room) return null;
      const at = deps.fromNative(room.step);
      return { position: deps.ground ? deps.ground(at) : at, yaw: room.yaw };
    },
  };
}

const _roomGpus = new WeakMap();
// The interior build calls `getGpuMesh` before it reads `cpuModels`, so the room model is put into `cpuModels`
// there.
export function serveRoomModels(hold, roomModels, renderer, cpuModels) {
  if (!hold || !roomModels?.size) return hold;
  let cache = _roomGpus.get(renderer);
  if (!cache) _roomGpus.set(renderer, (cache = new Map()));
  const gpuOf = (id) => {
    const cpu = roomModels.get(id);
    const sig = `${id}|${cpu.subMeshes.map((sm) => sm.textureRecord).join(',')}`;
    if (!cache.has(sig)) {
      cache.set(sig, renderer?.createMesh ? renderer.createMesh(cpu) : null);
      if (cache.size > 4) { const [k, old] = cache.entries().next().value; cache.delete(k); if (old) renderer.destroyMesh?.(old); }
    }
    return cache.get(sig);
  };
  const base = hold.getGpuMesh;
  hold.getGpuMesh = (id, ...rest) => {
    if (!roomModels.has(id)) return base(id, ...rest);
    cpuModels?.set?.(id, roomModels.get(id));
    return Promise.resolve(gpuOf(id));
  };
  return hold;
}
