// @ts-check
// Placed pieces are saved in the room's own unturned frame (`roomToSaved` / `savedToRoom`), so furniture keeps its
// place when the caravan parks facing another way. A v1 descriptor reads as unturned.
import { GLOBAL_SCALE } from '../world/meshReader.js';
import { EDITOR_FLATS_ARCHIVE } from '../world/rmbFlats.js';
import { INTERIOR_MARKER } from '../world/interiorLayout.js';

export const CARAVAN_BLOCK = 'CARAVAN [WAGONS2]';
export const CARAVAN_ROOM_MODEL_ID = -38181;
// A parked caravan does not drift, so one more than 2 m (80 natives) from where its room was entered counts as
// re-parked.
export const CARAVAN_STANDS_NATIVES = 80;
// A caravan re-parked more than this many degrees away is a different room; the lean of its pose on the ground
// stays well under it.
export const CARAVAN_STANDS_TURN = 15;
export const turnGap = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
export const CARAVAN_LANTERN_FLAT = Object.freeze([210, 22]);
// The save's scene-cache key for the caravan room; changing it orphans every saved room.
export const CARAVAN_SCENE_NAME = 'Caravan [WAGONS1]';
// A negative key that no town building or ship cabin (`-uid`) uses.
export const CARAVAN_BUILDING_KEY = -2_000_000_001;
export const CARAVAN_TEXT = Object.freeze({
  enter: 'Step inside',
  exit: 'Step outside',
  where: 'Your caravan',
  unavailable: 'Your caravan is unavailable here.',
  notHere: 'Your caravan is not here.',
  outside: 'You stand outside the caravan.',
});

const vec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e9);
const angle = (v) => Number.isFinite(v) && Math.abs(v) <= 1e9;
export function readCaravanRoom(v) {
  if (!v || (v.v !== 1 && v.v !== 2) || v.kind !== 'caravan' || !vec(v.origin) || !vec(v.step) || !angle(v.yaw)) return null;
  const turn = v.v === 2 ? v.turn : 0;
  if (!angle(turn)) return null;
  return { v: 2, kind: 'caravan', origin: [...v.origin], turn, step: [...v.step], yaw: v.yaw };
}
export const isCaravanRoom = (room) => room?.kind === 'caravan';

const rmbPoint = ([x, y, z]) => ({ xPos: x / GLOBAL_SCALE, yPos: -y / GLOBAL_SCALE, zPos: z / GLOBAL_SCALE });
export function caravanRoomBlock(enter, lantern) {
  return {
    name: CARAVAN_BLOCK, index: -1,
    rmbBlock: { subRecords: [{ interior: {
      header: { num3dObjectRecords: 1 },
      block3dObjectRecords: [{ modelIdNum: CARAVAN_ROOM_MODEL_ID, objectType: 0, xPos: 0, yPos: 0, zPos: 0, xRotation: 0, yRotation: 0, zRotation: 0 }],
      blockFlatObjectRecords: [
        { textureArchive: EDITOR_FLATS_ARCHIVE, textureRecord: INTERIOR_MARKER.ENTER, ...rmbPoint(enter) },
        { textureArchive: CARAVAN_LANTERN_FLAT[0], textureRecord: CARAVAN_LANTERN_FLAT[1], ...rmbPoint(lantern), hang: true },
      ],
      blockDoorRecords: [], blockPeopleRecords: [], blockSection3Records: [],
    } }] },
  };
}

export function roomToSaved(p, turn) {
  const a = (-turn * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
}
export function savedToRoom(p, turn) { return roomToSaved(p, -turn); }

const wrapYaw = (d) => { const w = ((d % 360) + 360) % 360; return w > 180 ? w - 360 : w; };
// Pass `turn` to map this visit's frame to the saved unturned frame, and `-turn` for the reverse.
export function turnCaravanScene(data, turn) {
  if (!data || !turn) return data;
  const p3 = (p) => (Array.isArray(p) && p.length === 3 && p.every(Number.isFinite) ? roomToSaved(p, turn) : p);
  const list = (v, f) => (Array.isArray(v) ? v.map((d) => (d && typeof d === 'object' ? f(d) : d)) : v);
  return {
    ...data,
    droppedPiles: list(data.droppedPiles, (d) => ({ ...d, pos: p3(d.pos) })),
    droppedTorches: list(data.droppedTorches, (d) => ({ ...d, position: p3(d.position) })),
    decor: list(data.decor, (d) => ({ ...d, pos: p3(d.pos), ...(Array.isArray(d.rot) && Number.isFinite(d.rot[0]) ? { rot: [wrapYaw(d.rot[0] - turn), ...d.rot.slice(1)] } : {}) })),
  };
}
