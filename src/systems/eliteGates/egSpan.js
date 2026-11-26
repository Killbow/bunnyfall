// @ts-check
import { realmToDungeon, dungeonToRealm } from '../../net/sdBrain.js';
import { egCircleSpecs, egWallFallenZ, egBandOfCircle, EG_VOID_Y, EG_BELT_MPS } from '../../net/eliteGates/egLaw.js';
import { stepTris, stepBox } from '../../world/sdStepsModel.js';
import { SD_CRUMBLE_DELAY, SD_CRUMBLE_BACK, SD_CRUMBLE_FALL_G, SD_STEP_THICK, SD_BEAT_CYCLE, SD_BEAT_SOLID, SD_BEAT_BLINK, SD_GUST_EVERY, gustAt } from '../../world/sdSteps.js';
import { ensureSdStepsArt, SD_STEPS_SOUNDS, SD_BEAT_FRAME_S, SD_BEAT_IN_S, SD_BEAT_OUT_STAGE_S, SD_CRUMBLE_SHAKE, SD_CRUMBLE_SEEN, SD_CHUNK, SD_BEAT_FRAMES, sdChunkWays, sdChunkMatrix } from '../../worldEvents/sdSteps.js';
import { SD_PENDULUM, pendulumAngle, SD_BEAT_DISSOLVE, buildGritModel, SD_GRIT, buildWaystoneModel, buildVaneModel, vaneYawInto, sdWaystonesOf, sdVaneAt } from '../../world/sdStepsModel.js';
import { SD_STEPS_RECORD } from '../../world/sdStepsArt.js';
import { egPiecePlan, egSegmentPlan, egPieceSeed, egPieceModel, egBeatModel, egRiserModel, egDropLookModel, egTubeLidModel, egIsleModel, egCrumbleModels } from '../../world/eliteGates/egPlatformModel.js';
import { EG_BEAT_STONE_RECORDS, EG_PIECE_TELL_RECORDS, egCrumbleTellArt, egBeatStoneArt } from '../../world/eliteGates/egPlatformArt.js';
import { SdStepsPass, SD_GHOST, sdStepsPrograms } from '../../render/sdStepsPass.js';
import { SD_SKY_STEPS } from '../../render/sdSky.js';
import { egAccessNow } from '../../ui/eliteGates/egAccess.js';
import { isTouchDevice } from '../../ui/touchDevice.js';
import { createMeshKit } from '../../world/eliteGates/meshKit.js';
import { compiledPass, parallelCompile, startPrograms } from '../../render/glProgram.js';
import { startEgLookPrograms } from './egLookDraw.js';
import { EG_FOG_FLOOR, egGustSections } from '../../world/eliteGates/egLook.js';
import { EG_RIDE_DOWN_M, EG_RIDE_UP_M } from '../../net/eliteGates/egFair.js';
import { egTubeEdgeIn, egVoidStep } from '../../net/eliteGates/egFair.js';
import { faces } from '../../world/gateModel.js';
import { packRealmFaces, SD_REALM_ARCHIVE, SD_REALM_FLOOR_RECORD, SD_REALM_BRASS_RECORD, SD_REALM_EDGE_RECORD, SD_REALM_PILLAR_RECORD, SD_REALM_ROOT_RECORD, SD_ISLAND_SIDES } from '../../world/sdRealm.js';
import { identity } from '../../world/mat4.js';
import { egPieceAt, egPendAt, egPendHits, egBeatAt, egCourseOf, EG_PEND_HALF, EG_DROP_WALL_H, EG_CRUMBLE_KINDS, EG_SINK_MPS, EG_SINK_GONE_M, EG_BODY_R } from '../../net/eliteGates/egSpanLaw.js';
import { egBridgeOf } from '../../net/eliteGates/egSpanLaw.js';
import { egSlagState, egSlagX, EG_SLAG_SPOUTS, EG_SLAG_CRUST_S, EG_SLAG_WARN_S } from '../../net/eliteGates/egSpanLaw.js';
import { egInShape } from '../../net/eliteGates/egShape.js';
import { EG_KIT_RECORD } from '../../world/eliteGates/egKit.js';
import { EG_ENGINES } from '../../net/eliteGates/egFragLaw.js';
import { egOverDrop } from '../../world/eliteGates/egTelegraph.js';
import { egNicheBoxes, egIsleDisc } from '../../world/eliteGates/egHall.js';
import { RAY_DISTANCE, DEFAULT_ACTIVATION_DISTANCE } from '../../player/activate.js';
import { spireFooting, spireWake, spireObjs, spireAct } from './spireKit.js';
import { spireStoneName } from './spireOrrery.js';
import { createEgOrrery } from './egOrrery.js';
import { SD_STONES } from '../../net/sdBrain.js';
import { SD_HALL_TEXT } from '../../worldEvents/sdHall.js';
import { spireCrumbleWait } from './spireVestiges.js';
import { egBandDress, egBandArchive, EG_DRESS, egTellArchive, egBeatWarnArt, egBeatBackArt, egBeatTellMaps } from '../../world/eliteGates/egBandArt.js';
import { EG_BEAT_TELL_RECORDS } from '../../world/eliteGates/egBandArt.js';
import { createEgPieceBatch, EG_BATCH_CULL_PAD } from './egPieceBatch.js';
import { meshKitBounds } from '../../world/eliteGates/meshKit.js';
import { spherePlanes, sphereInPlanes } from '../../render/bounds.js';

const _vp = new Float32Array(16), _planes = new Float32Array(24);
function mul4(out, a, b) {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return out;
}
export const EG_STEP_GONE_Y = -400;
export const egStepKey = (h, i) => `eg:step:${h}:${i}`;
// Must equal `EG_BUCKET` in egCircleHost.js, the hall floor's collider bucket; standing on it sets the cast-back
// point.
export const EG_FLOOR_KEY = 'eg:hall';

export function egSlabModel(w, d) {
  const f = faces();
  slabFaces(f, w, d);
  return packRealmFaces(f);
}
function slabFaces(f, w, d) {
  const x = w / 2, z = d / 2, h = SD_STEP_THICK;
  const P = (a, b, c) => [a, b, c];
  f.quad(SD_REALM_FLOOR_RECORD, P(-x, 0, -z), P(-x, 0, z), P(x, 0, z), P(x, 0, -z), [0, 0], [0, d / 2], [w / 2, d / 2], [w / 2, 0]);
  for (const [a, b, n] of [[P(-x, 0, -z), P(x, 0, -z), [0, 0, -1]], [P(x, 0, -z), P(x, 0, z), [1, 0, 0]], [P(x, 0, z), P(-x, 0, z), [0, 0, 1]], [P(-x, 0, z), P(-x, 0, -z), [-1, 0, 0]]]) {
    f.quad(SD_REALM_BRASS_RECORD, a, P(a[0], -h, a[2]), P(b[0], -h, b[2]), b, [0, 0], [0, 0.3], [1, 0.3], [1, 0]);
    const o = 0.02;
    f.quad(SD_REALM_EDGE_RECORD, P(a[0] + n[0] * o, 0.004, a[2] + n[2] * o), P(a[0] + n[0] * o, -0.05, a[2] + n[2] * o), P(b[0] + n[0] * o, -0.05, b[2] + n[2] * o), P(b[0] + n[0] * o, 0.004, b[2] + n[2] * o), [0, 0], [0, 1], [1, 1], [1, 0]);
  }
  f.quad(SD_REALM_FLOOR_RECORD, P(-x, -h, -z), P(x, -h, -z), P(x, -h, z), P(-x, -h, z), [0, 0], [1, 0], [1, 1], [0, 1]);
}
export function egSlabTris(w, d) {
  const x = w / 2, z = d / 2, h = SD_STEP_THICK, out = [];
  const q = (a, b, c, e) => out.push(...a, ...b, ...c, ...a, ...c, ...e);
  q([-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]);
  q([-x, -h, -z], [x, -h, -z], [x, 0, -z], [-x, 0, -z]); q([-x, -h, z], [x, -h, z], [x, 0, z], [-x, 0, z]);
  q([-x, -h, -z], [-x, -h, z], [-x, 0, z], [-x, 0, -z]); q([x, -h, -z], [x, -h, z], [x, 0, z], [x, 0, -z]);
  const positions = new Float32Array(out), indices = new Uint16Array(positions.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  return { positions, indices };
}
// The far wall leaves a `DROP_DOOR` doorway on the course line because the course continues past the landing.
const DROP_WALL_T = 0.3;
export const DROP_DOOR = Object.freeze({ w: 2.4, h: 3.0 });
export function egDropModel(w, d, H = EG_DROP_WALL_H) {
  const f = faces(), x = w / 2, z = d / 2, t = DROP_WALL_T;
  const P = (a, b, c) => [a, b, c];
  const box = (x0, x1, z0, z1, y0, y1) => {
    f.quad(SD_REALM_BRASS_RECORD, P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0), [0, 0], [0, y1 - y0], [x1 - x0, y1 - y0], [x1 - x0, 0]);
    f.quad(SD_REALM_BRASS_RECORD, P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), P(x0, y0, z1), [0, 0], [0, y1 - y0], [x1 - x0, y1 - y0], [x1 - x0, 0]);
    f.quad(SD_REALM_BRASS_RECORD, P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), P(x0, y0, z0), [0, 0], [0, y1 - y0], [z1 - z0, y1 - y0], [z1 - z0, 0]);
    f.quad(SD_REALM_BRASS_RECORD, P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), [0, 0], [0, y1 - y0], [z1 - z0, y1 - y0], [z1 - z0, 0]);
    f.quad(SD_REALM_EDGE_RECORD, P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), [0, 0], [0, 1], [1, 1], [1, 0]);
  };
  for (const [x0, x1, y0] of farWall(x, t)) box(x0, x1, z, z + t, y0, H);
  box(-x - t, -x, -z, z, -SD_STEP_THICK, H);
  box(x, x + t, -z, z, -SD_STEP_THICK, H);
  slabFaces(f, w, d);
  return packRealmFaces(f);
}
export function egDropTris(w, d, H = EG_DROP_WALL_H) {
  const { positions } = egSlabTris(w, d), x = w / 2, z = d / 2, t = DROP_WALL_T, out = [...positions];
  const q = (a, b, c, e) => out.push(...a, ...b, ...c, ...a, ...c, ...e);
  const box = (x0, x1, z0, z1, y0, y1) => {
    q([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]); q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]); q([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]);
    q([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]);
  };
  for (const [x0, x1, y0] of farWall(x, t)) box(x0, x1, z, z + t, y0, H);
  box(-x - t, -x, -z, z, -SD_STEP_THICK, H); box(x, x + t, -z, z, -SD_STEP_THICK, H);
  const pos = new Float32Array(out), indices = new Uint16Array(pos.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  return { positions: pos, indices };
}
function farWall(x, t) {
  const h = DROP_DOOR.w / 2;
  return [[-x - t, -h, -SD_STEP_THICK], [h, x + t, -SD_STEP_THICK], [-h, h, DROP_DOOR.h]];
}
const PEND_CHAIN_H = 6;
export function egPendModel() {
  const f = faces(), h = EG_PEND_HALF, c = 0.06;
  const P = (a, b, cc) => [a, b, cc];
  const box = (rec, x0, x1, y0, y1, z0, z1) => {
    f.quad(rec, P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0), [0, 0], [0, 1], [1, 1], [1, 0]);
    f.quad(rec, P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), P(x0, y0, z1), [0, 0], [0, 1], [1, 1], [1, 0]);
    f.quad(rec, P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), P(x0, y0, z0), [0, 0], [0, 1], [1, 1], [1, 0]);
    f.quad(rec, P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), [0, 0], [0, 1], [1, 1], [1, 0]);
    f.quad(rec, P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), [0, 0], [0, 1], [1, 1], [1, 0]);
    f.quad(rec, P(x0, y0, z1), P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), [0, 0], [0, 1], [1, 1], [1, 0]);
  };
  box(SD_REALM_BRASS_RECORD, -h, h, 0, 2 * h, -h, h);
  box(SD_REALM_EDGE_RECORD, -c, c, 2 * h, 2 * h + PEND_CHAIN_H, -c, c);
  return packRealmFaces(f);
}
export function egSlagCrustModel(w, d) {
  const f = faces(), x = w / 2, z = d / 2, h = SD_STEP_THICK;
  const P = (a, b, c) => [a, b, c];
  f.quad(SD_REALM_ROOT_RECORD, P(-x, 0, -z), P(-x, 0, z), P(x, 0, z), P(x, 0, -z), [0, 0], [0, d / 2], [w / 2, d / 2], [w / 2, 0]);
  for (const [a, b, n] of [[P(-x, 0, -z), P(x, 0, -z), [0, 0, -1]], [P(x, 0, -z), P(x, 0, z), [1, 0, 0]], [P(x, 0, z), P(-x, 0, z), [0, 0, 1]], [P(-x, 0, z), P(-x, 0, -z), [-1, 0, 0]]]) {
    f.quad(EG_DRESS.molten, a, P(a[0], -h, a[2]), P(b[0], -h, b[2]), b, [0, 0], [0, 0.3], [1, 0.3], [1, 0]);
    const o = 0.02;
    f.quad(SD_REALM_EDGE_RECORD, P(a[0] + n[0] * o, 0.004, a[2] + n[2] * o), P(a[0] + n[0] * o, -0.05, a[2] + n[2] * o), P(b[0] + n[0] * o, -0.05, b[2] + n[2] * o), P(b[0] + n[0] * o, 0.004, b[2] + n[2] * o), [0, 0], [0, 1], [1, 1], [1, 0]);
  }
  f.quad(EG_DRESS.molten, P(-x, -h, -z), P(x, -h, -z), P(x, -h, z), P(-x, -h, z), [0, 0], [1, 0], [1, 1], [0, 1]);
  return packRealmFaces(f);
}
export const EG_SLAG_MOLTEN_SINK = 0.15;
export function egSlagMoltenModel(w, d) {
  const f = faces(), x = w / 2, z = d / 2, y = -EG_SLAG_MOLTEN_SINK;
  f.quad(EG_DRESS.molten, [-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z], [0, 0], [0, d / 2], [w / 2, d / 2], [w / 2, 0]);
  return packRealmFaces(f);
}
export function tubeLidModel(w, d, height) {
  const f = faces(), x = w / 2 + 0.6, z = d / 2, y0 = height, y1 = height + 1;
  const P = (a, b, c) => [a, b, c];
  f.quad(SD_REALM_ROOT_RECORD, P(-x, y0, -z), P(x, y0, -z), P(x, y0, z), P(-x, y0, z), [0, 0], [w / 2, 0], [w / 2, d / 2], [0, d / 2]);
  f.quad(SD_REALM_ROOT_RECORD, P(-x, y1, -z), P(-x, y1, z), P(x, y1, z), P(x, y1, -z), [0, 0], [0, d / 2], [w / 2, d / 2], [w / 2, 0]);
  for (const zz of [-z, z]) f.quad(SD_REALM_ROOT_RECORD, P(-x, y0, zz), P(-x, y1, zz), P(x, y1, zz), P(x, y0, zz), [0, 0], [0, 0.5], [w / 2, 0.5], [w / 2, 0]);
  return packRealmFaces(f);
}
export function sealParts(door, side, y = door[1], along = /** @type {number[]|null} */ (null)) {
  const f = faces(), u = along ?? [0, 1], n = along ? [u[1], -u[0]] : [1, 0], t = 0.2, hw = 1.0, h = 2.6, y0 = y, y1 = y + h;
  const C = (a, b, yy) => [door[0] + n[0] * a + u[0] * b, yy, door[2] + n[1] * a + u[1] * b];
  const quads = [
    [C(-t, -hw, y0), C(-t, hw, y0), C(-t, hw, y1), C(-t, -hw, y1)], [C(t, hw, y0), C(t, -hw, y0), C(t, -hw, y1), C(t, hw, y1)],
    [C(-t, -hw, y0), C(-t, -hw, y1), C(t, -hw, y1), C(t, -hw, y0)], [C(t, hw, y0), C(t, hw, y1), C(-t, hw, y1), C(-t, hw, y0)],
    [C(-t, -hw, y1), C(-t, hw, y1), C(t, hw, y1), C(t, -hw, y1)],
  ];
  for (const q of quads) f.quad(SD_REALM_PILLAR_RECORD, q[0], q[1], q[2], q[3], [0, 0], [1, 0], [1, 1], [0, 1]);
  const as = (side > 0 ? -1 : 1) * (t + 0.004) * (n[0] < 0 ? -1 : 1);
  f.quad(SD_REALM_EDGE_RECORD, C(as, -0.03, y0 + 0.1), C(as, 0.03, y0 + 0.1), C(as, 0.03, y1 - 0.2), C(as, -0.03, y1 - 0.2), [0, 0], [1, 0], [1, 1], [0, 1]);
  const tris = [];
  for (const q of quads) tris.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
  return { model: packRealmFaces(f), tris: new Float32Array(tris) };
}
const STEP_MESH_KIND = Object.freeze({ drift: 'drift', beat: 'beat', riser: 'riser', crumble: 'crumble', bone: 'crumble' });
// Movers form their own batch kind so a moving piece never re-uploads the still slabs' vertices.
export const EG_SPAN_MOVERS = Object.freeze(['drift', 'rail', 'drum', 'moon']);
export const EG_SPAN_KINDS_MAX = 16;
const darkStone = () => { const m = buildWaystoneModel(); return { ...m, subMeshes: m.subMeshes.map((sm) => (sm.textureRecord === SD_STEPS_RECORD.parts ? { ...sm, textureRecord: SD_STEPS_RECORD.partsDark } : sm)) }; };
const _at = { dx: 0, dz: 0, solid: true };
const _gust = { push: 0, warn: false };
export const EG_WALL_SEG_M = 2;
const WALL_FALL_G = 9.8;
// Caps the per-frame gust and belt push like `BREATH_DT_MAX` in worldEvents/sdSteps.js, so a long frame does not
// fling the body.
const EG_GUST_DT_MAX = 0.1;
export const EG_GUST_REACH_M = 6;
export const EG_GUST_STOREY_M = Object.freeze({ over: 3, under: 2 });
export const egGustStorey = (g, ry) => (g.spec.law ?? 0) < 9 || (ry >= g.y - EG_GUST_STOREY_M.under && ry <= (g.y1 ?? g.y) + EG_GUST_STOREY_M.over);

export const EG_SB_THICK = 0.12;
export const EG_SB_GROW_S = 0.25;
export const EG_SB_LAST_S = 1;
export const EG_SB_FALTER_HZ = 2;
export function egBridgeModel(len, w, dy) {
  const f = faces(), x = w / 2, h = EG_SB_THICK;
  const P = (a, b, c) => [a, b, c];
  const A = P(-x, 0, 0), Bq = P(x, 0, 0), C = P(x, dy, len), D = P(-x, dy, len);
  f.quad(SD_REALM_EDGE_RECORD, A, D, C, Bq, [0, 0], [0, len / 2], [w / 2, len / 2], [w / 2, 0]);
  for (const [a, b, n] of [[A, Bq, [0, 0, -1]], [Bq, C, [1, 0, 0]], [C, D, [0, 0, 1]], [D, A, [-1, 0, 0]]]) {
    f.quad(SD_REALM_BRASS_RECORD, a, P(a[0], a[1] - h, a[2]), P(b[0], b[1] - h, b[2]), b, [0, 0], [0, 0.3], [1, 0.3], [1, 0]);
    const o = 0.02;
    f.quad(SD_REALM_EDGE_RECORD, P(a[0] + n[0] * o, a[1] + 0.004, a[2] + n[2] * o), P(a[0] + n[0] * o, a[1] - 0.05, a[2] + n[2] * o), P(b[0] + n[0] * o, b[1] - 0.05, b[2] + n[2] * o), P(b[0] + n[0] * o, b[1] + 0.004, b[2] + n[2] * o), [0, 0], [0, 1], [1, 1], [1, 0]);
  }
  f.quad(SD_REALM_FLOOR_RECORD, P(-x, -h, 0), P(x, -h, 0), P(x, dy - h, len), P(-x, dy - h, len), [0, 0], [1, 0], [1, 1], [0, 1]);
  return packRealmFaces(f);
}
export function egBridgeTris(len, w, dy) {
  const x = w / 2, h = EG_SB_THICK, out = [];
  const q = (a, b, c, e) => out.push(...a, ...b, ...c, ...a, ...c, ...e);
  q([-x, 0, 0], [x, 0, 0], [x, dy, len], [-x, dy, len]);
  q([-x, -h, 0], [x, -h, 0], [x, 0, 0], [-x, 0, 0]); q([-x, dy - h, len], [x, dy - h, len], [x, dy, len], [-x, dy, len]);
  q([-x, -h, 0], [-x, dy - h, len], [-x, dy, len], [-x, 0, 0]); q([x, -h, 0], [x, dy - h, len], [x, dy, len], [x, 0, 0]);
  const positions = new Float32Array(out), indices = new Uint16Array(positions.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  return { positions, indices };
}
export function egBridgeLook(q, ms, still = false) {
  const stand = ms >= q.from && ms < q.until, left = (q.until - ms) / 1000, since = (ms - q.from) / 1000;
  const grow = !stand ? 0 : still ? 1 : Math.max(0.05, Math.min(1, since / EG_SB_GROW_S));
  const falter = !still && left <= EG_SB_LAST_S && Math.floor(left * EG_SB_FALTER_HZ * 2) % 2 === 1;
  return { stand, grow, seen: stand && !falter };
}

export const EG_CHAIN = Object.freeze({ link: 0.9, w: 0.22, bar: 0.05 });
export const EG_HANG_TOP = Object.freeze([1.08, 0.22, 1.74, 0.45]);
export const EG_HANG_CABLE_M = 6;
export const EG_HANG_HALF = Object.freeze({ x: 3.5, z: 1.05, down: 1.6, chainX: SD_PENDULUM.foot + 0.25, chainZ: 0.25 });
const EG_HANG_SLAB = 0.6, EG_HANG_MIN = 2.4, EG_HANG_OVER = 2.4;
/**
 * @param {any} spec
 * @param {any} s
 * @param {number} band
 */
export function egHangReach(spec, s, band) {
  const top = EG_HANG_TOP[band] ?? EG_HANG_TOP[0], H = EG_HANG_HALF, a = s.amp ?? 0;
  let clear = Infinity;
  const over = (ax0, az0, ax1, az1, y, r = 0) => {
    const u = y - EG_HANG_SLAB - s.y, hi = u >= SD_PENDULUM.len - H.down, rx = a + (hi ? H.x : H.chainX), rz = hi ? H.z : H.chainZ;
    if (!(y - s.y > EG_HANG_OVER)) return;
    if (r > 0) { const cx = (ax0 + ax1) / 2, cz = (az0 + az1) / 2; if (Math.hypot(cx - Math.max(s.x - rx, Math.min(s.x + rx, cx)), cz - Math.max(s.z - rz, Math.min(s.z + rz, cz))) > r) return; }
    else if (!(ax0 < s.x + rx && ax1 > s.x - rx && az0 < s.z + rz && az1 > s.z - rz)) return;
    clear = Math.min(clear, u);
  };
  for (const d of spec.discs ?? []) over(d.x - d.r, d.z - d.r, d.x + d.r, d.z + d.r, d.y ?? 0, d.r);
  for (const b of spec.bands ?? []) over(b.x - b.halfW, b.z0, b.x + b.halfW, b.z1, b.y ?? 0);
  for (const l of spec.lanes ?? []) over(Math.min(l.ax, l.bx) - l.hw, Math.min(l.az, l.bz) - l.hw, Math.max(l.ax, l.bx) + l.hw, Math.max(l.az, l.bz) + l.hw, l.y ?? 0);
  for (const r of spec.ramps ?? []) over(Math.min(r.ax, r.bx) - r.hw, Math.min(r.az, r.bz) - r.hw, Math.max(r.ax, r.bx) + r.hw, Math.max(r.az, r.bz) + r.hw, Math.min(r.y0, r.y1));
  for (const q of spec.heroes ?? []) {
    for (const f of q.floors ?? []) { let fx0 = Infinity, fz0 = Infinity, fx1 = -Infinity, fz1 = -Infinity; for (const [px, pz] of f.poly) { fx0 = Math.min(fx0, px); fz0 = Math.min(fz0, pz); fx1 = Math.max(fx1, px); fz1 = Math.max(fz1, pz); } over(fx0, fz0, fx1, fz1, f.y ?? 0); }
    const B = q.box;
    if (B) over(B[0], B[2], B[3], B[5], B[1] + EG_HANG_SLAB);
  }
  for (const c of spec.caves ?? []) if (!c.open && Math.abs(s.x - c.x) <= c.halfW && s.z >= c.z0 && s.z <= c.z1 && s.y >= c.y - 0.5) over(c.x - c.halfW, c.z0, c.x + c.halfW, c.z1, c.y + c.height + EG_HANG_SLAB);
  const crane = band === 3;
  if (!(clear < SD_PENDULUM.len + (crane ? EG_HANG_CABLE_M : top))) return { len: SD_PENDULUM.len, over: EG_HANG_CABLE_M };
  const len = Math.round(100 * Math.max(EG_HANG_MIN, Math.min(SD_PENDULUM.len, clear - top))) / 100;
  return { len, over: crane ? Math.round(100 * Math.max(0, Math.min(EG_HANG_CABLE_M, clear - len))) / 100 : EG_HANG_CABLE_M };
}
/**
 * @param {number} band
 * @param {number} [len]
 * @param {number} [over]
 */
export function egHangModel(band, len = SD_PENDULUM.len, over = EG_HANG_CABLE_M) {
  const k = createMeshKit(), P = SD_PENDULUM, F = P.foot, L = EG_CHAIN.link, low = -(len + P.into), n = Math.ceil(-low / L), B = SD_REALM_BRASS_RECORD;
  for (const sx of [-1, 1]) {
    const x = sx * F;
    for (let i = 0; i < n; i++) {
      const y1 = -i * L + EG_CHAIN.bar, y0 = Math.max(low, -(i + 1) * L - EG_CHAIN.bar), flat = i % 2 === 0;
      const hx = flat ? EG_CHAIN.w / 2 : EG_CHAIN.bar, hz = flat ? EG_CHAIN.bar : EG_CHAIN.w / 2;
      k.box(B, [x - hx, y0, -hz], [x + hx, y1, hz], { skip: flat ? ['top', 'bottom', 'nx', 'px'] : ['top', 'bottom', 'nz', 'pz'] });
    }
    const a = Math.min(sx * P.eye, x), b = Math.max(sx * P.eye, x), r = P.rod / 2;
    k.box(B, [a - r, low - r, -r], [b + r, low + r, r]);
  }
  const sq = (h, w = h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  if (band === 1) {
    k.sweep(B, sq(0.22), [[-F - 0.8, 0.11, 0], [F + 0.8, 0.11, 0]]);
    for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) { const x = (i / 2) * F; k.sweep(B, sq(0.12), [[x, 0.11, 0], [x, -0.2, 0.9 * s], [x, -1.3, 0.95 * s]]); }
  } else if (band === 2) {
    const ring = (x, r, y) => Array.from({ length: 6 }, (_, j) => { const a = (j / 6) * Math.PI * 2 + x; return [x, y + Math.cos(a) * r * (j % 2 ? 0.8 : 1), Math.sin(a) * r * (j % 2 ? 0.8 : 1)]; });
    const pts = [[-F - 1.0, 0.7, 0], ring(-1.3, 0.55, 0.75), ring(0.15, 0.85, 0.9), ring(1.4, 0.5, 0.7), [F + 0.9, 0.65, 0.1]];
    const axis = (p) => [p[0], 0.75, 0];
    for (let r = 1; r < 4; r++) {
      const A = pts[r], Bn = r < 3 ? pts[r + 1] : null;
      for (let j = 0; j < 6; j++) {
        const a = A[j], b = A[(j + 1) % 6];
        if (r === 1) k.tri(B, pts[0], a, b, axis(a), false);
        if (Bn) k.quad(B, a, b, Bn[(j + 1) % 6], Bn[j], axis(a), false);
        else k.tri(B, a, b, pts[4], axis(a), false);
      }
    }
  } else if (band === 3) {
    k.box(B, [-F - 0.5, 0, -0.22], [F + 0.5, 0.45, 0.22]);
    if (over > 0.45) k.box(B, [-0.05, 0.45, -0.05], [0.05, over, 0.05]);
    k.sweep(B, sq(0.14), [[0, 0, 0], [0, -0.9, 0], [0.3, -1.25, 0], [0.62, -1.0, 0], [0.62, -0.82, 0]]);
  } else {
    const R = 3.4, yc = -Math.sqrt(R * R - F * F), a0 = Math.acos(3.2 / R), crown = [];
    for (let i = 0; i <= 8; i++) { const a = a0 + ((Math.PI - 2 * a0) * i) / 8; crown.push([(R + 0.28) * Math.cos(a), yc + (R + 0.28) * Math.sin(a), 0]); }
    const V = EG_KIT_RECORD.voussoir, ri = R - 0.25, ro = R + 0.25, zt = 0.3, ang = (i) => a0 + ((Math.PI - 2 * a0) * i) / 8;
    const Pt = (i, rr, z) => [rr * Math.cos(ang(i)), yc + rr * Math.sin(ang(i)), z], u = (i) => ((ang(i) - a0) * R) / 2;
    for (let i = 0; i < 8; i++) {
      const d = [Math.cos((ang(i) + ang(i + 1)) / 2), Math.sin((ang(i) + ang(i + 1)) / 2), 0], u0 = u(i), u1 = u(i + 1);
      k.quad(V, Pt(i, ro, -zt), Pt(i + 1, ro, -zt), Pt(i + 1, ro, zt), Pt(i, ro, zt), d, true, [[u0, 0.25], [u1, 0.25], [u1, 0.25], [u0, 0.25]]);
      k.quad(V, Pt(i, ri, -zt), Pt(i + 1, ri, -zt), Pt(i + 1, ri, zt), Pt(i, ri, zt), [-d[0], -d[1], 0], true, [[u0, 0], [u1, 0], [u1, 0], [u0, 0]]);
      for (const z of [-zt, zt]) k.quad(V, Pt(i, ri, z), Pt(i + 1, ri, z), Pt(i + 1, ro, z), Pt(i, ro, z), [0, 0, Math.sign(z)], true, [[u0, 0], [u1, 0], [u1, 0.25], [u0, 0.25]]);
    }
    for (const [i, s] of [[0, -1], [8, 1]]) { const t = [-Math.sin(ang(i)) * s, Math.cos(ang(i)) * s, 0]; k.quad(V, Pt(i, ri, -zt), Pt(i, ro, -zt), Pt(i, ro, zt), Pt(i, ri, zt), t, true, [[0, 0], [0, 0.25], [0.3, 0.25], [0.3, 0]]); }
    k.sweep(B, sq(0.06, 0.64), crown);
  }
  return k.pack(egBandArchive(band));
}
// Sizes the ghost pass's uniform arrays. A circle with more Beats and Crumbles gets the nearest halls' ghosts
// through `aimGhosts`.
export const EG_GHOSTS_MAX = 48;
export const EG_GHOST_SLAB = Object.freeze({ hold: 0.3, fill: 0.35 });
const _tellUp = new WeakMap();
export function egBeatTellUp(renderer, band, key) {
  if (!renderer || typeof renderer !== 'object') return false;
  let up = _tellUp.get(renderer);
  if (!up) _tellUp.set(renderer, up = new Map());
  const k = `${band | 0}:${key}`, back = `${band | 0}:back`;
  if (!up.has(k)) {
    let ok = false;
    if (typeof renderer.uploadTexture === 'function') {
      try {
        for (const [rec, art] of [...egBeatWarnArt(key), ...(up.has(back) ? [] : egBeatBackArt())]) { renderer.uploadTexture(egTellArchive(band), rec, art.albedo, { cutout: true }); renderer.uploadEmissionTexture?.(egTellArchive(band), rec, art.emission, { white: true }); }
        up.set(back, true); ok = true;
      } catch (e) { console.warn('[eg] a Beat\'s pictures would not upload', e?.message ?? e); }
    }
    up.set(k, ok);
  }
  return up.get(k);
}
// `egBandsDown` in egCircleHost.js calls this at the breach's end; a span's `clear` leaves these textures up so a
// swap uploads nothing.
export function egBeatTellDown(renderer) {
  const up = renderer && typeof renderer === 'object' ? _tellUp.get(renderer) : null;
  if (!up?.size) return 0;
  const bands = new Set([...up.keys()].map((k) => Number(k.split(':')[0])));
  _tellUp.delete(renderer);
  let n = 0;
  for (const band of bands) {
    const arch = egTellArchive(band);
    for (const rec of [...[...EG_BEAT_TELL_RECORDS.warn.flat(), ...EG_BEAT_TELL_RECORDS.back], ...EG_PIECE_TELL_RECORDS]) { if (renderer.releaseTexture?.(arch, rec)) n++; if (renderer.evictEmissionTexture?.(`${arch}_${rec}`)) n++; }
  }
  return n;
}
/**
 * @param {any} renderer
 * @param {number} band
 * @param {{ crumble?: boolean, beat?: boolean }} want
 */
export function egPieceTellUp(renderer, band, { crumble = false, beat = false } = {}) {
  if (!renderer || typeof renderer !== 'object' || typeof renderer.uploadTexture !== 'function') return false;
  let up = _tellUp.get(renderer);
  if (!up) _tellUp.set(renderer, up = new Map());
  const arch = egTellArchive(band);
  const once = (k, list, cutout) => {
    if (!up.has(k)) {
      let ok = false;
      try { for (const [rec, art] of list()) { renderer.uploadTexture(arch, rec, art.albedo, cutout ? { cutout: true } : undefined); renderer.uploadEmissionTexture?.(arch, rec, art.emission, { white: true }); } ok = true; } catch (e) { console.warn('[eg] a piece\'s pictures would not upload', e?.message ?? e); }
      up.set(k, ok);
    }
    return up.get(k);
  };
  let ok = true;
  if (crumble) ok = once(`${band | 0}:crumble`, () => egCrumbleTellArt(band), false) && ok;
  if (beat) ok = once(`${band | 0}:stone`, () => egBeatStoneArt(band), true) && ok;
  return ok;
}
const _beatMaps = new Map();
function egBeatDressMaps(band, key) {
  const W = egBeatTellMaps(band, key), k = `${band | 0}:${key}`;
  let m = _beatMaps.get(k);
  if (!m || m.W !== W) {
    const arch = egBandArchive(band), tell = egTellArchive(band);
    const merge = (dial, stage, list) => new Map([...dial, ...EG_BEAT_STONE_RECORDS.map((q) => [`${arch}_${q.rec}`, `${tell}_${q[list][stage]}`])]);
    _beatMaps.set(k, m = { W, warn: Object.freeze(W.warn.map((d, s) => merge(d, s, 'warn'))), back: Object.freeze(W.back.map((d, s) => merge(d, s, 'back'))) });
  }
  return m;
}
export const egGhostRgb = (pal) => (pal && pal.key !== 'standard' && Array.isArray(pal.safety) ? pal.safety : SD_GHOST.color);
// Beats on the same beat share one picture map, so each beat value gets its own batch kind.
const beatKind = (s) => `beat@${Math.round(s.beat * 1000)}`;
function yawAbout(out, yw, x, y, z) {
  const c = Math.cos(yw), s = Math.sin(yw);
  out.fill(0);
  out[0] = c; out[2] = -s; out[5] = 1; out[8] = s; out[10] = c; out[15] = 1;
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}
const _vane = new Float64Array(2);
/**
 * Every added bucket key goes into `keys` so the host can remove it at the swap; a plank removed at its end also
 * leaves `keys`.
 * @param {{ addMesh: Function, removeBucket: Function }} collider
 * @param {string[]} keys
 */
export function egSpanCollider(collider, keys) {
  return {
    addMesh: (...a) => { keys.push(a[0]); return collider.addMesh(...a); },
    removeBucket: (k) => { const i = keys.indexOf(k); if (i >= 0) keys.splice(i, 1); return collider.removeBucket(k); },
  };
}

/** @param {{ renderer?: any, audio?: any, seed: number, c: number, geo?: number, lite?: boolean }} deps */
export function createEgSpan({ renderer = null, audio = null, seed, c, geo = 0, lite = isTouchDevice() }) {
  const specs = egCircleSpecs(seed, c, geo);
  const steps = [];
  for (const spec of specs) for (const s of spec.steps) steps.push({ s, spec, key: egStepKey(spec.h, s.i), T: [0, EG_STEP_GONE_Y, 0], was: [0, EG_STEP_GONE_Y, 0], solid: false, wasSolid: false, draw: null, pend: null, touched: null, wait: SD_CRUMBLE_DELAY, stages: null, chunks: null, grit: null, hang: null, pivot: null, len: SD_PENDULUM.len, back: -Infinity, peerAt: -Infinity, ghost: -1 });
  const byKey = new Map(steps.map((st) => [st.key, st]));
  /** @type {Map<string, any>} */
  const meshes = new Map();
  let draws = null;
  let safe = null, safeY = 0;
  let overDrop = false;
  const voidFall = { v: null }, EG_VOID_LEAP_M = 6;
  let voidA = [0, 0, 0], voidB = [0, 0, 0], voidHas = false, voidFromY = NaN, voidH = 0;
  function intoVoid(rx, ry, rz, grounded) {
    const hs = specs.find((q) => q.voids?.length && Math.abs(rx - q.x0) <= 160);
    if (!hs) { voidHas = false; voidFall.v = null; voidFromY = NaN; return false; }
    if (hs.h !== voidH) { voidH = hs.h; voidHas = false; voidFall.v = null; voidFromY = NaN; }
    const a = voidA; voidA = voidB; voidB = a;
    voidA[0] = rx - hs.x0; voidA[1] = ry; voidA[2] = rz;
    // A move wider than `EG_VOID_LEAP_M` in one frame is a cast-back, pull, or recall, not a fall, so the void
    // memory resets.
    if (voidHas && Math.hypot(voidA[0] - voidB[0], voidA[2] - voidB[2]) > EG_VOID_LEAP_M) { voidHas = false; voidFall.v = null; }
    const hit = Number.isFinite(voidFromY) && !!egVoidStep(voidFall, hs, voidFromY, voidHas ? voidB : null, voidA, grounded);
    voidHas = true;
    if (grounded) voidFromY = ry;
    return hit;
  }
  const band = egBandOfCircle(c);
  const make = (model) => { if (!model || !renderer?.createMesh) return null; try { return renderer.createMesh(egBandDress(model, band)); } catch (e) { console.warn('[eg] a span would not build', e?.message ?? e); return null; } };
  const play = (rec, vol, pitch = 1) => { try { audio?.playOneShot?.(rec, vol, pitch); } catch { } };
  const play3 = (rec, at, vol, pitch = 1) => { try { audio?.play3d?.(rec, at, vol, { maxDistance: 30, pitch }); } catch { } };
  const kindOf = (s) => (s.kind === 'beat' ? beatKind(s) : EG_SPAN_MOVERS.includes(s.kind) ? 'mover' : 'slab');
  const boxOf = (s) => (STEP_MESH_KIND[s.kind] ? stepBox(STEP_MESH_KIND[s.kind]) : { w: s.w, d: s.d });
  const modelOf = (st) => {
    const s = st.s, B = boxOf(s), plan = egPiecePlan(st.spec, s, { seed: egPieceSeed(seed, c, st.spec.h, s.i), lite, band, w: B.w, d: B.d });
    return s.kind === 'beat' ? egBeatModel(band, plan) : s.kind === 'riser' ? egRiserModel(band, plan) : s.kind === 'drop' ? egDropLookModel(band, plan, EG_DROP_WALL_H, DROP_DOOR) : egPieceModel(band, plan);
  };
  const trisOf = (s) => (STEP_MESH_KIND[s.kind] ? stepTris(STEP_MESH_KIND[s.kind]) : s.kind === 'drop' ? egDropTris(s.w, s.d) : egSlabTris(s.w, s.d));
  const gusts = egGustSections(specs);
  let batch = null;
  /** @type {Map<string, any>} */
  const models = new Map();
  /** @type {Map<string, any[]>} */
  const plainOf = new Map();
  /** @type {Map<string, { s: any, map: any }>} */
  const beatKinds = new Map();
  const ghostAll = steps.filter((st) => st.s.kind === 'beat' || EG_CRUMBLE_KINDS.includes(st.s.kind));
  let ghostSteps = ghostAll.slice(0, EG_GHOSTS_MAX), ghostHall = ghostAll.length > EG_GHOSTS_MAX ? -1 : null;
  ghostSteps.forEach((st, k) => { st.ghost = k; });
  const ghostStep = new Float32Array(EG_GHOSTS_MAX * 4), ghostState = new Float32Array(EG_GHOSTS_MAX * 4);
  const ghostKinds = () => ghostSteps.map((st) => ({ kind: st.s.kind === 'beat' ? 'beat' : 'crumble' }));
  function aimGhosts(rx) {
    if (ghostHall === null) return;
    let hs = null;
    for (const q of specs) if (!hs || Math.abs(rx - q.x0) < Math.abs(rx - hs.x0)) hs = q;
    if (!hs || hs.h === ghostHall) return;
    ghostHall = hs.h;
    for (const st of ghostSteps) st.ghost = -1;
    const off = (st) => Math.abs(st.spec.x0 - hs.x0);
    ghostSteps = ghostAll.map((st, k) => ({ st, k })).sort((a, b) => off(a.st) - off(b.st) || a.k - b.k).slice(0, EG_GHOSTS_MAX).map((q) => q.st);
    ghostSteps.forEach((st, k) => { st.ghost = k; });
    ghostStep.fill(0); ghostState.fill(0);
    pass?.ghosts(ghostKinds());
  }
  /** @type {SdStepsPass | null} */
  let pass = null;
  const ghostOpts = { max: EG_GHOSTS_MAX, slab: true, fogFloor: EG_FOG_FLOOR };
  const ghostsDoor = () => (renderer?.gl ? compiledPass(renderer.gl, sdStepsPrograms(ghostOpts), () => new SdStepsPass(renderer.gl, ghostKinds(), ghostOpts), (e) => console.warn('[eg] the ghosts would not build', e?.message ?? e)) : null);
  let passOf = ghostsDoor();
  if (renderer?.gl && parallelCompile(renderer.gl)) { startPrograms(renderer.gl, sdStepsPrograms(ghostOpts)); startEgLookPrograms(renderer.gl); }
  const crumbleSet = egCrumbleModels(band, lite ? 2 : 4), chunkWays = sdChunkWays(crumbleSet.chunks);
  const stones = [];
  for (const spec of specs) for (const road of [0, 1]) {
    const course = egCourseOf(spec, road);
    if (!course) continue;
    const at = sdWaystonesOf(course);
    for (let k = road === 0 ? 1 : 0; k < at.length; k++) stones.push({ spec, isl: course.checkpoints[k], at: realmToDungeon(spec.x0 + at[k][0], at[k][1], at[k][2]), lit: null, dark: null });
  }
  let litStone = null;
  const vanes = [];
  for (const g of gusts) {
    g.h0 = g.z0; g.h1 = g.z1;
    for (const isl of g.spec.islands) if (isl.z + isl.r >= g.z0 && isl.z - isl.r <= g.z1 && Math.abs(isl.x - g.x) <= EG_GUST_REACH_M) { const v = sdVaneAt({ checkpoints: [isl, isl, isl] }); vanes.push({ at: realmToDungeon(g.spec.x0 + v[0], v[1], v[2]), draw: null }); g.h0 = Math.min(g.h0, isl.z - isl.r); g.h1 = Math.max(g.h1, isl.z + isl.r); }
  }
  let lastWarned = null, lastT = -Infinity;
  let access = { palette: null, fill: 1, still: false };
  function tellMaps() {
    const key = access.palette?.key ?? 'standard';
    if (!renderer || !egBeatTellUp(renderer, band, key)) return null;
    return egPieceTellUp(renderer, band, { beat: true }) ? egBeatDressMaps(band, key) : egBeatTellMaps(band, key);
  }
  function standTells(st) {
    const s = st.s;
    if (s.kind === 'beat') {
      if (!beatKinds.has(beatKind(s))) beatKinds.set(beatKind(s), { s, map: undefined });
    } else if (EG_CRUMBLE_KINDS.includes(s.kind)) {
      st.stages = [1, 2, 3].map((n) => place('crack', `crumble:${n}`, () => crumbleSet.stages[n - 1]));
      st.chunks = crumbleSet.chunks.map((q, j) => place('chunk', `chunk:${j}`, () => q.model, { turns: true }));
      st.grit = place('crack', 'grit', () => buildGritModel());
    } else if (s.kind === 'drift') {
      const R = egHangReach(st.spec, s, band), full = R.len === SD_PENDULUM.len && R.over === EG_HANG_CABLE_M;
      st.len = R.len;
      st.pivot = realmToDungeon(st.spec.x0 + s.x, s.y + R.len, s.z);
      st.hang = place(`hang:${st.spec.h}`, full ? `hang:${st.spec.h}` : `hang:${st.spec.h}:${R.len}:${R.over}`, () => egHangModel(band, R.len, R.over), { turns: true });
    }
    for (const d of [...(st.stages ?? []), ...(st.chunks ?? []), st.grit, st.hang]) if (d) away(d);
  }
  function beatFrames(t) {
    let W;
    for (const B of beatKinds.values()) {
      const u = egBeatAt(B.s, t), warned = u - (SD_BEAT_SOLID - SD_BEAT_BLINK), frame = Math.min(11, Math.floor(u / SD_BEAT_FRAME_S));
      let map = SD_BEAT_FRAMES[frame];
      if ((warned >= 0 && u < SD_BEAT_SOLID) || u < SD_BEAT_IN_S) {
        W ??= tellMaps();
        if (W && warned >= 0) map = W.warn[Math.min(SD_BEAT_DISSOLVE.keep.length - 1, Math.floor(warned / SD_BEAT_OUT_STAGE_S))];
        else if (W) map = W.back[2 - Math.floor((u / SD_BEAT_IN_S) * 3)];
      }
      if (map !== B.map) { B.map = map; kindRemap(beatKind(B.s), map); }
    }
  }
  function beatLook(st, t, x, y, z, solid) {
    const u = egBeatAt(st.s, t);
    if (st.ghost < 0) return;
    const o = st.ghost * 4, left = SD_BEAT_CYCLE - u, kr = (SD_GHOST.rise - left) / SD_GHOST.rise, e = kr < 0 ? 0 : kr > 1 ? 1 : kr;
    ghostStep[o] = x; ghostStep[o + 1] = y; ghostStep[o + 2] = z;
    ghostState[o] = solid ? 0 : 1; ghostState[o + 1] = solid ? 0 : left / (SD_BEAT_CYCLE - SD_BEAT_SOLID); ghostState[o + 2] = SD_GHOST.base + (SD_GHOST.peak - SD_GHOST.base) * e * e * (3 - 2 * e); ghostState[o + 3] = 0;
  }
  function crumbleLook(st, t, x, y, z, since, solid, drop) {
    const shaking = solid && since >= 0, still = access.still, chunked = st.chunks.some(Boolean);
    let sx = 0, sz = 0;
    if (shaking && !still) { sx = SD_CRUMBLE_SHAKE * Math.sin(t * 71); sz = SD_CRUMBLE_SHAKE * Math.cos(t * 53); }
    else if (!shaking && since < 0 && t >= st.back && t - st.back < SD_CHUNK.shudder && !still) { const k = 1 - (t - st.back) / SD_CHUNK.shudder; sx = SD_CHUNK.settle * k * Math.sin(t * 83); sz = SD_CHUNK.settle * k * Math.cos(t * 61); }
    const n = shaking ? 1 + Math.min(2, Math.floor((since / st.wait) * 3)) : 0;
    if (st.draw && (solid || chunked)) { if (solid && n === 0) { translate(st.draw.object.matrix, x + sx, y, z + sz); st.draw.hidden = false; } else away(st.draw); }
    for (let k = 0; k < 3; k++) { const d = st.stages[k]; if (!d) continue; if (n === k + 1) { translate(d.object.matrix, x + sx, y, z + sz); d.hidden = false; } else away(d); }
    const g = st.grit;
    if (g) { if (shaking) { translate(g.object.matrix, x + sx, y - ((t * SD_GRIT.speed) % SD_GRIT.period), z + sz); g.hidden = false; } else away(g); }
    const f = solid ? -1 : since - st.wait, back = SD_CRUMBLE_BACK - SD_CHUNK.rewind;
    const r = f >= back ? 1 - (f - back) / SD_CHUNK.rewind : 0, tau = f >= back ? SD_CHUNK.rise * r * r : f, show = f >= back || (f >= 0 && drop < SD_CRUMBLE_SEEN);
    for (let j = 0; j < st.chunks.length; j++) { const d = st.chunks[j]; if (!d) continue; if (show) { sdChunkMatrix(d.object.matrix, chunkWays[j], tau, x, y, z); d.hidden = false; } else away(d); }
    if (st.ghost < 0) return;
    const o = st.ghost * 4, kr = (f - back) / SD_CHUNK.rewind, e = kr < 0 ? 0 : kr > 1 ? 1 : kr;
    ghostStep[o] = x; ghostStep[o + 1] = y; ghostStep[o + 2] = z;
    ghostState[o] = f >= 0 ? 1 : 0; ghostState[o + 1] = f >= 0 ? (SD_CRUMBLE_BACK - f) / SD_CRUMBLE_BACK : 0; ghostState[o + 2] = SD_GHOST.base + (SD_GHOST.peak - SD_GHOST.base) * e * e * (3 - 2 * e);
    ghostState[o + 3] = f >= 0 && t >= st.peerAt && t - st.peerAt <= EG_GHOST_SLAB.hold ? EG_GHOST_SLAB.fill : 0;
  }
  function hangLook(st, dx) {
    const m = st.hang.object.matrix, a = st.len < SD_PENDULUM.len ? Math.asin(Math.max(-1, Math.min(1, dx / st.len))) : pendulumAngle(dx), cs = Math.cos(a), sn = Math.sin(a), P = st.pivot;
    m.fill(0); m[0] = cs; m[1] = sn; m[4] = -sn; m[5] = cs; m[10] = 1; m[15] = 1; m[12] = P[0]; m[13] = P[1]; m[14] = P[2];
    st.hang.hidden = false;
  }
  function poseMarks(t) {
    for (const g of stones) { const mine = g === litStone; if (g.lit) g.lit.hidden = !mine; if (g.dark) g.dark.hidden = mine; }
    if (!vanes.length) return;
    _vane[0] = t; vaneYawInto(_vane);
    for (const v of vanes) if (v.draw) { yawAbout(v.draw.object.matrix, _vane[1], v.at[0], v.at[1], v.at[2]); v.draw.hidden = false; }
  }
  const stoneOf = (p) => {
    if (!p) return null;
    const [rx, ry, rz] = dungeonToRealm(p[0], p[1], p[2]);
    return stones.find((g) => Math.hypot(rx - g.spec.x0 - g.isl.x, rz - g.isl.z) <= g.isl.r + 0.5 && Math.abs(ry - g.isl.y) < 1.5) ?? null;
  };
  const place = (kind, mk, modelFn, { turns = false } = {}) => {
    if (!models.has(mk)) { const m = modelFn(); models.set(mk, m ? egBandDress(m, band) : null); }
    const model = models.get(mk);
    if (!model) return null;
    if (batch) {
      const slot = { object: { matrix: new Float32Array(16) }, hidden: false };
      return batch.add(kind, model, slot, { turns }) ? slot : null;
    }
    if (!meshes.has(mk)) meshes.set(mk, make(model));
    const gpu = meshes.get(mk);
    if (!gpu) return null;
    const d = { gpu, object: { matrix: new Float32Array(16) }, noShadow: true, texRemap: null };
    draws.push(d);
    if (!plainOf.has(kind)) plainOf.set(kind, []);
    plainOf.get(kind).push(d);
    return d;
  };
  const kindRemap = (mk, map) => { if (batch) batch.remap(mk, map); else for (const d of plainOf.get(mk) ?? []) d.texRemap = map; };
  const away = (d) => { d.object.matrix.fill(0); d.hidden = true; };
  /** @type {any[]} */
  let targetList = [];
  const orrery = createEgOrrery({ seed, specs, place });
  const walls = [];
  for (const spec of specs) {
    if (spec.variant !== 'fallingwall' || !spec.walk) continue;
    const w = spec.walk, n = Math.max(1, Math.ceil((w.z1 - w.z0) / EG_WALL_SEG_M)), d = (w.z1 - w.z0) / n;
    for (let k = 0; k < n; k++) walls.push({ spec, k, z0: w.z0 + k * d, z1: w.z0 + (k + 1) * d, w: 2 * w.halfW, d, key: `eg:wall:${spec.h}:${k}`, T: [0, EG_STEP_GONE_Y, 0], draw: null, goneAt: null });
  }
  const belts = specs.filter((q) => q.variant === 'forgebridge' && q.walk).map((q) => ({ spec: q, w: q.walk }));
  const tubes = [];
  for (const spec of specs) {
    const q = spec.tube;
    if (!q) continue;
    const n = Math.max(1, Math.ceil((q.z1 - q.z0) / EG_WALL_SEG_M)), d = (q.z1 - q.z0) / n;
    for (let k = 0; k < n; k++) tubes.push({ spec, k, z0: q.z0 + k * d, z1: q.z0 + (k + 1) * d, w: 2 * q.halfW, d, key: `eg:tube:${spec.h}:${k}`, T: [0, EG_STEP_GONE_Y, 0], draw: null, lid: null, goneAt: null });
  }
  const tubeEdgeOf = (spec, t) => { const wk = spireWake(); return wk.h === spec.h && wk.hw > 0 ? egTubeEdgeIn(spec, wk.hw, wk.tm, t * 1000) : wk.h > spec.h ? Infinity : -Infinity; };
  const isles = [];
  for (const spec of specs) for (const d of spec.discs) if (egIsleDisc(spec, d)) isles.push({ spec, d, key: `eg:isle:${spec.h}:${isles.length}`, T: [0, 0, 0], draw: null, st: 0, stAt: 0, drop: 0 });
  const slags = [];
  for (const st of steps) if (st.s.kind === 'slag') for (let k = 0; k < EG_SLAG_SPOUTS; k++) slags.push({ st, s: st.s, spec: st.spec, k, key: `${st.key}:${k}`, T: [0, EG_STEP_GONE_Y, 0], crust: null, molten: null, state: 'gone' });
  const lit = new Set(), moons = steps.some((st) => st.s.kind === 'moon');
  /** @type {Map<string, { key: string, spec: any, br: any, q: any, T: number[], at: number[], draw: any, gpu: any }>} */
  const planks = new Map();
  let col = null;
  function standPlank(key, spec, q) {
    const br = egBridgeOf(spec, q.g);
    if (!br) return;
    const len = br.z1 - br.z0, dy = br.y1 - br.y0, at = realmToDungeon(spec.x0 + br.x, br.y0, br.z0);
    const P = { key, spec, br, q, T: [at[0], EG_STEP_GONE_Y, at[2]], at, draw: null, gpu: null };
    const model = egBridgeModel(len, br.w, dy), gpu = make(model);
    if (gpu && draws) { P.gpu = gpu; P.draw = { gpu, object: { matrix: identity() }, noShadow: true, texRemap: null, hidden: true }; draws.push(P.draw); }
    const { positions, indices } = egBridgeTris(len, br.w, dy);
    try { col?.addMesh?.(key, positions, indices, identity(), () => P.T); } catch (e) { console.warn('[eg] a Spirebridge\'s collider', e?.message ?? e); }
    planks.set(key, P);
  }
  function dropPlank(P) {
    planks.delete(P.key);
    if (P.draw && draws) { const i = draws.indexOf(P.draw); if (i >= 0) draws.splice(i, 1); }
    if (P.gpu) { try { renderer?.destroyMesh?.(P.gpu); } catch { } }
    try { col?.removeBucket?.(P.key); } catch { }
    P.draw = null; P.gpu = null;
  }
  function posePlanks(t) {
    const O = spireObjs(), ms = t * 1000, want = new Set(), spec = specs.find((q) => q.h === O.h);
    if (spec) for (const q of O.br ?? []) {
      if (!(ms < q.until)) continue;
      const key = `eg:bridge:${O.h}:${q.g}:${q.from}`;
      want.add(key);
      if (!planks.has(key)) standPlank(key, spec, q);
    }
    for (const P of [...planks.values()]) {
      if (!want.has(P.key)) { dropPlank(P); continue; }
      const L = egBridgeLook(P.q, ms, access.still);
      P.T[1] = L.stand ? P.at[1] : EG_STEP_GONE_Y;
      if (P.draw) {
        const m = P.draw.object.matrix;
        if (L.seen) { translate(m, P.at[0], P.at[1], P.at[2]); m[10] = L.grow; } else m.fill(0);
        P.draw.hidden = !L.seen;
      }
    }
  }
  const seals = [];
  for (const spec of specs) for (const nb of egNicheBoxes(spec)) if (nb.a.seal === 'seam') seals.push({ spec, a: nb.a, door: nb.door, side: nb.side, along: nb.along ?? null, key: `eg:seal:${spec.h}:${nb.a.i}`, T: [0, 0, 0], draw: null, up: true });
  const fallenOf = (spec, t) => { const wk = spireWake(); return wk.h === spec.h && wk.hw > 0 ? egWallFallenZ(spec, wk.hw, t * 1000) : wk.h > spec.h ? Infinity : -Infinity; };
  function poseWalls(t) {
    for (const g of walls) {
      const edge = fallenOf(g.spec, t), gone = g.z1 <= edge;
      if (gone && g.goneAt == null) g.goneAt = t;
      if (!gone) g.goneAt = null;
      const [x, y, z] = realmToDungeon(g.spec.x0 + g.spec.walk.x, 0, (g.z0 + g.z1) / 2);
      g.T[0] = x; g.T[2] = z; g.T[1] = gone ? EG_STEP_GONE_Y : y;
      if (g.draw) {
        const drop = gone ? 0.5 * WALL_FALL_G * (t - g.goneAt) ** 2 : 0, seen = drop < 30;
        if (seen) translate(g.draw.object.matrix, x, y - drop, z); else g.draw.object.matrix.fill(0);
        g.draw.hidden = !seen;
      }
    }
  }
  const translate = (m, x, y, z) => { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; m[12] = x; m[13] = y; m[14] = z; return m; };
  function poseTubes(t) {
    for (const g of tubes) {
      const edge = tubeEdgeOf(g.spec, t), gone = g.z1 <= edge;
      if (gone && g.goneAt == null) g.goneAt = t;
      if (!gone) g.goneAt = null;
      const [x, y, z] = realmToDungeon(g.spec.x0 + g.spec.tube.x, g.spec.tube.y, (g.z0 + g.z1) / 2);
      g.T[0] = x; g.T[2] = z; g.T[1] = gone ? EG_STEP_GONE_Y : y;
      const drop = gone ? 0.5 * WALL_FALL_G * (t - g.goneAt) ** 2 : 0, seen = drop < 30;
      for (const dr of [g.draw, g.lid]) { if (!dr) continue; if (seen) translate(dr.object.matrix, x, y - drop, z); else dr.object.matrix.fill(0); dr.hidden = !seen; }
    }
  }
  function poseIsles(t) {
    if (!isles.length) return;
    const O = spireObjs(), objs = O.objs.filter((o) => o.t === 'isle');
    for (const g of isles) {
      const o = O.h === g.spec.h ? objs.find((q) => Math.hypot(q.x - g.d.x, q.z - g.d.z) < 1.5) : null;
      g.st = o?.st ?? 0; g.stAt = o?.stAt ?? 0;
      const since = Math.max(0, t * 1000 - g.stAt) / 1000;
      g.drop = g.st === 2 ? Math.min(40, 0.5 * WALL_FALL_G * since * since) : 0;
      const shake = g.st === 1 && !access.still ? 0.06 * Math.sin(t * 60) : 0;
      // The crack shake moves only the draw; the collider transform `g.T` stays still.
      g.T[0] = 0; g.T[1] = g.st === 2 ? EG_STEP_GONE_Y : 0; g.T[2] = 0;
      if (g.draw) { const seen = g.drop < 39; if (seen) translate(g.draw.object.matrix, shake, -g.drop, 0); else g.draw.object.matrix.fill(0); g.draw.hidden = !seen; }
    }
  }
  function poseSeals() {
    if (!seals.length) return;
    const O = spireObjs();
    for (const g of seals) {
      const up = O.h !== g.spec.h ? O.h < g.spec.h : O.objs.some((o) => o.t === 'fwall' && o.pt === g.a.i);
      g.up = up;
      g.T[1] = up ? 0 : EG_STEP_GONE_Y;
      if (g.draw) { if (up) translate(g.draw.object.matrix, 0, 0, 0); else g.draw.object.matrix.fill(0); g.draw.hidden = !up; }
    }
  }

  function poseSlags(t) {
    for (const g of slags) {
      const S = egSlagState(g.s, g.k, t);
      g.state = S.st;
      const [x, y, z] = realmToDungeon(g.spec.x0 + egSlagX(g.s, g.k), g.s.y, g.s.z);
      const crust = S.st === 'crust', shake = crust && !access.still && (1 - S.k) * EG_SLAG_CRUST_S < EG_SLAG_WARN_S ? 0.05 * Math.sin(t * 60) : 0;
      g.T[0] = x; g.T[2] = z; g.T[1] = crust ? y : EG_STEP_GONE_Y;
      for (const [dr, on, dx] of /** @type {[any, boolean, number][]} */ ([[g.crust, crust, shake], [g.molten, S.st === 'molten', 0]])) {
        if (!dr) continue;
        if (on) translate(dr.object.matrix, x + dx, y, z); else dr.object.matrix.fill(0);
        dr.hidden = !on;
      }
    }
  }
  function poseLit(t) {
    lit.clear();
    if (!moons) return;
    const O = spireObjs(), ms = t * 1000, on = (O.lit ?? []).filter((q) => ms >= q.from && ms < q.until);
    if (on.length) for (const st of steps) if (st.s.kind === 'moon' && st.spec.h === O.h && on.some((q) => egInShape(q.s, st.s.x, st.s.z))) lit.add(st);
  }

  function pose(st, t) {
    const s = st.s;
    st.was[0] = st.T[0]; st.was[1] = st.T[1]; st.was[2] = st.T[2];
    st.wasSolid = st.solid;
    const at = egPieceAt(s, t, _at);
    const [x, y, z] = realmToDungeon(st.spec.x0 + s.x + at.dx, s.y, s.z + at.dz);
    let solid = at.solid || lit.has(st), drop = 0;
    let mine = -1;
    if (EG_CRUMBLE_KINDS.includes(s.kind) && st.touched != null) {
      const since = t - st.touched, wait = st.wait;
      if (since >= wait + SD_CRUMBLE_BACK && since < wait + SD_CRUMBLE_BACK + 1) { st.back = st.touched + wait + SD_CRUMBLE_BACK; play3(SD_STEPS_SOUNDS.clack, [x, y, z], 0.7, 2.6); }
      if (since < 0 || since >= wait + SD_CRUMBLE_BACK) st.touched = null;
      else { mine = since; if (since >= wait) { const f = since - wait; drop = 0.5 * SD_CRUMBLE_FALL_G * f * f; solid = false; } }
    }
    let sunk = 0;
    if (s.kind === 'sink' && st.touched != null) {
      const since = t - st.touched, goneAt = EG_SINK_GONE_M / EG_SINK_MPS;
      if (since < 0 || since >= goneAt + SD_CRUMBLE_BACK) st.touched = null;
      else if (since >= goneAt) { solid = false; drop = 40; }
      else sunk = EG_SINK_MPS * since;
    }
    st.solid = solid;
    st.T[0] = x; st.T[2] = z; st.T[1] = solid ? y - sunk : EG_STEP_GONE_Y;
    if (st.draw) {
      const seen = s.kind === 'beat' || s.kind === 'moon' ? solid : drop < 30;
      if (seen) translate(st.draw.object.matrix, x, y - drop - sunk, z); else st.draw.object.matrix.fill(0);
      st.draw.hidden = !seen;
    }
    if (st.pend) { const w = egPendAt(s, t); const [px, py, pz] = realmToDungeon(st.spec.x0 + w.x, s.y, w.z); translate(st.pend.object.matrix, px, py, pz); }
    if (s.kind === 'beat') beatLook(st, t, x, y, z, solid);
    else if (st.stages) crumbleLook(st, t, x, y, z, mine, solid, drop);
    else if (st.hang) hangLook(st, at.dx);
  }

  function wallSafe(p, t) {
    const [rx, , rz] = dungeonToRealm(p[0], p[1], p[2]);
    const ts = specs.find((q) => q.tube && Math.abs(rx - q.x0 - q.tube.x) <= 40 && rz <= q.tube.z1 + 1 && rz >= -10);
    if (ts) {
      const edge = tubeEdgeOf(ts, t);
      if (Number.isFinite(edge) && rz <= edge + 0.5) { const ahead = tubes.find((g) => g.spec === ts && g.z0 >= edge); if (ahead) return realmToDungeon(ts.x0 + ts.tube.x, ts.tube.y, (ahead.z0 + ahead.z1) / 2); }
    }
    const lost = isles.find((g) => g.st !== 0 && Math.hypot(rx - g.spec.x0 - g.d.x, rz - g.d.z) <= g.d.r + 0.5);
    if (lost) {
      let best = null, bd = Infinity;
      for (const g of isles) if (g.spec === lost.spec && g.st === 0) { const dd = Math.hypot(rx - g.spec.x0 - g.d.x, rz - g.d.z); if (dd < bd) { bd = dd; best = g; } }
      if (best) return realmToDungeon(best.spec.x0 + best.d.x, best.d.y, best.d.z);
    }
    const spec = specs.find((q) => q.variant === 'fallingwall' && q.walk && Math.abs(rx - q.x0 - q.walk.x) <= q.walk.halfW + 1 && rz >= q.walk.z0 - 1 && rz <= q.walk.z1 + 1);
    if (!spec) return p;
    const edge = fallenOf(spec, t);
    if (rz > edge + 0.5) return p;
    const ahead = walls.find((g) => g.spec === spec && g.z1 > edge && g.z0 >= edge);
    return ahead ? realmToDungeon(spec.x0 + spec.walk.x, 0, (ahead.z0 + ahead.z1) / 2) : p;
  }
  return {
    stand({ dynamicDraws, collider = null }) {
      if (draws) return false;
      draws = dynamicDraws;
      col = collider;
      ensureSdStepsArt(renderer);
      if (steps.some((st) => EG_CRUMBLE_KINDS.includes(st.s.kind))) egPieceTellUp(renderer, band, { crumble: true });
      batch = renderer?.createMesh && renderer?.updateMeshVertices ? createEgPieceBatch({ renderer }) : null;
      for (const st of steps) {
        if (st.s.kind === 'slag') continue;
        st.draw = EG_CRUMBLE_KINDS.includes(st.s.kind) ? place('slab', 'crumble', () => crumbleSet.rest) : place(kindOf(st.s), `piece:${st.key}`, () => modelOf(st));
        if (st.s.kind === 'pend') st.pend = place('mover', 'pend', () => egPendModel());
        standTells(st);
        const { positions, indices } = trisOf(st.s);
        try { collider?.addMesh?.(st.key, positions, indices, identity(), () => st.T); } catch (e) { console.warn('[eg] a step\'s collider', e?.message ?? e); }
      }
      for (const g of slags) {
        g.crust = place('mover', `slagc:${g.s.w}x${g.s.d}`, () => egSlagCrustModel(g.s.w, g.s.d));
        g.molten = place('mover', `slagm:${g.s.w}x${g.s.d}`, () => egSlagMoltenModel(g.s.w, g.s.d));
        const { positions, indices } = egSlabTris(g.s.w, g.s.d);
        try { collider?.addMesh?.(g.key, positions, indices, identity(), () => g.T); } catch (e) { console.warn('[eg] a slag crust\'s collider', e?.message ?? e); }
      }
      for (const g of tubes) {
        g.draw = place('tube', `tube:${g.key}`, () => egPieceModel(band, egSegmentPlan('tube', g.w, g.d, { seed: egPieceSeed(seed, c, g.spec.h, 1000 + g.k), lite })));
        g.lid = place('tube', `lid:${g.w}x${g.d}:${g.spec.h}`, () => egTubeLidModel(band, g.w, g.d, (g.spec.caves.find((q) => q.z0 <= g.z0 && q.z1 >= g.z1)?.height ?? 5.2)));
        const { positions, indices } = egSlabTris(g.w, g.d);
        try { collider?.addMesh?.(g.key, positions, indices, identity(), () => g.T); } catch (e) { console.warn('[eg] a tube segment\'s collider', e?.message ?? e); }
      }
      for (const g of isles) {
        const model = egIsleModel(band, g.d.r, { lite }), P = realmToDungeon(g.spec.x0 + g.d.x, g.d.y, g.d.z);
        for (let k = 0; k < model.positions.length; k += 3) { model.positions[k] += P[0]; model.positions[k + 1] += P[1]; model.positions[k + 2] += P[2]; }
        const gpu = make(model);
        if (gpu) { meshes.set(g.key, gpu); g.draw = { gpu, object: { matrix: identity() }, noShadow: true, texRemap: null, sphere: meshKitBounds(model.positions) }; draws.push(g.draw); }
        const tris = [];
        for (let k = 0; k < SD_ISLAND_SIDES; k++) {
          const a0 = (k / SD_ISLAND_SIDES) * Math.PI * 2, a1 = ((k + 1) / SD_ISLAND_SIDES) * Math.PI * 2;
          tris.push(...realmToDungeon(g.spec.x0 + g.d.x, g.d.y, g.d.z), ...realmToDungeon(g.spec.x0 + g.d.x + Math.cos(a1) * g.d.r, g.d.y, g.d.z + Math.sin(a1) * g.d.r), ...realmToDungeon(g.spec.x0 + g.d.x + Math.cos(a0) * g.d.r, g.d.y, g.d.z + Math.sin(a0) * g.d.r));
        }
        const positions = new Float32Array(tris), indices = new Uint16Array(positions.length / 3);
        for (let k = 0; k < indices.length; k++) indices[k] = k;
        try { collider?.addMesh?.(g.key, positions, indices, identity(), () => g.T); } catch (e) { console.warn('[eg] an island\'s collider', e?.message ?? e); }
      }
      for (const g of seals) {
        const { model, tris } = sealParts(g.door, g.side, g.a.y + 0, g.along);
        const gpu = make(model);
        if (gpu) { meshes.set(g.key, gpu); g.draw = { gpu, object: { matrix: identity() }, noShadow: true, texRemap: null, sphere: meshKitBounds(model.positions) }; draws.push(g.draw); }
        const indices = new Uint16Array(tris.length / 3);
        for (let k = 0; k < indices.length; k++) indices[k] = k;
        try { collider?.addMesh?.(g.key, tris, indices, identity(), () => g.T); } catch (e) { console.warn('[eg] a false wall\'s collider', e?.message ?? e); }
      }
      const list = [...orrery.stand({ renderer, collider })];
      for (const spec of specs) {
        for (const e of spec.engines ?? []) { const c = realmToDungeon(spec.x0 + e.x, e.y + 1.0, e.z); list.push({ key: `egengine:${spec.h}:${e.i}`, aabb: { min: [c[0] - 0.6, c[1] - 1.0, c[2] - 0.6], max: [c[0] + 0.6, c[1] + 1.0, c[2] + 0.6] }, distance: RAY_DISTANCE, reach: DEFAULT_ACTIVATION_DISTANCE }); }
      }
      targetList = list;
      for (const g of walls) {
        g.draw = place('wall', `wall:${g.key}`, () => egPieceModel(band, egSegmentPlan('wall', g.w, g.d, { seed: egPieceSeed(seed, c, g.spec.h, 2000 + g.k), lite })));
        const { positions, indices } = egSlabTris(g.w, g.d);
        try { collider?.addMesh?.(g.key, positions, indices, identity(), () => g.T); } catch (e) { console.warn('[eg] a wall segment\'s collider', e?.message ?? e); }
      }
      for (const g of stones) {
        g.lit = place('stone', 'stone', () => buildWaystoneModel()); g.dark = place('stone', 'stone:dark', () => darkStone());
        for (const d of [g.lit, g.dark]) if (d) { translate(d.object.matrix, g.at[0], g.at[1], g.at[2]); d.hidden = true; }
      }
      for (const v of vanes) { v.draw = place('vane', 'vane', () => buildVaneModel(null), { turns: true }); if (v.draw) yawAbout(v.draw.object.matrix, 0, v.at[0], v.at[1], v.at[2]); }
      access = egAccessNow();
      if (beatKinds.size) tellMaps();
      batch?.build(draws);
      return true;
    },
    // Call each frame before the dungeon's draws.
    cull(proj, view) {
      if (!draws) return 0;
      let planes = null;
      if (proj && view) { mul4(_vp, proj, view); planes = spherePlanes(_vp, _planes); }
      for (const list of [isles, seals]) for (const g of list) {
        const d = g.draw;
        if (!d?.sphere) continue;
        const M = d.object.matrix, c = d.sphere.centre;
        d.culled = !!planes && !sphereInPlanes(planes, c[0] + M[12], c[1] + M[13], c[2] + M[14], d.sphere.r + EG_BATCH_CULL_PAD);
      }
      return batch ? batch.cull(planes) : 0;
    },
    batchStats: () => batch?.stats() ?? null,
    /**
     * Call once a frame, before the motor.
     * @returns {number[] | null}
     */
    ride(t, dt, body = null, live = true) {
      if (!draws) return null;
      const key = body?.grounded && typeof body.groundKey === 'string' ? body.groundKey : null;
      const on = key ? byKey.get(key) ?? null : null;
      if (on && live && (EG_CRUMBLE_KINDS.includes(on.s.kind) || on.s.kind === 'sink') && on.touched == null) { on.touched = t; on.wait = SD_CRUMBLE_DELAY + spireCrumbleWait(); if (on.s.kind !== 'sink') play3(SD_STEPS_SOUNDS.grind, [on.T[0], on.T[1], on.T[2]], 1, 1.3); }
      lastT = t; access = egAccessNow();
      if (live && body?.pos) aimGhosts(dungeonToRealm(body.pos[0], body.pos[1], body.pos[2])[0]);
      poseLit(t);
      posePlanks(t);
      for (const st of steps) pose(st, t);
      beatFrames(t);
      poseMarks(t);
      orrery.frame(dt);
      poseSlags(t);
      poseWalls(t);
      poseTubes(t);
      poseIsles(t);
      poseSeals();
      if (on && on.solid && on.wasSolid) {
        const dx = on.T[0] - on.was[0], dy = on.T[1] - on.was[1], dz = on.T[2] - on.was[2];
        if (dx || dy || dz) body.carryBy?.(dx, dy, dz);
      }
      overDrop = false;
      if (!live || !body?.pos) return null;
      const [rx, ry, rz] = dungeonToRealm(body.pos[0], body.pos[1], body.pos[2]);
      const voided = intoVoid(rx, ry, rz, !!body.grounded);
      if (!body.grounded) { const hs = specs.find((q) => Math.abs(rx - q.x0) <= ((q.law ?? 0) >= 9 ? 160 : 40)); overDrop = !!hs && egOverDrop(hs, rx - hs.x0, ry, rz); }
      const footing = spireFooting();
      if (dt > 0 && footing < 1) {
        const g = gusts.find((q) => Math.abs(rx - q.spec.x0 - q.x) <= EG_GUST_REACH_M && rz >= q.z0 && rz <= q.z1 && egGustStorey(q, ry));
        if (g) { gustAt(t, _gust); if (_gust.push) body.collider?.move?.(body.pos, _gust.push * (1 - footing) * Math.min(dt, EG_GUST_DT_MAX), 0, 0, body.height, !!body.grounded && !body.jumping); }
      }
      const heard = gusts.find((q) => Math.abs(rx - q.spec.x0 - ((q.spec.law ?? 0) >= 9 ? q.x : 0)) <= 40 && rz >= q.h0 && rz <= q.h1);
      if (heard && gustAt(t, _gust).warn && lastWarned !== Math.floor(t / SD_GUST_EVERY)) { lastWarned = Math.floor(t / SD_GUST_EVERY); play(SD_STEPS_SOUNDS.moan, 0.9); play(SD_STEPS_SOUNDS.clack, 0.45, 2.2); }
      if (dt > 0 && key === EG_FLOOR_KEY && body.grounded) {
        const bt = belts.find((q) => Math.abs(rx - q.spec.x0 - q.w.x) <= q.w.halfW && rz >= q.w.z0 && rz <= q.w.z1);
        if (bt) body.collider?.move?.(body.pos, 0, 0, -EG_BELT_MPS * Math.min(dt, EG_GUST_DT_MAX), body.height, true);
      }
      if (footing < 1) {
        for (const st of steps) {
          if (st.s.kind !== 'pend' || Math.abs(rx - st.spec.x0 - st.s.x) > 6) continue;
          if (egPendHits(st.s, t, rx - st.spec.x0, ry, rz, body.height) && safe) { play(107, 0.7, 0.8); return [safe[0], safe[1] + 0.2, safe[2]]; }
        }
      }
      // Check the void before the cast-back point updates below, or a landing past the void becomes the new
      // cast-back point.
      if (voided && safe) { play(107, 0.6, 0.6); const p = wallSafe(safe, t); return [p[0], p[1] + 0.2, p[2]]; }
      const onWall = key ? walls.find((g) => g.key === key) ?? tubes.find((g) => g.key === key) ?? isles.find((g) => g.key === key && g.st === 0) : null;
      if (key === EG_FLOOR_KEY || onWall || (on && on.solid && (on.s.kind === 'still' || on.s.kind === 'ledge' || on.s.kind === 'drop' || on.s.kind === 'vent' || on.s.kind === 'gust'))) { safe = [body.pos[0], body.pos[1], body.pos[2]]; safeY = body.pos[1]; litStone = stoneOf(safe); }
      if (safe && body.pos[1] < safeY + EG_VOID_Y) { play(107, 0.6, 0.6); const p = wallSafe(safe, t); return [p[0], p[1] + 0.2, p[2]]; }
      return null;
    },
    safe: () => safe,
    overDrop: () => overDrop,
    // A given landing resets the void memory so it never reads as a fall.
    setSafe(p) { safe = p ? [p[0], p[1], p[2]] : null; safeY = p ? p[1] : 0; litStone = stoneOf(safe); voidHas = false; voidFall.v = null; voidFromY = NaN; },
    peerOn(x, y, z) {
      if (!draws || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
      const [rx, ry, rz] = dungeonToRealm(x, y, z);
      for (const st of ghostSteps) {
        if (!EG_CRUMBLE_KINDS.includes(st.s.kind) || st.solid || st.touched == null) continue;
        const s = st.s, dy = ry - s.y;
        if (Math.abs(rx - st.spec.x0 - s.x) <= s.w / 2 + EG_BODY_R && Math.abs(rz - s.z) <= s.d / 2 + EG_BODY_R && dy >= -EG_RIDE_DOWN_M && dy <= EG_RIDE_UP_M) { st.peerAt = lastT; return true; }
      }
      return false;
    },
    // A true result means GL state changed, and the caller must call `renderer.markForeignPass()`.
    drawPass(proj, view, fog = null) {
      if (!draws || !renderer?.gl || !ghostSteps.length) return false;
      pass ??= passOf?.(true) ?? null;
      if (!pass) return false;
      const vp = renderer._worldViewportPx;
      return pass.draw(proj, view, ghostStep, ghostState, fog, renderer.lightingLane ? SD_SKY_STEPS.lane : SD_SKY_STEPS.classic, vp?.[2] ?? 0, vp?.[3] ?? 0, egGhostRgb(access?.palette));
    },
    get ghosts() { return { step: ghostStep, state: ghostState, of: ghostSteps.map((st) => ({ h: st.spec.h, i: st.s.i, kind: st.s.kind })) }; },
    get slots() { return steps.map((st) => ({ h: st.spec.h, i: st.s.i, kind: st.s.kind, draw: st.draw, stages: st.stages, chunks: st.chunks, grit: st.grit, hang: st.hang, pivot: st.pivot })); },
    get orrery() { return orrery.stones; },
    get marks() { return { beats: [...beatKinds.entries()].map(([k, B]) => ({ kind: k, map: B.map ?? null })), stones: stones.map((g) => ({ h: g.spec.h, x: g.isl.x, z: g.isl.z, lit: g.lit, dark: g.dark })), litStone: litStone ? { h: litStone.spec.h, x: litStone.isl.x, z: litStone.isl.z } : null, vanes: vanes.map((v) => v.draw) }; },
    targets: () => (draws ? targetList : []),
    press(key) { return typeof key === 'string' && (key.startsWith('egstone:') || key.startsWith('egengine:')) ? (spireAct(key), true) : false; },
    hoverName(key) {
      if (typeof key !== 'string') return null;
      const st = /^egstone:\d+:(\d):([fb])$/.exec(key);
      if (st) { const j = Number(st[1]), h = spireObjs().orr?.[j]; return { title: `${spireStoneName(j)} - ${SD_STONES[j]?.sign ?? ''}`, subs: [...(Number.isFinite(h) ? [SD_HALL_TEXT.hour(h)] : []), st[2] === 'f' ? 'Turn it forward an hour' : 'Turn it back an hour'] }; }
      const en = /^egengine:(\d+):(\d+)$/.exec(key);
      if (en) { const spec = specs.find((q) => q.h === Number(en[1])), e = spec?.engines?.[Number(en[2])], E = e ? EG_ENGINES[e.kind] : null; if (E) return { title: E.name.charAt(0).toUpperCase() + E.name.slice(1), subs: [E.what, E.once ? 'Work it' : 'Work it once every 30 seconds'] }; }
      return null;
    },
    get tubes() { return tubes.map((g) => ({ h: g.spec.h, k: g.k, z0: g.z0, z1: g.z1, key: g.key, gone: g.T[1] === EG_STEP_GONE_Y })); },
    get isles() { return isles.map((g) => ({ h: g.spec.h, x: g.d.x, z: g.d.z, key: g.key, st: g.st, gone: g.T[1] === EG_STEP_GONE_Y })); },
    get seals() { return seals.map((g) => ({ h: g.spec.h, i: g.a.i, key: g.key, up: g.up })); },
    get steps() { return steps.map((st) => ({ h: st.spec.h, i: st.s.i, kind: st.s.kind, key: st.key, T: [...st.T], solid: st.solid })); },
    get slags() { return slags.map((g) => ({ h: g.spec.h, i: g.s.i, k: g.k, key: g.key, state: g.state, up: g.T[1] !== EG_STEP_GONE_Y, T: [...g.T] })); },
    get planks() { return [...planks.values()].map((P) => ({ key: P.key, g: P.q.g, br: P.br, T: [...P.T], holds: P.T[1] !== EG_STEP_GONE_Y, drawn: !!P.draw && !P.draw.hidden, grow: P.draw?.object.matrix[10] ?? 0 })); },
    get lit() { return [...lit].map((st) => ({ h: st.spec.h, i: st.s.i })); },
    get walls() { return walls.map((g) => ({ h: g.spec.h, k: g.k, z0: g.z0, z1: g.z1, key: g.key, T: [...g.T], gone: g.T[1] === EG_STEP_GONE_Y })); },
    clear() {
      for (const m of meshes.values()) if (m) { try { renderer?.destroyMesh?.(m); } catch { } }
      meshes.clear();
      batch?.clear(); batch = null;
      models.clear();
      try { pass?.destroy(); } catch { }
      pass = null; passOf = ghostsDoor();
      plainOf.clear(); beatKinds.clear();
      ghostState.fill(0);
      for (const g of stones) { g.lit = null; g.dark = null; }
      for (const v of vanes) v.draw = null;
      orrery.clear();
      litStone = null;
      for (const st of steps) { st.draw = null; st.pend = null; st.stages = null; st.chunks = null; st.grit = null; st.hang = null; }
      for (const g of walls) g.draw = null;
      for (const g of tubes) { g.draw = null; g.lid = null; }
      for (const g of isles) g.draw = null;
      for (const g of seals) g.draw = null;
      for (const g of slags) { g.crust = null; g.molten = null; }
      lit.clear();
      for (const P of [...planks.values()]) dropPlank(P);
      col = null;
      targetList = [];
      draws = null; safe = null;
      voidHas = false; voidFall.v = null; voidFromY = NaN;
    },
  };
}
