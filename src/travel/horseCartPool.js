// @ts-check
import { GLOBAL_SCALE, RAY_DISTANCE, pickActivatableHit } from '../player/activate.js';
import { localAabb, transformedAabb, sphereAabb } from '../render/frustum.js';
import { multiply, transformPoint } from '../world/mat4.js';
import { mat4FromQuatPos, mat4FromQuatPosScale, quatAngleAxis, quatLookRotation, quatSlerp, quatForward, quatRotate, UNITY_QUAT_IDENTITY } from '../world/quat.js';
import { buildWagonParts, usableBounds, CARGO_DEFINITIONS, cargoPiecesShown } from './wagon41214.js';
import {
  WAGON_MODEL_ID, HORSE_VIEWS, HORSE_WALK_FRAMES, HORSE_SPRITE_WIDTH, HORSE_SPRITE_HEIGHT, HORSE_WALK_SPRITE_HEIGHT,
  calculateHorseOrientation, horseViewFor, horseTargetLabel, ACTIVATION_REACH, HORSE_BOX_CENTER, HORSE_BOX_SIZE,
  stepHorseWalk, freshHorseWalk, START_WALKING_SPEED, WAGON_MODE, HORSE_MODE,
  pickGround, STATIONARY_PROBE_HEIGHT, STATIONARY_PROBE_DISTANCE, GROUND_RETRY_SECONDS,
  HITCHED_HORSE_LOCAL_Z, NORMAL_GROUND_OFFSET, GROUND_RAY_HEIGHT, GROUND_RAY_DISTANCE, TELEPORT_DISTANCE, ROTATION_SMOOTHING_RATE, POSITION_SMOOTHING_RATE,
} from './horseCartLaw.js';
import { hitchAxle, bogieAxle, steerToward, yawed } from './horseFollow.js';
import { DeployedWagonVisual, wheelContacts, rolledAngles } from './horseCart.js';
import { PARK_REACH, PARK_TTL_MS } from '../net/wire.js';
import { lensOf } from '../net/peerBodies.js';
import { poseWhereSeen } from '../world/horseView.js';
import { thrownRecord } from './wagonWarden.js';
import { WAGON_HOVER_TEXT } from '../player/eotbWagon.js';
import { hccWireRecord, validHccRecord, hccRecordKey, easeToward, HCC_WIRE_KIND } from './horseCartWire.js';
import { eventGroundAt } from '../worldEvents/eventGround.js';
import { decodePng } from '../render/textureReplacement.js';
import { toColor32 } from '../formats/color32Order.js';
import { wagonGeometry, buildBakedWagonParts, rendererModelOf, pitchedPoint, teamSidesOf, TEAM, rigGrowOf, driverSeatFor, SHELL_CLEAR_M } from '../world/wagonModels.js';
import { seatRigInput, seatTopByte } from '../player/seatPose.js';
import { newRope, stepRope, tubeModel, tubeInto, tubeVertexCount, ROPE } from './wagonRopes.js';
import { wagonArt, WAGON_ARCHIVE, wagonLookArt, isGlassRecord, LOOK_RECORDS, LOOK_RECORD_STRIDE, lookRecord, TEX as WAGON_TEX } from '../world/wagonArt.js';
import { dfLook, lookSeed } from '../world/dfLook.js';
import { wearPainted } from '../systems/studioArt/studioArt.js';
import { caravanRoomModel } from '../world/caravanRoomModel.js';
import { readWagonLook, wagonLookOfCode, WAGON_OUTSIDE_LOOKS, CARAVAN_INSIDE_LOOKS, CARAVAN_INSIDE_PARTS } from './wagonLooks.js';
import { validWagonKind, wagonHitchOf, WAGON_KINDS, wagonHorsesOf } from './wagonKinds.js';
import { CARAVAN_TEXT } from './caravanRoom.js';
import { recolorHorse, horseLookCode, horseLookOfCode, lookSuffix } from './horseCoats.js';
import { DECOR_DRAW, DECOR_SHADOW, DECOR_SKIP, castOnly } from '../homes/decorRoom.js';
import { noteFirstUse } from '../ui/tutorials.js';

export const HORSE_ARCHIVE = 'hcc';
export const horseStillRecord = (view, look = 0) => `h${view}${lookSuffix(look)}`;
export const horseWalkRecord = (view, frame, look = 0) => `w${view}#${frame}${lookSuffix(look)}`;
const seedOfKey = (k) => { let h = 7; for (const c of k) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0; return (h >>> 0) % 65536 || 1; };
export const HORSE_LOOKS_KEPT = 16;
export const HORSE_DYE_PICTURES = 5;
export const HORSE_BILLBOARD_WIDTH = HORSE_SPRITE_WIDTH * GLOBAL_SCALE;
export const HORSE_BILLBOARD_HEIGHT = HORSE_SPRITE_HEIGHT * GLOBAL_SCALE;
export const HORSE_WALK_BILLBOARD_HEIGHT = HORSE_WALK_SPRITE_HEIGHT * GLOBAL_SCALE;
// Only my own parked wagon's box goes in this collider bucket, and the runtime's ground probes skip it.
export const WAGON_BUCKET = 'hccWagon';
export const CARAVAN_ENTER_ROW = 'wagon:enter';
export const CARAVAN_VISIT_ROW = 'caravan:visit';
export const CARAVAN_ENTRY_ROW = 'caravan:entry';
export const KEY_WAGON = 'hccWagon', KEY_FOLLOWING_WAGON = 'hccFollowingWagon', KEY_HORSE = 'hccHorse';
export const TEAM_MAX = 3;
export { WAGON_HOVER_TEXT, HORSE_BOX_CENTER, HORSE_BOX_SIZE };
export const peerKey = (owner, what) => `hccPeer:${owner}:${what}`;
export const ownedLine = (who) => (who ? `Owned by ${who}` : 'Owned by another player');
// Ten meters on either axis covers the rounding of a parked team and the easing of a live update, but not a second
// team a street away.
export const PARK_SAME_NATIVES = 400;
export const RAYCAST_ALL_MAX_HITS = 8;

const texturePath = (file) => new URL(`../../vendor/horse-cart-and-cargo/Textures/${file}`, import.meta.url).href;
const horseStillFile = (view) => `horse${view + 1}.png`;
const horseWalkFile = (view, frame) => `Walk.${view}-${frame + 1}.png`;
const WHEEL_AXIS = Object.freeze([1, 0, 0]);
const STEER_AXIS = Object.freeze([0, 1, 0]);
export const PUPPET_SEAT_REACH = 0.75;
export const PUPPET_SEAT_RISE = 0.5;
export const SEAT_GLUE_REACH = 3;
export const OUTSIDE_SKIP_REACH = 1.5;
// The collider rests a body against a face at exactly its radius, so the box is taken down only when a capsule
// reaches this far into it.
export const CAPSULE_BOX_SKIN = 0.05;
export const PEER_TEAM_DRAW_M = 400;
export const PEER_TEAM_DRAW_SLACK_M = 25;
// A harness whose ends stay within HARNESS_STILL_M for HARNESS_REST_S stops being stepped and uploaded. Stillness
// is measured from where the ends came to rest, so slow creep still wakes it.
export const HARNESS_REST_S = 3;
export const HARNESS_STILL_M = 1e-4;
export function harnessStill(ends, at) {
  if (!at || at.length !== ends.length) return false;
  for (let i = 0; i < ends.length; i++) {
    const e = ends[i], w = at[i];
    if (e.g !== w.g) return false;
    for (let k = 0; k < 3; k++) if (!(Math.abs(e.a[k] - w.a[k]) <= HARNESS_STILL_M && Math.abs(e.b[k] - w.b[k]) <= HARNESS_STILL_M)) return false;
  }
  return true;
}
export const PEER_TEAM_BOX_HALF_M = 10;
export const PEER_TEAM_BOX_UP_M = 8;
export const PEER_TEAM_BOX_DOWN_M = 2;
export function peerTeamFar(at, eye, wasFar = false) {
  if (!at || !eye) return false;
  const reach = PEER_TEAM_DRAW_M + (wasFar ? 0 : PEER_TEAM_DRAW_SLACK_M);
  const dx = at[0] - eye[0], dz = at[2] - eye[2];
  return dx * dx + dz * dz > reach * reach;
}
export function peerTeamBox(at, out = [0, 0, 0, 0, 0, 0]) {
  out[0] = at[0] - PEER_TEAM_BOX_HALF_M; out[1] = at[1] - PEER_TEAM_BOX_DOWN_M; out[2] = at[2] - PEER_TEAM_BOX_HALF_M;
  out[3] = at[0] + PEER_TEAM_BOX_HALF_M; out[4] = at[1] + PEER_TEAM_BOX_UP_M; out[5] = at[2] + PEER_TEAM_BOX_HALF_M;
  return out;
}
const ZERO3 = Object.freeze([0, 0, 0]);
const HORSE_LOCAL_BOX = Object.freeze([
  HORSE_BOX_CENTER[0] - HORSE_BOX_SIZE[0] / 2, HORSE_BOX_CENTER[1] - HORSE_BOX_SIZE[1] / 2, HORSE_BOX_CENTER[2] - HORSE_BOX_SIZE[2] / 2,
  HORSE_BOX_CENTER[0] + HORSE_BOX_SIZE[0] / 2, HORSE_BOX_CENTER[1] + HORSE_BOX_SIZE[1] / 2, HORSE_BOX_CENTER[2] + HORSE_BOX_SIZE[2] / 2,
]);
const aabbOf = (box) => ({ min: [box[0], box[1], box[2]], max: [box[3], box[4], box[5]] });
const NO_SHADOW = Object.freeze({ noShadow: true });
const WORLD_MATRIX = mat4FromQuatPos(UNITY_QUAT_IDENTITY, [0, 0, 0]);

export function boxTriangles(min, max) {
  const p = [
    min[0], min[1], min[2], max[0], min[1], min[2], max[0], max[1], min[2], min[0], max[1], min[2],
    min[0], min[1], max[2], max[0], min[1], max[2], max[0], max[1], max[2], min[0], max[1], max[2],
  ];
  const i = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
  return { positions: new Float32Array(p), indices: new Uint32Array(i) };
}

// Only the draw grows; the pose the runtime keeps, parks, saves, and sends stays at the wagon's own size.
export function grownHitchedPosition(position, hitch, g, groundYAt, baseY = position[1] - NORMAL_GROUND_OFFSET) {
  if (!(g > 1) || !hitch) return position;
  const x = hitch[0] + (position[0] - hitch[0]) * g, z = hitch[2] + (position[2] - hitch[2]) * g;
  // The ground probe starts higher as the grown axle moves farther back, because the collider meets a floor only
  // from above.
  const gy = groundYAt([x, hitch[1], z], Math.hypot(x - hitch[0], z - hitch[2]));
  const base = Number.isFinite(gy) ? gy : baseY;
  return [x, base + NORMAL_GROUND_OFFSET * g, z];
}

export function grownWheelStep(state, angle, g) {
  if (!state) return { last: angle, acc: angle };
  const step = ((((angle - state.last) % 360) + 540) % 360) - 180;
  return { last: angle, acc: (((state.acc + step / (g > 1 ? g : 1)) % 360) + 360) % 360 };
}

/** @returns {{ point:number[], distance:number, normal:number[] }[]} */
export function raycastAllOver(col, origin, dir, maxDist, skip = [WAGON_BUCKET]) {
  const hits = [];
  if (!col?.surfaceHit) return hits;
  const filter = skip.length ? { skip } : null;
  let travelled = 0;
  let o = [origin[0], origin[1], origin[2]];
  for (let n = 0; n < RAYCAST_ALL_MAX_HITS && travelled < maxDist; n++) {
    const h = col.surfaceHit(o, dir, maxDist - travelled, filter);
    if (!h || !Number.isFinite(h.dist)) break;
    const d = travelled + h.dist;
    hits.push({ point: [origin[0] + dir[0] * d, origin[1] + dir[1] * d, origin[2] + dir[2] * d], distance: d, normal: h.normal ?? [0, 1, 0] });
    const step = h.dist + 1e-3;
    travelled += step;
    o = [o[0] + dir[0] * step, o[1] + dir[1] * step, o[2] + dir[2] * step];
  }
  return hits;
}

export function createHorseCartPool({
  renderer = null, meshes = null, collider = () => null, now = () => performance.now() / 1000, threats = () => [],
  fetchFn = null, decode = decodePng, selfId = () => null, peerName = (/** @type {string} */ _id) => null, onChanged = null,
  toWire = (/** @type {number[]} */ p) => p, log = console,
  peerAnchor = (/** @type {string} */ _id) => /** @type {number[] | null} */ (null),
  wagonKind = () => 'cart', bakedWagon = /** @type {((kind: string) => Promise<any>) | null} */ (null),
  wagonLook = /** @type {() => any} */ (() => null),
  horseLook = () => 0,
  horses3d = /** @type {() => any} */ (() => null),
  enterCaravan = /** @type {(() => any) | null} */ (null),
  riders = /** @type {any} */ (null),
  wagonEntry = /** @type {() => any} */ (() => null),
  caravanEntry = /** @type {any} */ (null),
  visit = /** @type {any} */ (null),
  horses = () => 1,
  playerCapsule = /** @type {() => ({ feet: number[], height?: number, radius?: number } | null)} */ (() => null),
  bodyCapsules = /** @type {() => Array<{ feet: number[], height?: number, radius?: number } | null>} */ (() => []),
  renderShift = /** @type {() => (number[] | null)} */ (() => null),
} = {}) {
  /** @type {any} */ let runtime = null;
  let enabled = true;
  let _parts = null;
  let _partsLoading = null, _partsFailed = null;
  const _cargo = new Map();
  const _cargoLoading = new Map();
  let _bucketKey = null;
  let _stillLoading = null, _stillReady = false, _stillFailed = false;
  let _walkLoading = null, _walkReady = false, _walkFailed = false;
  const _stillPx = new Map(), _walkPx = new Map();
  const _looksUp = new Map();
  let _dyeBudget = HORSE_DYE_PICTURES;
  let _frameNo = 0;
  const _horseBatches = new Map();
  const _peers = new Map();
  const _live = new Map();
  const _kept = new Map();
  let _keptSeq = 0;
  let _lastKey = '';
  /** @type {Map<string, { n: number, lone: boolean }>} */
  const _held = new Map();
  let wardenWord = null;

  const fetchPng = async (file) => {
    const f = fetchFn ?? globalThis.fetch;
    const res = await f(texturePath(file));
    if (!res?.ok) throw new Error(`${file}: HTTP ${res?.status}`);
    return toColor32(await decode(new Uint8Array(await res.arrayBuffer())));
  };

  function ensureParts() {
    if (_parts || _partsLoading || _partsFailed || !meshes?.getGpuMesh) return;
    _partsLoading = Promise.resolve(meshes.getGpuMesh(WAGON_MODEL_ID)).then((gpu) => {
      const cpu = meshes.cpuModels?.get?.(WAGON_MODEL_ID);
      if (!gpu || !cpu) throw new Error('DFU returned no object for vanilla wagon model 41214');
      const parts = buildWagonParts(cpu);
      const up = (m) => (renderer?.createMesh ? renderer.createMesh(m) : null);
      _parts = { ...parts, gpu: { body: up(parts.body), shaftLeft: up(parts.shaftLeft), shaftRight: up(parts.shaftRight), wheelLeft: up(parts.wheelLeft), wheelRight: up(parts.wheelRight) }, box: [...parts.bounds.min, ...parts.bounds.max] };
      for (const d of CARGO_DEFINITIONS) ensureCargo(d.modelId);
      onChanged?.();
    }).catch((e) => { _partsFailed = e?.message ?? String(e); log?.error?.(`[TrailingWagon] the wagon's mesh would not build: ${_partsFailed}`); }).finally(() => { _partsLoading = null; });
  }
  function ensureCargo(modelId) {
    if (_cargo.has(modelId) || _cargoLoading.has(modelId) || !meshes?.getGpuMesh) return;
    _cargoLoading.set(modelId, Promise.resolve(meshes.getGpuMesh(modelId)).then((gpu) => { _cargo.set(modelId, gpu ?? null); }).catch(() => { _cargo.set(modelId, null); }).finally(() => _cargoLoading.delete(modelId)));
  }
  const _baked = new Map();
  let _wagonArtUp = false;
  function ensureWagonArt() {
    if (_wagonArtUp || !renderer?.uploadTexture) return;
    _wagonArtUp = true;
    for (const [rec, pic] of wagonArt()) uploadWagonPicture(rec, pic);
  }
  function uploadWagonPicture(rec, pic) {
    const opts = isGlassRecord(rec) ? { cutout: true } : { opaque: true };
    wearPainted(WAGON_ARCHIVE, rec, () => toColor32(dfLook(pic, lookSeed(WAGON_ARCHIVE, rec % LOOK_RECORD_STRIDE))), (c32, { late }) => {
      if (late) renderer.releaseTexture?.(WAGON_ARCHIVE, rec);
      renderer.uploadTexture(WAGON_ARCHIVE, rec, c32, opts);
    });
  }
  const _lookUp = new Set();
  const _remaps = new Map();
  function ensureLook(list, i, names) {
    if (!(i > 0) || !renderer?.uploadTexture || _lookUp.has(`${list}:${i}`)) return;
    _lookUp.add(`${list}:${i}`);
    for (const [rec, pic] of wagonLookArt(list, i, names[i])) uploadWagonPicture(rec, pic);
  }
  function lookRemap(kind, look, room = false) {
    const l = readWagonLook(look), k = validWagonKind(kind) ?? 'cart';
    const lists = room ? CARAVAN_INSIDE_PARTS.map((part) => [part, l[part[0]], CARAVAN_INSIDE_LOOKS[part]]) : [[k, l.o, WAGON_OUTSIDE_LOOKS[k]]];
    if (lists.every(([, i]) => !i)) return null;
    const key = room ? `room:${l.w}.${l.f}.${l.c}` : `${k}:${l.o}`;
    let map = _remaps.get(key);
    if (!map) {
      map = new Map();
      for (const [list, i, names] of lists) {
        ensureLook(list, i, names);
        for (const rec of LOOK_RECORDS[list]) if (i) map.set(`${WAGON_ARCHIVE}_${rec}`, `${WAGON_ARCHIVE}_${lookRecord(rec, i)}`);
      }
      _remaps.set(key, map);
    }
    return map;
  }
  let _roomGpu;
  const roomGpu = () => (_roomGpu === undefined ? (_roomGpu = renderer?.createMesh ? renderer.createMesh(caravanRoomModel()) : null) : _roomGpu);
  function loadBaked(kind) {
    const e = { parts: null, loading: null, failed: null };
    _baked.set(kind, e);
    e.loading = Promise.resolve().then(() => bakedWagon(kind)).then((bake) => {
      const parts = buildBakedWagonParts(wagonGeometry(bake), rendererModelOf);
      const up = (m) => (m && renderer?.createMesh ? renderer.createMesh(m) : null);
      ensureWagonArt();
      e.parts = { ...parts, gpu: { body: up(parts.body), bogie: up(parts.bogie?.model), wheels: parts.wheels.map((w) => ({ gpu: up(w.model), pivot: w.pivot, front: w.front })) }, box: [...parts.bounds.min, ...parts.bounds.max] };
      for (const d of parts.cargo) ensureCargo(d.modelId);
      onChanged?.();
    }).catch((err) => {
      e.failed = err?.message ?? String(err);
      log?.warn?.(`[TrailingWagon] the ${kind} model would not build, the classic wagon stands for it: ${e.failed}`);
      ensureParts();
    }).finally(() => { e.loading = null; });
  }
  function partsOf(kind = myKind()) {
    const k = validWagonKind(kind) ?? 'cart';
    if (bakedWagon) {
      const e = _baked.get(k);
      if (!e) { loadBaked(k); return null; }
      if (e.parts) return e.parts;
      if (!e.failed) return null;
    }
    ensureParts();
    return _parts;
  }
  const myKind = () => validWagonKind(wagonKind?.()) ?? 'cart';
  const myLook = () => readWagonLook(wagonLook?.());
  function hitchOf(kind = myKind()) {
    const k = validWagonKind(kind) ?? 'cart';
    return bakedWagon && !_baked.get(k)?.failed ? wagonHitchOf(k) : HITCHED_HORSE_LOCAL_Z;
  }
  function wagonParts() { return partsOf(myKind()); }

  function ensureStationary() {
    if (_stillReady) return true;
    if (_stillFailed || _stillLoading || !renderer?.uploadTexture) return false;
    _stillLoading = Promise.all(Array.from({ length: HORSE_VIEWS }, (_, v) => fetchPng(horseStillFile(v)).then((px) => {
      renderer.uploadTexture(HORSE_ARCHIVE, horseStillRecord(v), px);
      _stillPx.set(v, px);
    }))).then(() => { _stillReady = true; onChanged?.(); }).catch((e) => { _stillFailed = true; log?.error?.(`[TrailingWagon] the horse art would not load: ${e?.message ?? e}`); }).finally(() => { _stillLoading = null; });
    return false;
  }
  function ensureWalk() {
    if (_walkReady || _walkFailed || _walkLoading || !renderer?.uploadTexture) return;
    const jobs = [];
    for (let v = 0; v < HORSE_VIEWS; v++) for (let f = 0; f < HORSE_WALK_FRAMES; f++) jobs.push(fetchPng(horseWalkFile(v, f)).then((px) => { renderer.uploadTexture(HORSE_ARCHIVE, horseWalkRecord(v, f), px); _walkPx.set(`${v}#${f}`, px); }));
    _walkLoading = Promise.all(jobs).then(() => { _walkReady = true; }).catch((e) => { _walkFailed = true; log?.warn?.(`[TrailingWagon] the horse walk frames would not load; the standing views stay: ${e?.message ?? e}`); }).finally(() => { _walkLoading = null; });
  }
  function ensureHorseLook(look) {
    const c = horseLookCode(horseLookOfCode(look));
    if (!ensureStationary()) return false;
    if (!c) return true;
    let up = _looksUp.get(c);
    if (!up) { up = { views: 0, walks: 0, used: _frameNo }; _looksUp.set(c, up); }
    up.used = _frameNo;
    if (up.views < _stillPx.size && _dyeBudget > 0) {
      const views = [..._stillPx];
      for (; up.views < views.length && _dyeBudget > 0; up.views++, _dyeBudget--) {
        const [v, px] = views[up.views];
        renderer.uploadTexture(HORSE_ARCHIVE, horseStillRecord(v, c), recolorHorse(px, c));
      }
    }
    const still = up.views >= _stillPx.size;
    if (still && _walkReady && up.walks < _walkPx.size && _dyeBudget > 0) {
      const frames = [..._walkPx];
      for (; up.walks < frames.length && _dyeBudget > 0; up.walks++, _dyeBudget--) {
        const [k, px] = frames[up.walks];
        const [v, f] = k.split('#').map(Number);
        renderer.uploadTexture(HORSE_ARCHIVE, horseWalkRecord(v, f, c), recolorHorse(px, c));
      }
    }
    return still && (up.walks >= _walkPx.size || !_walkReady);
  }
  function dropLook(c) {
    const up = _looksUp.get(c);
    if (!up) return;
    _looksUp.delete(c);
    for (const v of [..._stillPx.keys()].slice(0, up.views)) renderer?.evictTexture?.(`${HORSE_ARCHIVE}_${horseStillRecord(v, c)}`);
    for (const k of [..._walkPx.keys()].slice(0, up.walks)) { const [v, f] = k.split('#').map(Number); renderer?.evictTexture?.(`${HORSE_ARCHIVE}_${horseWalkRecord(v, f, c)}`); }
  }
  // Never release a look drawn this frame or the last, because road teams are posed outside the pool's own frame.
  function trimLooks() {
    if (_looksUp.size <= HORSE_LOOKS_KEPT) return;
    const old = [..._looksUp].filter(([, u]) => u.used < _frameNo - 1).sort((a, b) => a[1].used - b[1].used);
    for (const [c] of old.slice(0, _looksUp.size - HORSE_LOOKS_KEPT)) dropLook(c);
  }
  const lookOfOwner = (owner) => horseLookCode(horseLookOfCode(owner === '' ? horseLook?.() : _peers.get(owner)?.horseLook ?? 0));
  const horseArt = { ensureStationary, ensureWalk, hasWalk: () => _walkReady, ensureLook: ensureHorseLook };

  const phys = {
    now,
    raycastAll: (origin, dir, maxDist) => raycastAllOver(collider(), origin, dir, maxDist),
    sphereCastClear: (origin, radius, dir, distance) => { const col = collider(); if (!col?.sphereCast) return true; const h = col.sphereCast(origin, radius, dir, distance, { skip: [WAGON_BUCKET] }); return !(h.dist < distance); },
    threats: () => threats() ?? [],
  };

  const sameMatrix = (a, b) => { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) >= 5e-4) return false; return true; };
  function standBox(bucket, m, prevKey, parts = partsOf(myKind())) {
    const col = collider();
    if (!col?.addMesh || !parts) return prevKey;
    if (m ? sameMatrix(m, prevKey) : prevKey === null) return prevKey;
    const key = m ? Float64Array.from(m) : null;
    col.removeBucket?.(bucket);
    if (!m) return null;
    const b = usableBounds(parts.bounds);
    const tri = boxTriangles(b.min, b.max);
    col.addMesh(bucket, tri.positions, tri.indices, m);
    return key;
  }
  let _bucketParts = null;
  function standWagonCollider(m, parts = partsOf(myKind())) {
    if (parts !== _bucketParts) { _bucketKey = standBox(WAGON_BUCKET, null, _bucketKey, parts); _bucketParts = parts; }
    _bucketKey = standBox(WAGON_BUCKET, m, _bucketKey, parts);
  }
  // The box faces are two-sided and push no body out, so the box is never placed around the player or a companion;
  // it appears once they step clear.
  function capsuleInBox(m, parts) {
    if (!m || !parts?.bounds) return false;
    if (oneInBox(playerCapsule?.(), m, parts)) return true;
    for (const c of bodyCapsules?.() ?? []) if (oneInBox(c, m, parts)) return true;
    return false;
  }
  function oneInBox(c, m, parts) {
    if (!c?.feet) return false;
    const b = usableBounds(parts.bounds), r = c.radius ?? 0.35, h = Math.max(2 * r, c.height ?? 1.8), reach = r - CAPSULE_BOX_SKIN;
    for (let i = 0; i <= 4; i++) {
      const y = c.feet[1] + r + ((h - 2 * r) * i) / 4;
      const d = [c.feet[0] - m[12], y - m[13], c.feet[2] - m[14]];
      const l = [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[4] * d[0] + m[5] * d[1] + m[6] * d[2], m[8] * d[0] + m[9] * d[1] + m[10] * d[2]];
      let q = 0;
      for (let k = 0; k < 3; k++) { const e = Math.max(b.min[k] - l[k], 0, l[k] - b.max[k]); q += e * e; }
      if (q < reach * reach) return true;
    }
    return false;
  }

  const wagonMatrix = (position, rotation) => mat4FromQuatPos(rotation, position);
  const wheelMatrix = (m, pivot, angle) => multiply(m, mat4FromQuatPos(quatAngleAxis(angle, WHEEL_AXIS), pivot));
  const cargoMatrix = (m, def) => multiply(m, mat4FromQuatPosScale(def.rotation, def.position, def.scale));

  const pitchedMatrix = (m, parts, pitch) => {
    if (!pitch || !parts?.axlePivot) return m;
    const a = parts.axlePivot;
    return multiply(multiply(m, mat4FromQuatPos(quatAngleAxis(-pitch, WHEEL_AXIS), a)), mat4FromQuatPos(UNITY_QUAT_IDENTITY, [-a[0], -a[1], -a[2]]));
  };
  const steeredMatrix = (kingpin, steer) => multiply(mat4FromQuatPos(quatAngleAxis(steer, STEER_AXIS), kingpin), mat4FromQuatPos(UNITY_QUAT_IDENTITY, [-kingpin[0], -kingpin[1], -kingpin[2]]));
  function drawWagon(r, texRemap, position, rotation, tier, turn, scale = 1, kind = myKind(), hitched = false, look = null) {
    const parts = partsOf(kind);
    if (!parts?.gpu?.body || !r?.drawMesh) return false;
    const grown = scale > 1;
    const m = grown ? mat4FromQuatPosScale(rotation, position, [scale, scale, scale]) : wagonMatrix(position, rotation);
    const g = parts.gpu;
    const o = grown ? NO_SHADOW : undefined;
    const angleOf = (i) => turn?.angles?.[i] ?? turn?.angle ?? 0;
    if (g.wheels) {
      const pitch = hitched ? parts.hitchPitch ?? 0 : 0;
      const body = pitchedMatrix(m, parts, pitch);
      const l = typeof look === 'number' ? wagonLookOfCode(look) : readWagonLook(look);
      const paint = lookRemap(kind, l) ?? texRemap;
      r.drawMesh(g.body, body, paint, o);
      const steered = parts.bogie ? steeredMatrix(parts.bogie.kingpin, turn?.steer ?? 0) : null;
      if (g.bogie && steered) r.drawMesh(g.bogie, multiply(body, steered), paint, o);
      const front = steered ? multiply(m, steered) : m;
      g.wheels.forEach((w, i) => { if (w.gpu) r.drawMesh(w.gpu, wheelMatrix(w.front ? front : m, w.pivot, angleOf(i)), paint, o); });
      for (const def of parts.cargo) if (tier >= def.threshold) { const gpu = _cargo.get(def.modelId); if (gpu) r.drawMesh(gpu, cargoMatrix(body, def), texRemap, o); }
      if (parts.kind === 'caravan') { const room = roomGpu(); if (room) r.drawMesh(room, body, lookRemap(kind, l, true) ?? texRemap, NO_SHADOW); }
      return true;
    }
    r.drawMesh(g.body, m, texRemap, o);
    if (g.shaftLeft) r.drawMesh(g.shaftLeft, m, texRemap, o);
    if (g.shaftRight) r.drawMesh(g.shaftRight, m, texRemap, o);
    if (g.wheelLeft) r.drawMesh(g.wheelLeft, wheelMatrix(m, parts.wheelLeftPivot, angleOf(0)), texRemap, o);
    if (g.wheelRight) r.drawMesh(g.wheelRight, wheelMatrix(m, parts.wheelRightPivot, angleOf(1)), texRemap, o);
    for (const def of cargoPiecesShown(tier)) { const gpu = _cargo.get(def.modelId); if (gpu) r.drawMesh(gpu, cargoMatrix(m, def), texRemap, o); }
    return true;
  }
  const _grownWheels = new Map();
  function grownTurn(owner, turn, g) {
    if (!(g > 1) || !turn) { _grownWheels.delete(owner); return turn; }
    const clocks = _grownWheels.get(owner) ?? new Map();
    _grownWheels.set(owner, clocks);
    const step = (wheel, angle) => { const next = grownWheelStep(clocks.get(wheel) ?? null, angle, g); clocks.set(wheel, next); return next.acc; };
    return { ...turn, angle: step('angle', turn.angle ?? 0), angles: turn.angles ? turn.angles.map((a, i) => step(i, a)) : null };
  }
  function turnPeer(p) {
    const parts = p.wagon && p.shownWagon ? partsOf(p.wagon.model) : null;
    if (!parts) return;
    const rotation = p.shownRotation ?? p.wagon.rotation;
    if (p.wagon.kind === HCC_WIRE_KIND.Following && parts.bogie && p.shownHorse) p.steer = steerToward(p.shownWagon, quatForward(rotation), p.shownHorse, parts.bogie);
    if (p.turn && p.turn.model !== p.wagon.model) { p.turn = null; p.steer = 0; }
    const contacts = wheelContacts(parts, p.shownWagon, rotation, p.steer ?? 0);
    const t = p.turn ?? (p.turn = { model: p.wagon.model, angle: p.wagon.angle ?? 0, angles: contacts.map(() => p.wagon.angle ?? 0), contacts: null, steer: 0 });
    if (p.wagon.kind === HCC_WIRE_KIND.Deployed) { t.contacts = contacts; return; }
    const was = t.contacts?.[0]?.p, at = contacts[0]?.p;
    const leapt = !!was && !!at && Math.hypot(at[0] - was[0], at[2] - was[2]) > TELEPORT_DISTANCE;
    t.angles = rolledAngles(t.angles, leapt ? null : t.contacts, contacts, parts);
    t.contacts = contacts; t.steer = p.steer ?? 0;
  }

  function shown() {
    if (!runtime || !enabled) return null;
    const v = runtime.view();
    let wagon = null;
    if (v.deployed?.isGrounded) wagon = { kind: HCC_WIRE_KIND.Deployed, position: v.deployed.position, rotation: v.deployed.rotation, tier: v.deployed.cargoTier, angle: 0, hitched: v.state?.HorseMode === HORSE_MODE.HitchedToWagon };
    else if (v.moving?.pose?.active) wagon = { kind: v.teamFollowing ? HCC_WIRE_KIND.Following : HCC_WIRE_KIND.Trailing, position: v.moving.pose.position, rotation: v.moving.pose.rotation, tier: v.moving.cargoTier, angle: v.moving.wheel?.angle ?? 0, hitch: v.moving.pose.hitch ?? null, axle: v.moving.pose.axle ?? null, hitched: true };
    if (wagon) { wagon.model = myKind(); wagon.passengers = riders?.passengers?.() ?? []; }
    if (wagon) wagon.look = myLook();
    if (wagon) wagon.turn = wagon.kind === HCC_WIRE_KIND.Deployed ? v.rest ?? null : { angle: v.moving.wheel?.angle ?? 0, angles: v.moving.wheel?.angles ?? null, steer: v.moving.pose.steer ?? 0 };
    const entry = wagon ? wagonEntry?.() : null;
    if (entry) { wagon.entry = entry.entry; wagon.guild = entry.guild ?? null; }
    const h = v.horse;
    const horse = h?.isInteractive ? { position: h.position, forward: h.forward, frame: h.walk?.animationFrame ?? 0, walking: !!h.walk?.walking } : null;
    return { wagon, horse, name: v.state?.HorseName ?? '', look: lookOfOwner(''), interaction: !!v.moving?.interaction, deployed: !!v.deployed?.isGrounded, go: riders?.go?.() ?? null, declined: riders?.declined?.() ?? [] };
  }

  function horseBatch(owner) {
    let b = _horseBatches.get(owner);
    if (b || !renderer?.createBillboardBatch) return b ?? null;
    b = renderer.createBillboardBatch(HORSE_ARCHIVE, horseStillRecord(0), { w: HORSE_BILLBOARD_WIDTH, h: HORSE_BILLBOARD_HEIGHT }, [[0, 0, 0]]);
    b.origin = [0, 0, 0];
    _horseBatches.set(owner, b);
    return b;
  }
  function dropHorseBatch(owner) { const b = _horseBatches.get(owner); if (b) { renderer?.destroyBillboardBatch?.(b); _horseBatches.delete(owner); } }
  const teamKey = (owner, i) => (i ? `${owner}|${i}` : owner);
  function dropTeamBatches(owner, from = 0) { for (let i = from; i < TEAM_MAX; i++) dropHorseBatch(teamKey(owner, i)); }
  function poseHorseBatch(b, cameraPos, horse, g = 1, look = 0) {
    const view = horseViewFor(calculateHorseOrientation(cameraPos, horse.position, horse.forward));
    if (!view) return;
    const walk = _walkReady;
    const c = look && ensureHorseLook(look) ? horseLookCode(horseLookOfCode(look)) : 0;
    b.record = walk ? horseWalkRecord(view.view, horse.frame, c) : horseStillRecord(view.view, c);
    const h = walk ? HORSE_WALK_BILLBOARD_HEIGHT : HORSE_BILLBOARD_HEIGHT;
    b.size = { w: (view.flip ? -HORSE_BILLBOARD_WIDTH : HORSE_BILLBOARD_WIDTH) * g, h: h * g };
    b.origin[0] = horse.position[0]; b.origin[1] = horse.position[1]; b.origin[2] = horse.position[2];
  }
  /** @type {Map<string, { horse: any, rig: any, at: number[] | null, speed: number, frame: number, conceal: any, phase: number, out: boolean }>} */
  const _h3d = new Map();
  let _dt3d = 0;
  let _h3dPhase = 0;
  const H3D_EASE = 0.15, H3D_LEAP = 40;
  function pose3dTeam(rig, owner, team, conceal, dt) {
    let i = 0;
    const cam = _cam3d;
    for (const h of team) {
      if (!h.drawn) continue;
      const key = teamKey(owner, i++);
      let e = _h3d.get(key);
      if (!e) { const horse = rig.horse(seedOfKey(key)); if (!horse) continue; e = { horse, rig, at: null, speed: 0, frame: 0, conceal: null, phase: _h3dPhase++, out: false }; _h3d.set(key, e); }
      const g = h.g ?? 1;
      let v = 0;
      if (e.at && dt > 0) v = Math.hypot(h.position[0] - e.at[0], h.position[2] - e.at[2]) / dt / g;
      if (v > H3D_LEAP) v = e.speed;
      if (!h.walking && !h.hitched) v = 0;
      e.speed += (v - e.speed) * (dt > 0 ? Math.min(1, dt / H3D_EASE) : 1);
      e.at = [h.position[0], h.position[1], h.position[2]];
      const yaw = Math.atan2(h.forward[0], h.forward[2]);
      rig.step(e.horse, { feet: h.position, yaw, speed: e.speed, dt, look: lookOfOwner(owner), pose: false });
      if (g !== 1) rig.place(e.horse, h.position, yaw, g);
      e.out = poseWhereSeen(rig, e.horse, h.position, cam, _eye, _frameNo, e.phase, e.out);
      e.frame = _frameNo; e.conceal = owner ? conceal : null;
    }
  }
  function trim3d() {
    for (const [k, e] of _h3d) if (e.frame !== _frameNo) { e.rig?.release(e.horse); _h3d.delete(k); }
  }
  let _cam3d = null;
  function draw3d(canvas, { proj, view, eye, up = null }) {
    const rig = horses3d?.();
    _cam3d = rig ? { canvas, proj, view, eye, up, lens: lensOf(proj) } : null;
    if (!rig) return 0;
    let n = 0;
    for (const e of _h3d.values()) if (e.frame === _frameNo && !e.conceal && rig.draw(e.horse, canvas, { proj, view, eye, up, fresh: e.out })) n++;
    return n;
  }
  function drawVeiled3d() {
    const rig = horses3d?.(), c = _cam3d;
    if (!rig || !c) return 0;
    let n = 0, open = false;
    const own = !!renderer?.beginCharacterSpriteBatch && !renderer.characterSpriteBatchOpen;
    // Open the batch at most once and flush it in `finally`. A batch left open makes every later body pass join it,
    // and no body draws again.
    try {
      for (const e of _h3d.values()) {
        if (e.frame !== _frameNo || !e.conceal) continue;
        if (own && !open) { renderer.beginCharacterSpriteBatch(); open = true; }
        if (rig.draw(e.horse, c.canvas, { proj: c.proj, view: c.view, eye: c.eye, up: c.up, conceal: e.conceal, fresh: e.out })) n++;
      }
    } finally { if (open) renderer.flushCharacterSpriteBatch(); }
    return n;
  }

  function poseTeam(owner, team, cameraPos, conceal = null) {
    _teams.set(owner, team);
    const rig = horses3d?.();
    if (rig?.ready()) { pose3dTeam(rig, owner, team, conceal, _dt3d); dropTeamBatches(owner, 0); return; }
    let i = 0;
    if (_stillReady) for (const h of team) {
      if (!h.drawn) continue;
      const b = horseBatch(teamKey(owner, i++));
      if (b) { poseHorseBatch(b, cameraPos, h, h.g, lookOfOwner(owner)); if (owner) b.conceal = conceal; }
    }
    dropTeamBatches(owner, i);
  }

  let peerLook = null;
  let _eye = null;
  // Draw reach is not applied under the travel view, whose camera sits hundreds of meters back over a grown world.
  const reachCuts = () => !!_eye && !_lastGrows?.grow;
  const peerTeamAt = (p) => p.wagon?.position ?? p.horse?.position ?? null;
  function frame(dt, cameraPos, gameDt = dt) {
    trim3d(); _dt3d = dt;
    _dyeBudget = HORSE_DYE_PICTURES; _frameNo++; trimLooks();
    _eye = cameraPos ? [cameraPos[0], cameraPos[1], cameraPos[2]] : null;
    if (!enabled) { if (_horseBatches.size || _peers.size || _bucketKey || _harness.size) destroyAll(); return; }
    runtime?.lateUpdate(gameDt);
    const s = shown();
    if (s?.wagon) partsOf(s.wagon.model);
    const myParts = partsOf(myKind());
    const parked = s?.deployed && s.wagon && myParts ? wagonMatrix(s.wagon.position, s.wagon.rotation) : null;
    standWagonCollider(parked && !capsuleInBox(parked, myParts) && !_held.has('') ? parked : null, myParts);
    poseTeam('', teamOf('', s, dt), cameraPos);
    for (const [owner, p] of _peers) {
      const look = peerLook?.(owner) ?? null;
      p.hidden = look === 'hidden'; p.look = p.hidden ? null : look;
      groundPeer(p);
      retarget(p);
      // A wagon of another player parked on event gate ground is hidden and not pressable on this screen, so it
      // cannot cover the gate or its portal.
      p.offGround = p.wagon?.kind === HCC_WIRE_KIND.Deployed && !!eventGroundAt(p.wagon.position);
      if (p.offGround) { p.hidden = true; p.look = null; }
      p.far = reachCuts() && peerTeamFar(peerTeamAt(p), _eye, !!p.far);
      if (p.far) {
        if (p.horse) p.shownHorse = easeToward(p.shownHorse, p.horse.position, dt);
        if (p.wagon) { p.hitch = null; p.shownWagon = easeToward(p.shownWagon, p.wagon.position, dt); }
        if (_teams.has(owner)) { dropTeamBatches(owner); _teams.delete(owner); }
        continue;
      }
      if (p.horse) {
        const was = p.shownHorse;
        p.shownHorse = easeToward(p.shownHorse, p.horse.position, dt);
        // The owner sends only whether the horse walks; the stride comes from the pace shown on this client.
        const pace = was && dt > 0 ? Math.hypot(p.shownHorse[0] - was[0], p.shownHorse[2] - was[2]) / dt : 0;
        p.walk = stepHorseWalk(p.walk, p.horse.walking ? Math.max(pace, 2 * START_WALKING_SPEED) : 0, dt, _walkReady);
      } else p.walk = freshHorseWalk();
      const anchor = p.wagon?.kind === HCC_WIRE_KIND.Trailing && !p.hidden ? peerAnchor(p.ownerId ?? owner) : null;
      if (anchor) hitchPeerWagon(p, anchor, dt);
      else if (p.wagon) { p.hitch = null; p.shownUp = null; p.shownWagon = easeToward(p.shownWagon, p.wagon.position, dt); p.shownRotation = p.shownRotation ? quatSlerp(p.shownRotation, p.wagon.rotation, 1 - Math.exp(-12 * dt)) : [...p.wagon.rotation]; }
      turnPeer(p);
      if (p.hidden) { dropTeamBatches(owner); _teams.delete(owner); } else poseTeam(owner, teamOf(owner, null, dt), cameraPos, p.look);
    }
    stepHarness(dt);
    // The change key is built in the wire frame, so a local origin rebase does not count as a change.
    const key = hccRecordKey(hccWireRecord(s, toWire));
    if (key !== _lastKey) { _lastKey = key; onChanged?.(); }
  }
  // A peer's trailing wagon hangs from their rider as drawn here, because the rider and the wagon updates ease on
  // different clocks and would pull apart.
  function hitchPeerWagon(p, anchor, dt) {
    const word = p.wagon.position;
    const far = !p.shownWagon || Math.hypot(p.shownWagon[0] - anchor[0], p.shownWagon[2] - anchor[2]) > TELEPORT_DISTANCE;
    const from = far ? word : p.shownWagon;
    const length = hitchOf(p.wagon.model), bogie = partsOf(p.wagon.model)?.bogie ?? null;
    const f0 = p.shownRotation ? quatForward(p.shownRotation) : null, fl0 = f0 ? Math.hypot(f0[0], f0[2]) : 0;
    const kingpinFrom = far || !bogie || !(fl0 > 1e-6) ? null : [from[0] + (f0[0] / fl0) * bogie.wheelbase, from[1], from[2] + (f0[2] / fl0) * bogie.wheelbase];
    const turn = bogie && length > bogie.wheelbase ? bogieAxle(from, kingpinFrom, anchor, length, bogie, quatForward(p.wagon.rotation)) : null;
    p.steer = turn?.steer ?? 0;
    const { axle, dir } = turn ?? hitchAxle(from, anchor, length, quatForward(p.wagon.rotation));
    const wordUp = quatRotate(p.wagon.rotation, [0, 1, 0]);
    // Use the ground height under the axle here, not the height in the word, because the shafts move the wagon away
    // from where the owner placed it.
    const gy = groundYAt([axle[0], word[1], axle[2]], 0);
    const target = Number.isFinite(gy) ? gy + NORMAL_GROUND_OFFSET * Math.max(0, wordUp[1]) : word[1];
    const y = far ? target : p.shownWagon[1] + (target - p.shownWagon[1]) * (1 - Math.exp(-POSITION_SMOOTHING_RATE * Math.max(0, dt)));
    p.shownWagon = [axle[0], y, axle[2]];
    const t = far || !p.shownUp ? 1 : 1 - Math.exp(-ROTATION_SMOOTHING_RATE * dt);
    const u = p.shownUp ? [p.shownUp[0] + (wordUp[0] - p.shownUp[0]) * t, p.shownUp[1] + (wordUp[1] - p.shownUp[1]) * t, p.shownUp[2] + (wordUp[2] - p.shownUp[2]) * t] : wordUp;
    const ul = Math.hypot(u[0], u[1], u[2]);
    const up = ul > 1e-6 ? [u[0] / ul, u[1] / ul, u[2] / ul] : [0, 1, 0];
    const d = dir[0] * up[0] + dir[1] * up[1] + dir[2] * up[2];
    const f = [dir[0] - up[0] * d, dir[1] - up[1] * d, dir[2] - up[2] * d];
    const fl = Math.hypot(f[0], f[1], f[2]);
    p.shownUp = up;
    p.shownRotation = quatLookRotation(fl > 1e-6 ? [f[0] / fl, f[1] / fl, f[2] / fl] : dir, up);
    p.hitch = [anchor[0], anchor[1], anchor[2]];
  }
  const groundYAt = (q, rise = 0) => pickGround(phys.raycastAll([q[0], q[1] + GROUND_RAY_HEIGHT + rise, q[2]], [0, -1, 0], GROUND_RAY_DISTANCE + 2 * rise), q[1])?.point?.[1] ?? null;
  const batches = () => [..._horseBatches.values()];
  const _teamBox = [0, 0, 0, 0, 0, 0];
  const teamVerdict = (f, cull) => (!cull || f.g > 1 ? DECOR_DRAW : cull(peerTeamBox(f.at, _teamBox)));
  function drawWagonSeen(r, cull, texRemap, position, rotation, tier, turn, scale = 1, kind = myKind(), hitched = false, look = null) {
    const v = teamVerdict({ at: position, g: scale }, cull);
    if (v === DECOR_SKIP) return false;
    return drawWagon(v === DECOR_SHADOW ? castOnly(r) : r, texRemap, position, rotation, tier, turn, scale, kind, hitched, look) && v === DECOR_DRAW;
  }
  function draw(r = renderer, texRemap = null, grows = {}, cull = null) {
    _lastGrows = grows ?? {};
    let n = 0;
    const s = shown();
    const mine = drawnFrameOf('', grows, s);
    if (mine) {
      const v = s.wagon.kind === HCC_WIRE_KIND.Deployed && reachCuts() && peerTeamFar(mine.at, _eye) ? DECOR_SKIP : teamVerdict(mine, cull);
      const to = v === DECOR_SHADOW ? castOnly(r) : r;
      if (v !== DECOR_SKIP && drawWagon(to, texRemap, mine.at, mine.rotation, s.wagon.tier, grownTurn('', s.wagon.turn ?? { angle: s.wagon.angle }, mine.g), mine.g, s.wagon.model, s.wagon.hitched, s.wagon.look) && v === DECOR_DRAW) n++;
    } else _grownWheels.delete('');
    for (const [owner, p] of _peers) {
      if (p.far) continue;
      const f = drawnFrameOf(owner, grows);
      if (!f) continue;
      const v = teamVerdict(f, cull);
      if (v === DECOR_SKIP) continue;
      if (drawWagon(v === DECOR_SHADOW ? castOnly(r) : r, texRemap, f.at, f.rotation, p.wagon.tier, grownTurn(owner, p.turn ?? { angle: p.wagon.angle }, f.g), f.g, p.wagon.model, f.hitched, p.wagon.look) && v === DECOR_DRAW) n++;
    }
    drawHarness(r, cull);
    return n;
  }
  function drawOutside(r = renderer, skipAt = null) {
    let n = 0;
    const s = shown();
    const frames = [['', drawnFrameOf('', {}, s), s?.wagon ?? null, s?.wagon?.turn ?? (s?.wagon ? { angle: s.wagon.angle } : null)]];
    for (const [owner, p] of _peers) if (!p.far) frames.push([owner, drawnFrameOf(owner, {}), p.wagon, p.turn ?? { angle: p.wagon?.angle ?? 0 }]);
    for (const [, f, w, turn] of frames) {
      if (!f || !w || (skipAt && Math.hypot(f.at[0] - skipAt[0], f.at[2] - skipAt[2]) < OUTSIDE_SKIP_REACH)) continue;
      if (drawWagon(r, null, f.at, f.rotation, w.tier, turn, 1, w.model, f.hitched, w.look)) n++;
    }
    return n;
  }
  function drawnFrameOf(owner, { selfGrow = 1, grow = null } = {}, s = owner === '' ? shown() : null) {
    if (_held.has(owner)) return null;
    if (owner === '') {
      if (!s?.wagon) return null;
      const driven = s.wagon.kind === HCC_WIRE_KIND.Trailing && !!s.wagon.hitch;
      const g = driven ? rigGrowOf(selfGrow, s.wagon.model, hitchOf(s.wagon.model)) : 1;
      const lag = driven ? renderShift?.() ?? null : null;
      const shift = (q) => (lag && q ? [q[0] + lag[0], q[1], q[2] + lag[2]] : q);
      const hitch = shift(s.wagon.hitch), axle = shift(s.wagon.axle), position = shift(s.wagon.position);
      const at = g > 1 && axle ? grownHitchedPosition(axle, hitch, g, groundYAt, axle[1]) : grownHitchedPosition(position, hitch, g, groundYAt);
      return { wagon: s.wagon, at, rotation: s.wagon.rotation, g, hitched: !!s.wagon.hitched, hitch };
    }
    const p = _peers.get(owner);
    if (!p?.wagon || !p.shownWagon || (p.hidden && p.wagon.kind !== HCC_WIRE_KIND.Deployed) || p.offGround) return null;
    const g = p.hitch && grow ? rigGrowOf(grow(p.hitch), p.wagon.model, hitchOf(p.wagon.model)) : 1;
    return { wagon: p.wagon, at: grownHitchedPosition(p.shownWagon, p.hitch, g, groundYAt), rotation: p.shownRotation ?? p.wagon.rotation, g, hitched: p.wagon.kind !== HCC_WIRE_KIND.Deployed || p.wagon.hitched, hitch: p.hitch ?? null };
  }
  let _lastGrows = {};
  function seatDrawn(owner, k, grows = _lastGrows) {
    const f = drawnFrameOf(owner, grows);
    const parts = f ? partsOf(f.wagon.model) : null;
    const seat = parts?.seats?.[k];
    if (!seat) return null;
    const local = pitchedPoint(parts, seat.feet, f.hitched ? parts.hitchPitch ?? 0 : 0).map((v) => v * f.g);
    const off = quatRotate(f.rotation, local), fwd = quatRotate(f.rotation, [0, 0, 1]);
    return { feet: [f.at[0] + off[0], f.at[1] + off[1], f.at[2] + off[2]], yaw: Math.atan2(fwd[0], fwd[2]) + (seat.yaw * Math.PI) / 180, g: f.g };
  }
  function puppetSeatDrawn(owner, feet, wire = null) {
    const p = _peers.get(owner);
    const n = p?.wagon && feet ? partsOf(p.wagon.model)?.seats?.length ?? 0 : 0;
    const raw = n && wire && p.toScene ? p.toScene(wire) : null;
    const on = (q, s) => !!q && !!s && Math.hypot(s.feet[0] - q[0], s.feet[2] - q[2]) <= PUPPET_SEAT_REACH && Math.abs(s.feet[1] - q[1]) <= PUPPET_SEAT_RISE;
    for (let k = 0; k < n; k++) {
      if (!on(feet, peerSeat(owner, k)) && !on(raw, wordSeat(owner, k))) continue;
      const drawn = seatDrawn(owner, k);
      return drawn && drawn.g > 1 ? drawn : null;
    }
    return null;
  }
  function seatGlue(drawable, { toWire = (q) => q, grows = _lastGrows } = {}) {
    const seated = new Map();
    for (const [peer, k] of riders?.passengers?.() ?? []) seated.set(peer, ['', k]);
    for (const [owner, p] of _peers) for (const [peer, k] of p.wagon?.passengers ?? []) if (!seated.has(peer)) seated.set(peer, [owner, k]);
    if (!seated.size) return drawable;
    for (let i = 0; i < drawable.length; i++) {
      const d = drawable[i], at = d?.shown ? seated.get(d.id) : null;
      const seat = at ? seatDrawn(at[0], at[1], grows) : null;
      if (!seat) continue;
      if (!riders?.sitsIn?.(d.id, at[0], at[1])) {
        const truly = at[0] ? peerSeat(at[0], at[1]) : mySeat(at[1]);
        const tw = truly ? toWire(truly.feet) : null;
        if (!tw || !(Math.hypot(d.shown.x - tw[0], d.shown.z - tw[2]) <= SEAT_GLUE_REACH)) continue;
      }
      const w = toWire(seat.feet);
      drawable[i] = { ...d, shown: { ...d.shown, x: w[0], y: w[1], z: w[2], deck: [0, 0, at[1]], deckKey: `wagon:${at[0]}:${at[1]}` } };
    }
    return drawable;
  }

  const _teams = new Map();
  const _teamWalk = new Map();
  function poleForward(f, parts, steer) {
    const fw = quatForward(f.rotation);
    const d = parts?.bogie && steer ? yawed(fw, steer) : fw;
    const l = Math.hypot(d[0], d[2]);
    return l > 1e-6 ? [d[0] / l, 0, d[2] / l] : [0, 0, 1];
  }
  function horsePoint(h, [x, y, z]) {
    const f = h.forward, g = h.g ?? 1;
    return [h.position[0] + (f[2] * x + f[0] * z) * g, h.position[1] + y * g, h.position[2] + (-f[0] * x + f[2] * z) * g];
  }
  function teamWalk(owner, hitch, dt, g) {
    let t = _teamWalk.get(owner);
    if (!t) { t = { at: [...hitch], walk: freshHorseWalk() }; _teamWalk.set(owner, t); }
    const step = Math.hypot(hitch[0] - t.at[0], hitch[2] - t.at[2]) / Math.max(1, g);
    if (dt > 0) t.walk = stepHorseWalk(t.walk, step > TELEPORT_DISTANCE ? 0 : step / dt, dt, _walkReady);
    t.at = [...hitch];
    return t.walk;
  }
  function drivenHorse(hitch, fwd, x, walk, g, drawn) {
    const q = [hitch[0] + fwd[2] * x, hitch[1], hitch[2] - fwd[0] * x];
    const gy = groundYAt(q, 0);
    return { position: [q[0], Number.isFinite(gy) ? gy : hitch[1] - 0.9, q[2]], forward: fwd, frame: walk?.animationFrame ?? 0, walking: !!walk?.walking, g, drawn, hitched: true, side: x };
  }
  function parkedPairHorse(w, parts) {
    const fwd = poleForward({ rotation: w.rotation }, parts, w.turn?.steer ?? 0);
    const base = parts.bogie ? (() => { const k = quatRotate(w.rotation, parts.bogie.kingpin); return [w.position[0] + k[0], w.position[1], w.position[2] + k[2]]; })() : w.position;
    const reach = hitchOf(w.model) - (parts.bogie?.wheelbase ?? 0);
    const q = [base[0] + fwd[0] * reach + fwd[2] * TEAM.side, w.position[1], base[2] + fwd[2] * reach - fwd[0] * TEAM.side];
    const gy = groundYAt(q, 0);
    return { position: [q[0], Number.isFinite(gy) ? gy : w.position[1] - NORMAL_GROUND_OFFSET, q[2]], forward: fwd, frame: 0, walking: false, g: 1, drawn: true, hitched: true, side: TEAM.side };
  }
  function teamOf(owner, s = owner === '' ? shown() : null, dt = 0, grows = _lastGrows) {
    const held = _held.get(owner) ?? null;
    if (held?.lone) { _teamWalk.delete(owner); return []; }
    const mine = owner === '';
    const p = mine ? null : _peers.get(owner);
    const w = mine ? s?.wagon ?? null : p?.wagon ?? null;
    const lone = mine ? s?.horse ?? null : p?.horse && p.shownHorse ? { ...p.horse, position: p.shownHorse, frame: p.walk?.animationFrame ?? 0 } : null;
    const f = w ? drawnFrameOf(owner, grows, mine ? s : undefined) : null;
    const parts = f ? partsOf(w.model) : null;
    const pair = !!parts?.driver && wagonHorsesOf(w.model) === 2;
    const hitch = w?.kind === HCC_WIRE_KIND.Trailing ? f?.hitch ?? null : null;
    if (f && parts && hitch) {
      const fwd = poleForward(f, parts, mine ? w.turn?.steer ?? 0 : p.turn?.steer ?? 0);
      const walk = teamWalk(owner, hitch, dt, f.g);
      return pair ? teamSidesOf(w.model).map((x) => drivenHorse(hitch, fwd, x * f.g, walk, f.g, true)) : [drivenHorse(hitch, fwd, 0, walk, f.g, false)];
    }
    _teamWalk.delete(owner);
    const out = [];
    const inHarness = !!lone && !!w && (w.kind === HCC_WIRE_KIND.Following || (w.kind === HCC_WIRE_KIND.Deployed && !!w.hitched));
    if (held) return lone && !inHarness ? [{ ...lone, g: 1, drawn: true, hitched: false, side: 0 }] : [];
    if (inHarness && parts) {
      const sides = pair ? teamSidesOf(w.model) : [0];
      for (const x of mine && pair && (horses?.() ?? 1) < 2 ? sides.slice(0, 1) : sides) {
        const f0 = lone.forward;
        out.push({ ...lone, position: [lone.position[0] + f0[2] * x, lone.position[1], lone.position[2] - f0[0] * x], g: 1, drawn: true, hitched: true, side: x });
      }
      return out;
    }
    if (lone) out.push({ ...lone, g: 1, drawn: true, hitched: false, side: 0 });
    if (mine && pair && w?.kind === HCC_WIRE_KIND.Deployed && (horses?.() ?? 1) >= 2) out.push(parkedPairHorse(w, parts));
    return out;
  }
  function driverDrawn(owner, grows = _lastGrows) {
    const s = owner === '' ? shown() : null;
    const w = owner === '' ? s?.wagon : _peers.get(owner)?.wagon;
    if (!w || w.kind !== HCC_WIRE_KIND.Trailing) return null;
    const f = drawnFrameOf(owner, grows, owner === '' ? s : undefined);
    const parts = f ? partsOf(w.model) : null;
    const seat = parts?.driver;
    if (!seat) return null;
    const local = pitchedPoint(parts, seat.feet, f.hitched ? parts.hitchPitch ?? 0 : 0).map((v) => v * f.g);
    const off = quatRotate(f.rotation, local), fwd = quatRotate(f.rotation, [0, 0, 1]);
    const feet = [f.at[0] + off[0], f.at[1] + off[1], f.at[2] + off[2]];
    const yaw = Math.atan2(fwd[0], fwd[2]) + (seat.yaw * Math.PI) / 180;
    const hands = seatRigInput(feet, yaw, seat.top).req.hands;
    const grown = (q) => [feet[0] + (q[0] - feet[0]) * f.g, feet[1] + (q[1] - feet[1]) * f.g, feet[2] + (q[2] - feet[2]) * f.g];
    return { feet, yaw, top: seat.top, g: f.g, hands: [grown(hands.L.at), grown(hands.R.at)] };
  }
  const driverSeat = () => driverDrawn('', {});
  // Decide from the wagon kind, not this frame's seat, because journeys, teleports, and the first frames of a load
  // have no seat.
  const benchKind = () => enabled && !!driverSeatFor(myKind());
  function driverGlue(drawable, { toWire = (q) => q, grows = _lastGrows } = {}) {
    for (let i = 0; i < drawable.length; i++) {
      const d = drawable[i];
      if (!d?.shown || (d.shown.rd | 0) !== 2 || !_peers.has(d.id)) continue;
      // Hang the wagon from the anchor of this frame first, because this glue runs in the online frame of the host
      // before the pool hangs it.
      const p = _peers.get(d.id);
      retarget(p);
      const anchor = p.wagon?.kind === HCC_WIRE_KIND.Trailing && !p.hidden ? peerAnchor(p.ownerId ?? d.id) : null;
      if (anchor) hitchPeerWagon(p, anchor, 0);
      const seat = driverDrawn(d.id, grows);
      if (!seat) continue;
      const w = toWire(seat.feet);
      drawable[i] = { ...d, shown: { ...d.shown, x: w[0], y: w[1], z: w[2], yaw: seat.yaw, st: seatTopByte(seat.top), rd: 0, bench: 2, deck: [0, 0, -1], deckKey: `wagon:${d.id}:driver` } };
    }
    return drawable;
  }
  function bodyMatrixOf(f, parts) {
    const m = f.g > 1 ? mat4FromQuatPosScale(f.rotation, f.at, [f.g, f.g, f.g]) : wagonMatrix(f.at, f.rotation);
    return pitchedMatrix(m, parts, f.hitched ? parts.hitchPitch ?? 0 : 0);
  }
  function harnessEnds(owner) {
    const mine = owner === '';
    const p = mine ? null : _peers.get(owner);
    if (!mine && (!p || p.hidden)) return [];
    const s = mine ? shown() : null;
    const w = mine ? s?.wagon : p.wagon;
    const team = _teams.get(owner);
    if (!w || !team?.length) return [];
    const f = drawnFrameOf(owner, _lastGrows, mine ? s : undefined);
    const parts = f ? partsOf(w.model) : null;
    if (!parts?.traces?.length) return [];
    const body = bodyMatrixOf(f, parts);
    const steer = mine ? w.turn?.steer ?? 0 : p.turn?.steer ?? 0;
    const bogie = parts.bogie ? multiply(body, steeredMatrix(parts.bogie.kingpin, steer)) : body;
    const ends = [];
    for (const [hi, side, q, onBogie] of parts.traces) {
      const h = team.find((t) => t.hitched && Math.sign(t.side) === Math.sign(teamSidesOf(w.model)[hi])) ?? null;
      if (!h) continue;
      ends.push({ kind: 'trace', a: horsePoint(h, [side * TEAM.collar[0], TEAM.collar[1], TEAM.collar[2]]), b: transformPoint(onBogie ? bogie : body, q[0], q[1], q[2]), g: f.g });
    }
    const drv = driverDrawn(owner);
    if (drv) team.forEach((h) => { if (h.hitched && h.drawn) ends.push({ kind: 'rein', a: drv.hands[h.side < 0 ? 0 : 1], b: horsePoint(h, [TEAM.bit[0], TEAM.bit[1], TEAM.bit[2]]), g: f.g }); });
    return ends;
  }
  const _harness = new Map();
  function dropHarness(owner) { const h = _harness.get(owner); if (h?.gpu) renderer?.destroyMesh?.(h.gpu); _harness.delete(owner); }
  function stepHarness(dt) {
    for (const owner of ['', ..._peers.keys()]) {
      const ends = harnessEnds(owner);
      if (!ends.length) { dropHarness(owner); continue; }
      const key = ends.map((e) => e.kind[0]).join('');
      let h = _harness.get(owner);
      if (!h || h.key !== key) { dropHarness(owner); h = { key, ropes: ends.map((e) => newRope(e.kind)), model: null, gpu: null, restAt: null, stillS: 0 }; _harness.set(owner, h); }
      if (harnessStill(ends, h.restAt)) h.stillS += Math.max(0, dt);
      else { h.restAt = ends.map((e) => ({ a: [...e.a], b: [...e.b], g: e.g })); h.stillS = 0; }
      if (h.stillS >= HARNESS_REST_S && (h.gpu || !renderer?.createMesh)) continue;
      ends.forEach((e, i) => stepRope(h.ropes[i], e.a, e.b, dt, e.g));
      if (!renderer?.createMesh) continue;
      const model = h.model ?? (h.model = tubeModel(h.ropes.length, WAGON_ARCHIVE, WAGON_TEX.harness));
      h.ropes.forEach((r, i) => tubeInto(r, i, ROPE[r.kind].radius * Math.max(1, ends[i].g), model.positions, model.normals));
      if (h.gpu) renderer.updateMeshVertices?.(h.gpu, model.positions, model.normals);
      else { ensureWagonArt(); h.gpu = renderer.createMesh({ ...model, positions: model.positions.slice(), normals: model.normals.slice() }); }
    }
    for (const owner of [..._harness.keys()]) if (owner !== '' && !_peers.has(owner)) dropHarness(owner);
  }
  function faceTeams(cameraPos) {
    if (!cameraPos) return;
    for (const [owner, team] of _teams) {
      let i = 0;
      for (const h of team) { if (!h.drawn) continue; const b = _horseBatches.get(teamKey(owner, i++)); if (b) poseHorseBatch(b, cameraPos, h, h.g, lookOfOwner(owner)); }
    }
  }
  const _harnessBox = [0, 0, 0, 0, 0, 0];
  function drawHarness(r, cull = null) {
    let n = 0;
    for (const h of _harness.values()) {
      if (!h.gpu || !r?.drawMesh) continue;
      const box = cull ? sphereAabb(h.gpu.bounds, WORLD_MATRIX, _harnessBox) : null;
      if (box && cull(box) !== DECOR_DRAW) continue;
      r.drawMesh(h.gpu, WORLD_MATRIX, null, NO_SHADOW); n++;
    }
    return n;
  }
  function drivenShell() {
    const s = shown(), w = s?.wagon;
    if (!w || w.kind !== HCC_WIRE_KIND.Trailing) return null;
    const parts = partsOf(w.model), box = parts?.shell;
    if (!box || !parts.driver) return null;
    const f = drawnFrameOf('', {}, s);
    const m = wagonMatrix(f?.at ?? w.position, f?.rotation ?? w.rotation);
    return { box, m };
  }
  function cameraHit(o, d, max, radius = 0) {
    const shell = drivenShell();
    if (!shell) return Infinity;
    const { box, m } = shell;
    const t = [o[0] - m[12], o[1] - m[13], o[2] - m[14]];
    const lo = [m[0] * t[0] + m[1] * t[1] + m[2] * t[2], m[4] * t[0] + m[5] * t[1] + m[6] * t[2], m[8] * t[0] + m[9] * t[1] + m[10] * t[2]];
    const ld = [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[4] * d[0] + m[5] * d[1] + m[6] * d[2], m[8] * d[0] + m[9] * d[1] + m[10] * d[2]];
    let t0 = -Infinity, t1 = Infinity;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(ld[k]) < 1e-9) { if (lo[k] < box.min[k] || lo[k] > box.max[k]) return Infinity; continue; }
      let a = (box.min[k] - lo[k]) / ld[k], b = (box.max[k] - lo[k]) / ld[k];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (!(t0 <= t1) || t0 < 0 || t0 > max) return Infinity;
    return Math.max(0, t0 - radius);
  }
  function cameraFloor() {
    const shell = drivenShell();
    if (!shell) return null;
    const { box, m } = shell;
    let top = -Infinity;
    for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) top = Math.max(top, transformPoint(m, x, y, z)[1]);
    return top + SHELL_CLEAR_M;
  }

  const horseBox = (horse) => transformedAabb(HORSE_LOCAL_BOX, mat4FromQuatPos(quatLookRotation(horse.forward), horse.position));
  function teamAabb(owner, horse) {
    const box = aabbOf(horseBox(horse));
    const team = _teams.get(owner) ?? [];
    if (team.some((h) => !h.hitched)) return box;
    for (const h of team) {
      if (!h.drawn) continue;
      const b = aabbOf(horseBox(h));
      for (let k = 0; k < 3; k++) { box.min[k] = Math.min(box.min[k], b.min[k]); box.max[k] = Math.max(box.max[k], b.max[k]); }
    }
    return box;
  }
  function targets() {
    const out = [];
    const s = _held.has('') ? null : shown();
    const mine = s?.wagon ? partsOf(s.wagon.model) : null;
    if (s?.wagon && mine) {
      const box = transformedAabb(mine.box, wagonMatrix(s.wagon.position, s.wagon.rotation));
      if (s.wagon.kind === HCC_WIRE_KIND.Deployed) out.push({ key: KEY_WAGON, aabb: aabbOf(box), distance: RAY_DISTANCE, reach: ACTIVATION_REACH });
      else if (s.wagon.kind === HCC_WIRE_KIND.Following && s.interaction) out.push({ key: KEY_FOLLOWING_WAGON, aabb: aabbOf(box), distance: RAY_DISTANCE, reach: ACTIVATION_REACH, noSurface: true });
    }
    if (s?.horse) out.push({ key: KEY_HORSE, aabb: teamAabb('', s.horse), distance: RAY_DISTANCE, reach: ACTIVATION_REACH, noSurface: true });
    for (const [owner, p] of _peers) {
      // Other players' wagons and horses have no collider, live or parked, and yield the activation ray, so a parked
      // team never blocks a door. The ray tests the wagon's turned box (`obb`).
      if (_held.has(owner)) continue;
      const theirs = p.wagon && p.shownWagon ? partsOf(p.wagon.model) : null;
      if (theirs) {
        const pm = wagonMatrix(p.shownWagon, p.shownRotation ?? p.wagon.rotation);
        out.push({ key: peerKey(owner, 'w'), aabb: aabbOf(transformedAabb(theirs.box, pm)), obb: { m: pm, box: theirs.box }, distance: RAY_DISTANCE, reach: ACTIVATION_REACH, noSurface: true, yields: true });
      }
      if (p.horse && p.shownHorse && _stillReady) out.push({ key: peerKey(owner, 'h'), aabb: teamAabb(owner, { ...p.horse, position: p.shownHorse }), distance: RAY_DISTANCE, reach: ACTIVATION_REACH, noSurface: true, yields: true });
    }
    return out;
  }
  const peerOfKey = (key) => { if (typeof key !== 'string' || !key.startsWith('hccPeer:')) return null; const i = key.lastIndexOf(':'); return { owner: key.slice(8, i), what: key.slice(i + 1) }; };
  const withActions = (named, target) => { const actions = runtime?.actionRows?.(target) ?? []; return actions.length ? { ...named, actions } : named; };
  const wagonTitle = (kind) => (validWagonKind(kind) && kind !== 'cart' ? WAGON_KINDS[kind].name : WAGON_HOVER_TEXT);
  const withCaravanRow = (named, parked = true) => (parked && enterCaravan && WAGON_KINDS[myKind()]?.enterable ? { ...named, actions: [...(named.actions ?? []), { id: CARAVAN_ENTER_ROW, label: CARAVAN_TEXT.enter }] } : named);
  const withEntryRow = (named, parked = true) => { const label = parked && WAGON_KINDS[myKind()]?.enterable ? caravanEntry?.row?.() ?? null : null; return label ? { ...named, actions: [...(named.actions ?? []), { id: CARAVAN_ENTRY_ROW, label }] } : named; };
  const caravanVisitRows = (owner) => { const t = visit?.may ? visitTarget(owner) : null; return t && visit.may(t) ? [{ id: CARAVAN_VISIT_ROW, label: CARAVAN_TEXT.enter }] : []; };
  function hoverName(key) {
    if (typeof key !== 'string') return null;
    if ((key === KEY_WAGON || key === KEY_FOLLOWING_WAGON) && myKind() !== 'cart') return withEntryRow(withCaravanRow(withActions({ title: wagonTitle(myKind()) }, key === KEY_WAGON ? 'deployedWagon' : 'followingWagon'), key === KEY_WAGON), key === KEY_WAGON);
    if (key === KEY_WAGON) return withActions({ title: WAGON_HOVER_TEXT }, 'deployedWagon');
    if (key === KEY_FOLLOWING_WAGON) return withActions({ title: WAGON_HOVER_TEXT }, 'followingWagon');
    if (key === KEY_HORSE) return withActions({ title: runtime ? runtime.horseTargetLabel : horseTargetLabel('') }, 'horse');
    const pk = peerOfKey(key);
    if (!pk) return null;
    const p = _peers.get(pk.owner);
    if (!p) return null;
    const who = peerName(p.ownerId ?? pk.owner) ?? (p.ownerName || null);
    const owned = ownedLine(who);
    if (pk.what === 'w') {
      const rows = riders?.acts?.(p.ownerId ?? pk.owner, p.wagon?.model, p.kept) ?? [];
      const inside = caravanVisitRows(pk.owner);
      if (inside.length) return { title: wagonTitle(p.wagon?.model), subs: [owned], actions: [...rows, ...inside] };
      return rows.length ? { title: wagonTitle(p.wagon?.model), subs: [owned], actions: rows } : { title: wagonTitle(p.wagon?.model), subs: [owned] };
    }
    return { title: horseTargetLabel(p.name ?? ''), subs: [owned] };
  }
  function tooltipText(eye, dir, col) {
    if (!runtime || !enabled) return '';
    const pick = pickActivatableHit(eye, dir, targets(), col);
    return pick?.key === KEY_HORSE && pick.distance <= ACTIVATION_REACH ? String(runtime.horseTargetLabel ?? '') : '';
  }
  function activate(key, distance, say = null, tooFar = null, mode = null) {
    if (key === KEY_WAGON || key === KEY_FOLLOWING_WAGON) noteFirstUse('wagon'); else if (key === KEY_HORSE) noteFirstUse('horse');
    if (!runtime) return false;
    if (key === KEY_WAGON && mode === CARAVAN_ENTER_ROW) {
      if (!(distance <= ACTIVATION_REACH)) { tooFar?.(); return true; }
      void enterCaravan?.();
      return true;
    }
    if (key === KEY_WAGON && mode === CARAVAN_ENTRY_ROW) {
      if (!(distance <= ACTIVATION_REACH)) { tooFar?.(); return true; }
      const line = caravanEntry?.turn?.() ?? null;
      if (line) say?.(line);
      return true;
    }
    if (key === KEY_WAGON) return runtime.handleDeployedWagonActivation(distance, mode);
    if (key === KEY_FOLLOWING_WAGON) return runtime.handleFollowingWagonActivation(distance, mode);
    if (key === KEY_HORSE) return runtime.handleStationaryHorseActivation(distance, mode);
    const pk = peerOfKey(key);
    if (!pk || !_peers.has(pk.owner)) return false;
    if (pk.what === 'w' && mode === CARAVAN_VISIT_ROW) {
      if (!(distance <= ACTIVATION_REACH)) { tooFar?.(); return true; }
      const t = visitTarget(pk.owner);
      if (t) void visit?.enter?.(t);
      return true;
    }
    if (pk.what === 'w' && typeof mode === 'string' && mode.startsWith('wagon:') && riders?.press) return !!riders.press(_peers.get(pk.owner)?.ownerId ?? pk.owner, mode, distance);
    if (!(distance <= ACTIVATION_REACH)) { tooFar?.(); return true; }
    const n = hoverName(key);
    if (n) say?.(`${pk.what === 'w' ? 'This wagon' : `${n.title}`} - ${n.subs[0].charAt(0).toLowerCase()}${n.subs[0].slice(1)}.`);
    return true;
  }

  function seatWorld(kind, position, rotation, k, hitched = false) {
    const parts = partsOf(kind);
    const seat = parts?.seats?.[k];
    if (!seat || !position || !rotation) return null;
    const local = pitchedPoint(parts, seat.feet, hitched ? parts.hitchPitch ?? 0 : 0);
    const off = quatRotate(rotation, local), fwd = quatRotate(rotation, [0, 0, 1]);
    return { feet: [position[0] + off[0], position[1] + off[1], position[2] + off[2]], yaw: Math.atan2(fwd[0], fwd[2]) + (seat.yaw * Math.PI) / 180 };
  }
  function mySeat(k) {
    const w = shown()?.wagon;
    return w ? seatWorld(w.model, w.position, w.rotation, k, w.hitched) : null;
  }
  function peerSeat(owner, k) {
    const p = _peers.get(owner);
    if (_held.has(owner)) return null;
    return p?.wagon && p.shownWagon ? seatWorld(p.wagon.model, p.shownWagon, p.shownRotation ?? p.wagon.rotation, k, p.wagon.kind !== HCC_WIRE_KIND.Deployed || p.wagon.hitched) : null;
  }
  function wordSeat(owner, k) {
    const p = _peers.get(owner);
    return p?.wagon ? seatWorld(p.wagon.model, p.wagon.position, p.wagon.rotation, k, p.wagon.kind !== HCC_WIRE_KIND.Deployed || p.wagon.hitched) : null;
  }
  function peerRide(owner) {
    const p = _peers.get(owner);
    if (!p || p.kept) return null;
    return { model: p.wagon?.model ?? null, kind: p.wagon?.kind ?? null, passengers: p.wagon?.passengers ?? [], go: p.go ?? null, declined: p.pn ?? [], position: p.shownWagon ?? null, wire: p.wire?.w?.position ?? null, held: _held.has(owner) };
  }
  function carriesCompanions() { const k = shown()?.wagon?.kind; return k === HCC_WIRE_KIND.Trailing || k === HCC_WIRE_KIND.Following; }
  function mySeatCount() {
    const w = shown()?.wagon;
    return w ? partsOf(w.model)?.seats?.length ?? 0 : 0;
  }
  const mySeatsKnown = () => { const w = shown()?.wagon; return !!(w && partsOf(w.model)); };
  function parkedDoor() {
    const s = shown();
    const w = s?.wagon;
    if (!w || w.kind !== HCC_WIRE_KIND.Deployed || !WAGON_KINDS[w.model]?.enterable) return null;
    return caravanDoorAt(w.model, w.position, w.rotation);
  }
  function caravanDoorAt(kind, position, rotation) {
    const door = partsOf(kind)?.door;
    if (!door) return null;
    const off = quatRotate(rotation, door.step);
    const out = quatRotate(rotation, [0, 0, -1]);
    return { position: [...position], rotation: [...rotation], step: [position[0] + off[0], position[1] + off[1], position[2] + off[2]], yaw: Math.atan2(out[0], out[2]) };
  }
  function visitTarget(owner) {
    const p = _peers.get(owner);
    const w = p?.wagon;
    if (!w || w.kind !== HCC_WIRE_KIND.Deployed || !WAGON_KINDS[w.model]?.enterable || !p.shownWagon || !p.wire?.w) return null;
    let kept = null;
    for (const e of _kept.values()) if ((p.kept ? keptKey(e.k) === owner : e.id === (p.ownerId ?? owner)) && (!kept || e.seq > kept.seq)) kept = e;
    if (!kept) return null;
    const door = caravanDoorAt(w.model, p.shownWagon, p.shownRotation ?? w.rotation);
    if (!door) return null;
    // Prefer the owner name the relay stamped on the parked record, because a parked record's peer id can belong to
    // anyone after a drain.
    const name = kept.name || peerName(p.ownerId ?? owner) || p.ownerName || null;
    return { ...door, k: kept.k, owner: name, entry: w.entry ?? 'private', guild: w.guild ?? null, look: w.look ?? null, at: [...p.wire.w.position], cell: kept.room ?? null };
  }

  function offsetAll(offset) {
    runtime?.rebase?.(offset);
    for (const p of _peers.values()) {
      for (const v of [p.shownHorse, p.shownWagon, ...(p.turn?.contacts ?? []).map((c) => c.p)]) if (v) { v[0] += offset[0]; v[1] += offset[1]; v[2] += offset[2]; }
    }
    for (const h of _harness.values()) for (const rope of h.ropes) {
      for (let i = 0; i < rope.n; i++) for (let k = 0; k < 3; k++) { rope.p[i * 3 + k] += offset[k]; rope.q[i * 3 + k] += offset[k]; }
      for (let k = 0; k < 3; k++) { rope.a[k] += offset[k]; rope.b[k] += offset[k]; }
    }
    for (const t of _teamWalk.values()) for (let k = 0; k < 3; k++) t.at[k] += offset[k];
    // Remove the box now, because its matrix is in the old frame; the next frame places it again at the shifted
    // pose.
    if (_bucketKey) collider()?.removeBucket?.(WAGON_BUCKET);
    _bucketKey = null;
  }
  function clearPeers() { const owners = [..._live.keys()]; _live.clear(); for (const owner of owners) syncPeer(owner); for (const key of [..._peers.keys()]) if (!isKeptKey(key)) dropPeer(key); }
  function dropPeer(owner) { dropTeamBatches(owner); dropHarness(owner); _teams.delete(owner); _teamWalk.delete(owner); _peers.delete(owner); _grownWheels.delete(owner); }
  function destroyAll() { _live.clear(); for (const owner of [..._peers.keys()]) dropPeer(owner); dropTeamBatches(''); dropHarness(''); _teams.delete(''); _teamWalk.delete(''); standWagonCollider(null); _frameNo++; trim3d(); }

  const wireRecord = (toWire = (p) => p) => hccWireRecord(shown(), toWire);
  // Convert the wire record at use time every frame, because a fast travel re-anchors the origin without an offset
  // for `offsetAll` to apply.
  function retarget(p) {
    p.wagon = p.wire.w ? { ...p.wire.w, position: p.toScene(p.wire.w.position) } : null;
    p.horse = p.wire.h ? { ...p.wire.h, position: p.toScene(p.wire.h.position) } : null;
    const g = p.ground;
    if (!g || g.wire !== p.wire) return;
    if (p.wagon && g.dw) { const q = p.wagon.position; p.wagon.position = [q[0] + g.dw[0], q[1] + g.dw[1], q[2] + g.dw[2]]; p.wagon.rotation = g.rot; }
    if (p.horse && g.dh !== null) { const q = p.horse.position; p.horse.position = [q[0], q[1] + g.dh, q[2]]; }
  }
  // Parked wagons and standing horses of other players are grounded on local terrain once per update, because the
  // owner may see other ground heights. The stored delta survives origin shifts.
  function groundPeer(p) {
    let g = p.ground;
    if (!g || g.wire !== p.wire) g = p.ground = { wire: p.wire, dw: null, rot: null, dh: null, due: 0 };
    if (g.due === null || now() < g.due) return;
    const col = collider();
    const phys = { raycastAll: (o, d, m) => raycastAllOver(col, o, d, m), log: null };
    let missing = false;
    const w = p.wire.w;
    if (w?.kind === HCC_WIRE_KIND.Deployed && !g.dw) {
      const at = p.toScene(w.position);
      const parts = partsOf(w.model);
      const v = parts ? new DeployedWagonVisual(parts, at, quatForward(w.rotation), 0, 1, phys, 0) : null;
      if (v?.isGrounded) { g.dw = [v.position[0] - at[0], v.position[1] - at[1], v.position[2] - at[2]]; g.rot = v.rotation; } else missing = true;
    }
    const h = p.wire.h;
    if (h && !h.walking && g.dh === null) {
      const at = p.toScene(h.position);
      const best = pickGround(phys.raycastAll([at[0], at[1] + STATIONARY_PROBE_HEIGHT, at[2]], [0, -1, 0], STATIONARY_PROBE_DISTANCE), at[1]);
      if (best) g.dh = best.point[1] - at[1]; else missing = true;
    }
    g.due = missing ? now() + GROUND_RETRY_SECONDS : null;
  }
  function groundMoved(x0, z0, x1, z1) {
    const M = 6;
    const within = (q) => !!q && q[0] >= x0 - M && q[0] <= x1 + M && q[2] >= z0 - M && q[2] <= z1 + M;
    runtime?.regroundStanding?.(within);
    for (const p of _peers.values()) if (p.ground && (within(p.wagon?.position) || within(p.horse?.position))) p.ground = null;
  }
  // Parked records are keyed `kept:<k>` by owner key and live messages by peer id. A parked part is hidden while the
  // owner's live message shows the same part within PARK_SAME_NATIVES.
  const keptKey = (k) => `kept:${k}`;
  const isKeptKey = (key) => typeof key === 'string' && key.startsWith('kept:');
  function showPeer(key, v) {
    if (!enabled || !v || (!v.w && !v.h)) { if (_peers.has(key)) dropPeer(key); return; }
    let p = _peers.get(key);
    if (!p) { p = { wire: null, toScene: null, wagon: null, horse: null, name: '', ownerId: null, ownerName: '', at: 0, kept: false, shownWagon: null, shownHorse: null, shownRotation: null, walk: freshHorseWalk(), ground: null }; _peers.set(key, p); }
    p.wire = { w: v.w, h: v.h };
    p.toScene = v.toScene ?? ((q) => q);
    p.at = v.at ?? p.at;
    p.name = v.n ?? '';
    p.horseLook = horseLookCode(horseLookOfCode(v.hc ?? 0));
    p.ownerId = v.ownerId; p.ownerName = v.ownerName ?? ''; p.kept = !!v.kept;
    p.go = v.go ?? null; p.pn = v.pn ?? [];
    retarget(p);
    if (!p.wagon) { p.shownWagon = null; p.shownRotation = null; p.turn = null; p.steer = 0; }
    if (!p.horse) p.shownHorse = null;
    if (p.horse) { ensureStationary(); ensureWalk(); }
    if (p.wagon) partsOf(p.wagon.model);
  }
  function syncPeer(owner) {
    const l = _live.get(owner) ?? null;
    showPeer(owner, l ? { w: l.w, h: l.h, n: l.h ? l.n : '', hc: l.hc, go: l.go, pn: l.pn, toScene: l.toScene, at: l.at, ownerId: owner, ownerName: '', kept: false } : null);
    for (const k of new Set([..._kept.values()].filter((e) => e.id === owner).map((e) => e.k))) syncKept(k);
  }
  const samePlace = (a, b) => !!a && !!b && Math.abs(a[0] - b[0]) <= PARK_SAME_NATIVES && Math.abs(a[2] - b[2]) <= PARK_SAME_NATIVES;
  function syncKept(k) {
    let e = null;
    for (const x of _kept.values()) if (x.k === k && (!e || x.seq > e.seq)) e = x;
    if (!e) { showPeer(keptKey(k), null); return; }
    const l = _live.get(e.id) ?? null;
    const w = e.w && !(l?.w && samePlace(l.w.position, e.w.position)) ? e.w : null;
    const h = e.h && !(l?.h && samePlace(l.h.position, e.h.position)) ? e.h : null;
    showPeer(keptKey(k), { w, h, n: h ? e.n : '', hc: e.hc, toScene: e.toScene, ownerId: e.id, ownerName: e.name, kept: true });
  }
  function applyOwner(owner, raw, toScene = (p) => p, nowMs = 0) {
    if (!enabled) return false;
    if (typeof owner !== 'string' || !owner || owner === (selfId?.() ?? null)) return false;
    const r = raw == null ? null : validHccRecord(raw);
    if (!r) { _live.delete(owner); syncPeer(owner); return raw == null; }
    _live.set(owner, { w: r.w ?? null, h: r.h ?? null, n: r.n ?? '', hc: r.hc ?? 0, go: r.go ?? null, pn: r.pn ?? [], toScene, at: nowMs });
    syncPeer(owner);
    return true;
  }
  function sweepOwners(alive, nowMs, staleMs = 0) {
    for (const [owner, l] of [..._live]) {
      if (alive?.has?.(owner) && !(staleMs > 0 && nowMs - l.at > staleMs)) continue;
      _live.delete(owner);
      syncPeer(owner);
    }
  }

  function teamSnapshot(owner, lone = false) {
    const f = drawnFrameOf(owner, {});
    if (!f) return null;
    const horses = (_teams.get(owner) ?? []).filter((h) => h.drawn && (h.hitched || f.hitched || lone)).map((h) => ({ at: [h.position[0], h.position[1], h.position[2]], forward: [h.forward[0], h.forward[1], h.forward[2]] }));
    const p = owner === '' ? null : _peers.get(owner) ?? null;
    const w = f.wagon, turn = owner === '' ? w.turn ?? { angle: w.angle ?? 0 } : p?.turn ?? { angle: w.angle ?? 0 };
    return { kind: w.model, look: w.look ?? null, tier: w.tier ?? 0, turn, hitched: !!f.hitched, conceal: p?.look ?? null, horseLook: lookOfOwner(owner), lone: !!lone, at: [f.at[0], f.at[1], f.at[2]], rotation: [...f.rotation], horses };
  }

  function applyKept(room, e, toScene = (p) => p, nowMs = 0) {
    if (!e || typeof e !== 'object' || typeof e.k !== 'string' || !e.k || typeof e.id !== 'string' || !e.id) return false;
    if (e.id === (selfId?.() ?? null)) return false;
    const slot = `${room}|${e.k}`;
    const thrown = e.r != null && Number.isFinite(e.y);
    const v = e.r == null ? null : validHccRecord(thrown ? thrownRecord(e.r) : e.r);
    if (!v || !(v.w?.kind === HCC_WIRE_KIND.Deployed || v.w == null) || (!v.w && !v.h)) {
      _kept.delete(slot);
      syncKept(e.k);
      return e.r == null;
    }
    const ttl = Number.isFinite(e.ttl) ? Math.max(0, Math.min(PARK_TTL_MS, e.ttl)) : PARK_TTL_MS;
    _kept.set(slot, { room, k: e.k, id: e.id, w: v.w ?? null, h: v.h ?? null, n: v.n ?? '', hc: v.hc ?? 0, name: typeof e.name === 'string' ? e.name.slice(0, 32) : '', expires: nowMs + ttl, toScene, seq: ++_keptSeq, y: thrown ? e.y : null });
    syncKept(e.k);
    return true;
  }
  function replaceKept(room, list, toScene = (p) => p, nowMs = 0) {
    const touched = new Set();
    for (const [slot, e] of [..._kept]) if (e.room === room) { _kept.delete(slot); touched.add(e.k); }
    for (const e of Array.isArray(list) ? list : []) if (e && typeof e === 'object' && applyKept(room, e, toScene, nowMs)) touched.delete(e.k);
    for (const k of touched) syncKept(k);
  }
  function pruneKept(rooms, nowMs = null) {
    const held = rooms instanceof Set ? rooms : new Set(rooms ?? []);
    const touched = new Set();
    for (const [slot, e] of [..._kept]) if (!held.has(e.room) || (nowMs !== null && nowMs >= e.expires)) { _kept.delete(slot); touched.add(e.k); }
    for (const k of touched) syncKept(k);
  }
  // The park message comes from the save record, never from what is drawn, so a parked wagon counts as parked wherever
  // this client shows it.
  function parkWord(toWire = (p) => p) {
    if (!runtime || !enabled) return null;
    const v = runtime.view();
    const st = v?.state;
    if (!st || v.persistence === false) return null;
    const wagonParked = st.Mode === WAGON_MODE.Deployed;
    const horseParked = st.HorseMode === HORSE_MODE.LooseStationary || (wagonParked && st.HorseMode === HORSE_MODE.HitchedToWagon);
    if (!wagonParked && !horseParked) return null;
    const a = wagonParked ? [st.WorldX, st.WorldZ] : [st.HorseWorldX, st.HorseWorldZ];
    if (!a.every(Number.isFinite)) return null;
    const rec = hccWireRecord(shown(), toWire);
    const r = {};
    if (wagonParked && rec?.w?.[0] === HCC_WIRE_KIND.Deployed) { r.w = [...rec.w]; r.w[9] = 0; if (rec.wk) r.wk = rec.wk; if (rec.wh) r.wh = rec.wh; if (rec.wl) r.wl = rec.wl; }
    const near = (x, z) => Math.abs(x - a[0]) <= PARK_REACH && Math.abs(z - a[1]) <= PARK_REACH;
    if (horseParked && rec?.h && !v.horseFollowing && !v.teamFollowing && near(rec.h[0], rec.h[2])) { r.h = [...rec.h]; r.h[5] = 0; if (rec.n) r.n = rec.n; }
    if (r.w && !near(r.w[1], r.w[3])) { delete r.w; delete r.wk; delete r.wh; delete r.wl; }
    if (r.w && rec.we) { r.we = rec.we; if (rec.wg) r.wg = rec.wg; }
    if ((r.w || r.h) && rec?.hc) r.hc = rec.hc;
    if (r.w) Object.assign(r, wardenWord?.(a) ?? {});
    return r.w || r.h ? { a, r } : { a };
  }

  return {
    attach(rt) { runtime = rt; return this; },
    setPeerLook(fn) { peerLook = typeof fn === 'function' ? fn : null; },
    setWardenWord(fn) { wardenWord = typeof fn === 'function' ? fn : null; },
    holdTeam(owner, on, lone = true) {
      if (typeof owner !== 'string') return;
      const h = _held.get(owner);
      if (on) { if (h) { h.n++; h.lone = h.lone || !!lone; } else _held.set(owner, { n: 1, lone: !!lone }); }
      else if (h && --h.n <= 0) _held.delete(owner);
    },
    get held() { return _held; },
    keptOwner: (k) => keptKey(k),
    teamSnapshot,
    setEnabled(on) {
      const was = enabled;
      enabled = !!on;
      if (!was && enabled) { for (const k of new Set([..._kept.values()].map((e) => e.k))) syncKept(k); return; }
      if (!was || enabled) return;
      runtime?.suspend?.();
      destroyAll();
      // Turning the switch off counts as a changed word, so peers drop my team now instead of at my next full
      // frame.
      if (_lastKey !== '') { _lastKey = ''; onChanged?.(); }
    },
    get enabled() { return enabled; },
    get runtime() { return runtime; },
    presentation: { wagonParts, horseArt, hitchOf: () => hitchOf(myKind()), onChanged: () => onChanged?.(), drawWagon, drawWagonSeen, poseHorse: poseHorseBatch, partsOf, hitchOfKind: hitchOf },
    phys,
    frame, batches, draw, draw3d, drawVeiled3d, targets, hoverName, tooltipText, activate, offsetAll, destroyAll, clearPeers, shown, groundMoved,
    wireRecord, applyOwner, sweepOwners, applyKept, replaceKept, pruneKept, parkWord, parkedDoor, mySeat, peerSeat, peerRide, mySeatCount, mySeatsKnown, carriesCompanions,
    seatDrawn, seatGlue, drawnFrameOf, puppetSeatDrawn, wordSeat,
    teamOf, driverDrawn, driverSeat, benchKind, driverGlue, cameraHit, cameraFloor, harnessEnds, faceTeams,
    get harness() { return _harness; }, capsuleInBox,
    visitTarget,
    drawOutside,
    get peers() { return _peers; }, get kept() { return _kept; }, get parts() { return partsOf(myKind()); }, partsOf, hitchOf,
    drawShowWagon: (r, texRemap, position, rotation, kind, look = null, tier = 0, turn = null, hitched = false) => drawWagon(r, texRemap, position, rotation, tier, turn, 1, kind, hitched, look),
  };
}
