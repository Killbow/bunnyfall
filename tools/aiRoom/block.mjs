// AI-ROOMS: assemble a room (an RDB block) as DFU world-data JSON, the shape `blockFromJson`
// (src/formats/worldDataReplacement.js) reads: a model reference list and 16 object roots, each root holding Model,
// Flat and Light objects. Metres in, raw units out (1 unit = 0.025 m; y is -up in a block).
//
// Everything a flat or a door needs besides its place is CLONED FROM WHAT THE CLASSIC BLOCKS DO, measured over all 187
// of them: a door is a 'DOR' model at the port with lock 0 (1,983 of them), an enemy is the plain 199_15 marker, loot the
// plain 199_19, a quest marker the plain 199_11, a quest item the plain 199_18, a torch the plain 210_17.

import { PORTS, DOOR_W } from './shell.mjs';

export const RAW = 40;
/** Positions a room's objects may use; rooms are placed this far apart (all.mjs) from 60,000,000, past every classic block. */
export const POSITION_SPAN = 100000;   // units per metre
const u = (m) => Math.round(m * RAW);
export const DOOR_MODELS = Object.freeze({ N: 55003, S: 55001, W: 55001, E: 55004 });   // as the classic edge doors
/** The classic pose of an edge door (raw units): where its origin is and how it is turned (units of 360/2048 degrees). */
export function doorPose(edge, port) {
  const at = u(PORTS[port].at), half = u(DOOR_W / 2);
  if (edge === 'N') return { x: at - half, z: 2, rot: 0 };
  if (edge === 'S') return { x: at - half, z: 2048, rot: 0 };
  if (edge === 'W') return { x: 2, z: at - half, rot: 512 };
  return { x: 2048, z: at + half, rot: -512 };
}

export const FLATS = Object.freeze({   // [archive, record, flags, magnitude, sound, faction]
  enemy: [199, 15, 0, 0, 0, 0],
  loot: [199, 19, 0, 0, 0, 0],
  quest: [199, 11, 0, 0, 0, 0],
  questItem: [199, 18, 0, 0, 0, 0],
  randomFlat: [199, 20, 0, 0, 0, 0],
  torch: [210, 17, 0, 0, 0, 0],
  torchB: [210, 16, 0, 0, 0, 0],
  brazier: [210, 0, 0, 0, 0, 0],
  candles: [210, 3, 0, 0, 0, 0],
  skullCandles: [210, 4, 0, 0, 0, 0],
  candelabra: [210, 5, 0, 0, 0, 0],
  chandelier: [210, 7, 0, 0, 0, 0],
});

export class RoomBlock {
  /** `position` is the block's place among every block's (a classic block's is its file offset, to 33 million): an
   *  action door's load id is that plus the object's own, so no two rooms may share one (saves key doors by it). */
  constructor({ name, index, position }) {
    this.name = name; this.index = index; this.position = position; this.refs = []; this.refIndex = new Map(); this.roots = Array.from({ length: 16 }, () => []); this.n = 0; this.nextPos = 100;
    this.counts = { model: 0, flat: 0, light: 0, enemy: 0, loot: 0, quest: 0 };
  }
  ref(id, description = 'XXX') {
    if (!this.refIndex.has(id)) { this.refIndex.set(id, this.refs.length); this.refs.push({ ModelId: String(id), ModelIdNum: id, Description: description }); }
    return this.refIndex.get(id);
  }
  _root(x, z) { const c = Math.min(3, Math.floor(x / 1024)), r = Math.min(3, Math.floor(z / 1024)); return this.roots[r * 4 + c]; }
  _pos() { this.nextPos += 100; return this.nextPos; }
  /** A model at raw (x, z) and raw y (-up); rot in raw rotation units. */
  modelRaw(id, x, y, z, rot = 0, { description = 'XXX', door = false } = {}) {
    const pos = this._pos();
    const action = door
      ? { Position: this._pos(), Axis: 0, Duration: 0, Magnitude: 0, NextObjectOffset: -2, PreviousObjectOffset: -1, NextObjectIndex: -1, Flags: 0 }
      : { Position: 0, Axis: 0, Duration: 0, Magnitude: 0, NextObjectOffset: 0, PreviousObjectOffset: -1, NextObjectIndex: -1, Flags: 0 };
    this._root(x, z).push({
      Position: pos, Index: this.n++, XPos: x, YPos: y, ZPos: z, Type: 'Model',
      Resources: { ModelResource: { XRotation: 0, YRotation: rot, ZRotation: 0, ModelIndex: this.ref(id, door ? 'DOR' : description), TriggerFlag_StartingLock: 0, SoundIndex: 0, ActionResource: action } },
    });
    this.counts.model++;
  }
  /** A model at (xm, ym, zm) metres, ym the height UP; rotation in degrees. */
  model(id, xm, ym, zm, deg = 0) { this.modelRaw(id, u(xm), -u(ym), u(zm), Math.round((deg / 360) * 2048)); }
  door(edge, port) { const p = doorPose(edge, port); this.modelRaw(DOOR_MODELS[edge], p.x, -u(PORTS[port].floor), p.z, p.rot, { door: true }); }
  light(xm, ym, zm, radius = 90) {
    this._root(u(xm), u(zm)).push({ Position: this._pos(), Index: this.n++, XPos: u(xm), YPos: -u(ym), ZPos: u(zm), Type: 'Light', Resources: { LightResource: { Unknown1: 32, Unknown2: 4294967294, Radius: radius } } });
    this.counts.light++;
  }
  flat(kind, xm, ym, zm) {
    const [archive, record, flags, mag, snd, fac] = FLATS[kind];
    this._root(u(xm), u(zm)).push({ Position: this._pos(), Index: this.n++, XPos: u(xm), YPos: -u(ym), ZPos: u(zm), Type: 'Flat',
      Resources: { FlatResource: { Position: this._pos(), TextureArchive: archive, TextureRecord: record, Flags: flags, Magnitude: mag, SoundIndex: snd, FactionOrMobileId: fac, NextObjectOffset: 0, Action: 0 } } });
    this.counts.flat++;
    if (kind in this.counts) this.counts[kind]++;
  }
  toJson() {
    if (this.nextPos >= POSITION_SPAN) throw new Error(`${this.name}: ${this.nextPos} object positions - past the ${POSITION_SPAN} a room may use`);
    return {
      Position: this.position, Index: this.index, Name: this.name, Type: 'Rdb',
      RmbBlock: { FldHeader: { NumBlockDataRecords: 0, NumMisc3dObjectRecords: 0, NumMiscFlatObjectRecords: 0, BlockPositions: null, BuildingDataList: null, BlockDataSizes: null, GroundData: {}, AutoMapData: null, Name: null, OtherNames: null }, SubRecords: null, Misc3dObjectRecords: null, MiscFlatObjectRecords: null },
      RdbBlock: { ModelReferenceList: this.refs, ObjectRootList: this.roots.map((r) => ({ RdbObjects: r.length ? r : null })) },
      RdiBlock: { Data: null },
    };
  }
}
