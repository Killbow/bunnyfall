// @ts-check
import { orreryOf, SD_ORRERY, SD_STONES, SD_STONE_SETTLE_MS, SD_FRAY_MAX, stoneInReach, dungeonToRealm, realmToDungeon, sdHour, sdHourWord } from '../net/sdBrain.js';
import { SD_REALM_ARCHIVE, SD_REALM_BRASS_RECORD } from '../world/sdRealm.js';
import { hallArt, gemGlow, SD_HALL_GLOW_RECORD, SD_HALL_GOLD_DIM_RECORD, SD_HALL_EMBER_DIM_RECORD, SD_HALL_GEM_RECORD, SD_HALL_FLASH_RECORD, SD_FLASH_COLOR } from '../world/sdHallArt.js';
import {
  buildHallModel, buildHandModel, buildLitModel, buildFrayModel, buildBridgeModel, buildBridgePlateModel, buildBezelModel, buildCrownGearModel,
  buildBannerModel, buildBandModel, bannerPose, bandMatrix, plateMatrix, crownGearMatrix, hallFloorTris, hallSolidTris, handMatrix, handleBox, plaqueBox,
  dialCentre, beforeStone, stonePoint, SD_LIT_RECORD, SD_PLAQUE, SD_FRAY_RING, SD_BRIDGE_PLATES, SD_BANNER, SD_BANNER_VERTS, SD_DIAL, SD_BEZEL, SD_STONE_SIZE,
} from '../world/sdHall.js';
import { buildOrbitRing, buildOrreryHub, ringHang, ringPoseInto, ringMatrix, hubMatrix, ringTicks, gemCentre, SD_RING_SNAP_S, SD_ORRERY_RINGS } from '../world/sdOrreryModel.js';
import { isTouchDevice } from '../ui/touchDevice.js';
import { SD_LIGHT } from '../world/sdLook.js';
import { identity } from '../world/mat4.js';
import { RAY_DISTANCE, DEFAULT_ACTIVATION_DISTANCE } from '../player/activate.js';
import { t } from '../ui/textManager.js';

export const SD_HALL_TEXT = Object.freeze({
  forward: 'Turn it forward',
  back: 'Turn it back',
  closer: 'Stand closer to the stone.',
  front: 'Stand before the stone\'s face.',
  still: 'The Concord holds. The stones will not turn again.',
  held: 'The Concord holds.',
  snap: 'The Hour snaps back.',
  concord: 'The Concord! A bridge of light opens.',
  plaque: (k) => `Ledger Plaque ${['I', 'II', 'III', 'IV', 'V', 'VI'][k]}`,
  hour: (h) => `Its hand stands at the ${sdHourWord(h)} hour.`,
  lastBy: (name) => t('sd.hall.lastBy', 'Last turned by {name}', { name }),
  get you() { return t('sd.hall.you', 'you'); },
  snapLashes: (names, more) => (more > 0 ? t('sd.hall.snapLashesMore', 'The Hour snaps back. No help came from {names} and {more, plural, one {# other} other {# others}}.', { names, more })
    : t('sd.hall.snapLashes', 'The Hour snaps back. No help came from {names}.', { names })),
});
export const SD_LASH_NAMED = 5;
/**
 * @param {any} w
 * @param {(id: string) => (string|null)} nameOf
 * @param {string|null} [me]
 */
export function sdHallNamed(w, nameOf, me = null) {
  if (!w || typeof w !== 'object') return w;
  const name = (id) => (typeof id !== 'string' || !id ? null : id === me ? SD_HALL_TEXT.you : (nameOf?.(id) ?? null));
  const by = name(w.id);
  const lsn = Array.isArray(w.ls) ? w.ls.map(name).filter(Boolean) : null;
  return { ...w, ...(by ? { by } : {}), ...(lsn ? { lsn } : {}) };
}
export function sdSnapLine(w) {
  const lsn = Array.isArray(w?.lsn) ? w.lsn : [];
  if (!lsn.length) return SD_HALL_TEXT.snap;
  return SD_HALL_TEXT.snapLashes(lsn.slice(0, SD_LASH_NAMED).join(', '), Math.max(0, lsn.length - SD_LASH_NAMED));
}
export const SD_BRIDGE_LAY_MS = 900;
export const SD_CONCORD_MS = Object.freeze({ rings: 1200, bandFrom: 200, band: 1000, flare: 1200, bridgeFrom: 1200 });
export const sdStoneKey = (i, a) => `sdstone:${i}:${a > 0 ? 'f' : 'b'}`;
export const sdPlaqueKey = (k) => `sdplaque:${k}`;
export const SD_HAND_RATE = 3;
export const SD_SNAP_RATE = 9;
export const SD_FRAY_FULL_MS = 1500;
// `SD_FRAY_PULSE_HZ` must stay under the 3 Hz flash limit for photosensitive players.
export const SD_BEZEL_MS = Object.freeze({ gold: 0.65, ember: 1000, mine: 3000 });
export const SD_DIAL_FLASH_MS = 250;
export const SD_DIAL_DIM_MS = 600;
export const SD_FRAY_PULSE_HZ = 2;
export const SD_RING_LITE_SEGS = 32;
export const SD_BANNER_LITE_KEYS = 3;
export const SD_GEM_LIGHT = Object.freeze({ range: 14, gain: 1 });
// Record indices in `DAGGER.SND`: metal clunk 433, low bell 107, and enchanter chime 364.
export const SD_HALL_SOUNDS = Object.freeze({ clunk: 433, toll: 107, chime: 364 });
const ZERO = new Float32Array(16);
const NONE = Object.freeze([]);
const key = (rec) => `${SD_REALM_ARCHIVE}_${rec}`;
const REMAP = Object.freeze({
  gold: new Map([[key(SD_REALM_BRASS_RECORD), key(SD_HALL_GLOW_RECORD.brass)]]),
  dim: new Map([[key(SD_REALM_BRASS_RECORD), key(SD_HALL_GOLD_DIM_RECORD)]]),
  ember: new Map([[key(SD_REALM_BRASS_RECORD), key(SD_HALL_GLOW_RECORD.fray)]]),
  pulse: new Map([[key(SD_HALL_EMBER_DIM_RECORD), key(SD_REALM_BRASS_RECORD)]]),
  litDim: new Map([[key(SD_LIT_RECORD), key(SD_HALL_GEM_RECORD + 2)]]),
  flare: new Map([[key(SD_HALL_GEM_RECORD), key(SD_HALL_FLASH_RECORD)]]),
  gem: Object.freeze([0, 1, 2, 3, 4, 5, 6].map((n) => (n === 0 ? null : new Map([[key(SD_HALL_GEM_RECORD), key(SD_HALL_GEM_RECORD + n)]])))),
});
export { REMAP as SD_HALL_REMAP };

const _uploaded = new WeakSet();
// Upload emission with `white: true`, or the renderer treats it as a window mask and the dungeon tints it by the
// day window color.
export function ensureSdHallArt(renderer) {
  if (!renderer || _uploaded.has(renderer) || typeof renderer.uploadTexture !== 'function') return;
  _uploaded.add(renderer);
  for (const [rec, art] of hallArt()) { renderer.uploadTexture(SD_REALM_ARCHIVE, rec, art.albedo); renderer.uploadEmissionTexture?.(SD_REALM_ARCHIVE, rec, art.emission, { white: true }); }
}

const way = (from, to) => ((((to - from) % 12) + 18) % 12) - 6;
export { way as sdHandWay };

/** @param {{ renderer?: any, audio?: any, s: number, now?: () => number, clock?: () => number, onTurn?: (i: number, a: number) => boolean, say?: (t: string) => void, lite?: boolean }} deps */
export function createSdHall({ renderer = null, audio = null, s, now = () => performance.now(), clock = null, onTurn = () => false, say = () => {}, lite = isTouchDevice() }) {
  const o = orreryOf(s);
  const clockNow = clock ?? (() => now() / 1000);
  /** @type {any[]} */
  let draws = null;
  let hallMesh = null, handMesh = null, bridgeMesh = null, litMesh = null, frayMesh = null;
  let gearMesh = null, bannerMesh = null, hubMesh = null, flashMesh = null, bandMesh = null;
  const bezelMeshes = [], ringMeshes = [], plateMeshes = [];
  const hands = [], gears = [], bezels = [], rings = [], plates = [];
  let litDraw = null, frayDraw = null, bridgeDraw = null, bannerDraw = null, hubDraw = null, flashDraw = null, bandDraw = null;
  let word = null, heard = false;
  const shown = o ? [...o.start] : [], want = o ? [...o.start] : [];
  const lastTurn = SD_STONES.map(() => -Infinity);
  const lastBy = SD_STONES.map(() => '');
  let lit = 0, fray = 0, ok = false, rate = SD_HAND_RATE;
  const feet = [0, 0, 0];
  let hasFeet = false, targetList = NONE, frayWant = 0, frayFullUntil = -Infinity;
  const tabs = o?.fray ?? SD_FRAY_MAX, hang = ringHang(s), pose = new Float64Array(2), ringState = new Float64Array(4);
  let frayWarn = false, snapAt = -Infinity, concordAt = -Infinity, concordDone = true, tocked = true, bannerLive = false, bannerKey = -1;
  let laid = false;
  let pressedStone = -1, pressedAt = -Infinity, flashUntil = -Infinity, dimUntil = -Infinity;
  const emberUntil = SD_STONES.map(() => -Infinity);
  const bannerPos = new Float32Array(SD_BANNER_VERTS * 3), bannerNrm = new Float32Array(SD_BANNER_VERTS * 3);
  const GEM_AT = gemCentre(), _light = { x: GEM_AT[0], y: GEM_AT[1], z: GEM_AT[2], range: SD_GEM_LIGHT.range, color: [0, 0, 0] }, _lights = [_light];
  const _gemHalo = { at: GEM_AT, size: 0.9, color: [0, 0, 0] }, _bezelHalos = SD_STONES.map((_, i) => ({ at: realmToDungeon(...stonePoint(i, 0, SD_DIAL.y, SD_BEZEL.o1 - SD_STONE_SIZE.d / 2)), size: 0.7, color: [0, 0, 0] })), _halos = [];

  const make = (model) => { if (!model || !renderer?.createMesh) return null; try { return renderer.createMesh(model); } catch (e) { console.warn('[sd] the hall would not build', e?.message ?? e); return null; } };
  const drop = (mesh) => { if (mesh) { try { renderer?.destroyMesh?.(mesh); } catch { } } };
  const play = (rec, at, vol, pitch) => { try { audio?.play3d?.(rec, at, vol, { maxDistance: 40, pitch }); } catch { } };
  // Moving draws set `noShadow`, because a moving caster forces the point-light shadow cubes to rebuild.
  const drawOf = (gpu, matrix = identity(), hidden = false) => ({ gpu, object: { matrix }, noShadow: true, texRemap: null, hidden });
  const swap = (draw, mesh) => {
    if (!draws) return null;
    if (draw) { const at = draws.indexOf(draw); if (at >= 0) draws.splice(at, 1); }
    if (!mesh) return null;
    const d = drawOf(mesh);
    draws.push(d);
    return d;
  };
  const setLit = (n) => { if (n === lit && (litDraw || n === 0)) return; lit = n; const old = litMesh; litMesh = make(buildLitModel(n)); litDraw = swap(litDraw, litMesh); drop(old); };
  const frayArc = (f) => Math.max(0, Math.min(tabs, Math.round(f)));
  let blazing = false;
  const setFray = (f, blaze = false) => {
    const warn = !blaze && f >= tabs - 8;
    if (f === fray && blaze === blazing && warn === frayWarn && (frayDraw || (f === 0 && !warn))) return;
    fray = f; blazing = blaze; frayWarn = warn;
    const old = frayMesh; frayMesh = make(buildFrayModel(f, tabs, { blaze })); frayDraw = swap(frayDraw, frayMesh); drop(old);
  };
  const poseGear = (i) => { if (gears[i]) crownGearMatrix(i, shown[i], gears[i].object.matrix); };
  function concordWhole() {
    concordDone = true; tocked = true; laid = true;
    if (bannerMesh && renderer?.updateMeshVertices) { bannerPose(SD_BANNER.wind, bannerPos, bannerNrm); renderer.updateMeshVertices(bannerMesh, bannerPos, bannerNrm); }
    bannerLive = false;
    if (bandDraw) { bandDraw.hidden = false; bandDraw.object.matrix = identity(); }
    for (const p of plates) p.hidden = true;
    if (bridgeDraw) { bridgeDraw.object.matrix = identity(); bridgeDraw.hidden = false; }
  }

  function hear(w) {
    const first = !heard;
    heard = true;
    for (let i = 0; i < want.length; i++) want[i] = w.st[i];
    // The first word puts each hand straight at its hour instead of turning it there, since a hand at rest is never
    // posed again.
    if (first) for (let i = 0; i < want.length; i++) { shown[i] = want[i]; if (hands[i]) handMatrix(i, shown[i], hands[i].object.matrix); }
    if (first) for (let i = 0; i < want.length; i++) poseGear(i);
    rate = w.x ? SD_SNAP_RATE : SD_HAND_RATE;
    if (!first && w.i != null && o) {
      lastTurn[w.i] = now();
      lastBy[w.i] = typeof w.by === 'string' ? w.by : '';
      play(SD_HALL_SOUNDS.clunk, dialCentre(w.i), 1, w.a > 0 ? 1 : 0.85);
      for (let j = 0; j < SD_STONES.length; j++) if (j !== w.i && o.gear[w.i][j] !== 0) play(SD_HALL_SOUNDS.clunk, dialCentre(j), 0.4, 1.25);
    }
    if (!first && w.x) { play(SD_HALL_SOUNDS.toll, dialCentre(0), 1, 0.5); snapAt = now(); }
    if (!first && w.w === 1 && pressedStone >= 0 && now() - pressedAt < SD_BEZEL_MS.mine) emberUntil[pressedStone] = now() + SD_BEZEL_MS.ember;
    if (!first && !w.x && w.lit > lit) flashUntil = now() + SD_DIAL_FLASH_MS;
    if (!first && !w.x && w.lit < lit) { dimUntil = now() + SD_DIAL_DIM_MS; play(SD_HALL_SOUNDS.clunk, realmToDungeon(SD_ORRERY.x, 0.3, SD_ORRERY.z), 0.7, 0.6); }
    setLit(w.lit);
    frayWant = w.f;
    if (!first && w.x) { frayFullUntil = now() + SD_FRAY_FULL_MS; setFray(tabs, true); }
    else if (!(now() < frayFullUntil)) setFray(frayArc(w.f));
    if (w.ok && !ok) {
      ok = true;
      if (first) concordWhole();
      else { concordAt = now(); concordDone = false; tocked = false; bannerLive = !!bannerMesh; bannerKey = -1; laid = false; }
      if (!first) { play(SD_HALL_SOUNDS.chime, dialCentre(0), 1, 1); say(SD_HALL_TEXT.concord); }
    }
  }
  function concordStep(ms) {
    if (bannerLive) {
      const age = Math.min(ms / 1000, SD_BANNER.wind), key = lite ? Math.min(SD_BANNER_LITE_KEYS, Math.floor((age * SD_BANNER_LITE_KEYS) / SD_BANNER.wind)) : -1;
      if (!lite || key !== bannerKey) { bannerKey = key; bannerPose(lite && key < SD_BANNER_LITE_KEYS ? ((key + 0.5) * SD_BANNER.wind) / SD_BANNER_LITE_KEYS : age, bannerPos, bannerNrm); renderer?.updateMeshVertices?.(bannerMesh, bannerPos, bannerNrm); }
      if (ms >= SD_BANNER.wind * 1000) bannerLive = false;
    }
    if (bandDraw) { const k = (ms - SD_CONCORD_MS.bandFrom) / SD_CONCORD_MS.band; bandDraw.hidden = !(k > 0); if (k > 0) bandMatrix(k, bandDraw.object.matrix); }
    if (!tocked && ms >= SD_CONCORD_MS.rings) { tocked = true; play(SD_HALL_SOUNDS.clunk, GEM_AT, 1, 0.45); }
    const kb = (ms - SD_CONCORD_MS.bridgeFrom) / SD_BRIDGE_LAY_MS, n = SD_BRIDGE_PLATES.n;
    if (kb >= 1) {
      laid = true;
      for (const p of plates) p.hidden = true;
      if (bridgeDraw) { bridgeDraw.object.matrix = identity(); bridgeDraw.hidden = false; }
    } else for (let j = 0; j < plates.length; j++) {
      const kj = (kb - (j * 0.6) / (n - 1)) / 0.4;
      plates[j].hidden = !(kj > 0);
      if (kj > 0) plateMatrix(j, kj, plates[j].object.matrix);
    }
    if (kb >= 1 && !bannerLive && ms >= SD_CONCORD_MS.bandFrom + SD_CONCORD_MS.band) concordDone = true;
  }

  return {
    stand({ dynamicDraws, collider = null }) {
      if (draws || !o) return false;
      draws = dynamicDraws;
      ensureSdHallArt(renderer);
      hallMesh = make(buildHallModel());
      if (hallMesh) draws.push({ gpu: hallMesh, object: { matrix: identity() } });
      handMesh = make(buildHandModel());
      if (handMesh) for (let i = 0; i < SD_STONES.length; i++) { const d = drawOf(handMesh, handMatrix(i, shown[i])); hands.push(d); draws.push(d); }
      gearMesh = make(buildCrownGearModel());
      if (gearMesh) for (let i = 0; i < SD_STONES.length; i++) { const d = drawOf(gearMesh, crownGearMatrix(i, shown[i])); gears.push(d); draws.push(d); }
      for (let i = 0; i < SD_STONES.length; i++) { const m = make(buildBezelModel(i)); if (!m) continue; bezelMeshes.push(m); const d = drawOf(m); bezels[i] = d; draws.push(d); }
      bannerMesh = make(buildBannerModel());
      if (bannerMesh) { bannerDraw = drawOf(bannerMesh); draws.push(bannerDraw); }
      for (let k = 0; k < SD_STONES.length; k++) { const m = make(buildOrbitRing(k, lite ? SD_RING_LITE_SEGS : SD_ORRERY_RINGS.segs)); if (!m) continue; ringMeshes.push(m); const d = drawOf(m, new Float32Array(16)); rings[k] = d; draws.push(d); }
      hubMesh = make(buildOrreryHub());
      if (hubMesh) { hubDraw = drawOf(hubMesh, new Float32Array(16)); draws.push(hubDraw); }
      flashMesh = make(buildLitModel(SD_STONES.length, SD_HALL_FLASH_RECORD));
      if (flashMesh) { flashDraw = drawOf(flashMesh, identity(), true); draws.push(flashDraw); }
      bandMesh = make(buildBandModel());
      if (bandMesh) { bandDraw = drawOf(bandMesh, new Float32Array(16), true); draws.push(bandDraw); }
      for (let j = 0; j < SD_BRIDGE_PLATES.n; j++) { const m = make(buildBridgePlateModel(j)); if (!m) continue; plateMeshes.push(m); const d = drawOf(m, new Float32Array(16), true); plates.push(d); draws.push(d); }
      bridgeMesh = make(buildBridgeModel());
      if (bridgeMesh) { bridgeDraw = { gpu: bridgeMesh, object: { matrix: ok ? identity() : new Float32Array(ZERO) }, hidden: !ok, noShadow: true }; draws.push(bridgeDraw); }
      if (ok) concordWhole();
      const floors = hallFloorTris(), solids = hallSolidTris(), tris = new Float32Array(floors.length + solids.length);
      tris.set(floors);
      tris.set(solids, floors.length);
      const n = tris.length / 3, idx = new Uint16Array(n);
      for (let k = 0; k < n; k++) idx[k] = k;
      try { collider?.addMesh?.('sd:hall', tris, idx, identity()); } catch (e) { console.warn('[sd] the hall\'s floors', e?.message ?? e); }
      const list = [];
      for (let i = 0; i < SD_STONES.length; i++) for (const a of [1, -1]) list.push({ key: sdStoneKey(i, a), aabb: handleBox(i, a), distance: RAY_DISTANCE, reach: DEFAULT_ACTIVATION_DISTANCE });
      for (let k = 0; k < SD_PLAQUE.bearings.length; k++) list.push({ key: sdPlaqueKey(k), aabb: plaqueBox(k), distance: RAY_DISTANCE, reach: DEFAULT_ACTIVATION_DISTANCE });
      targetList = Object.freeze(list);
      return true;
    },
    frame(dt, pos, w) {
      hasFeet = !!pos;
      if (pos) { feet[0] = pos[0]; feet[1] = pos[1]; feet[2] = pos[2]; }
      if (w && w !== word && o && w.s === s && Array.isArray(w.st)) { word = w; hear(w); }
      if (frayFullUntil !== -Infinity && now() >= frayFullUntil) { frayFullUntil = -Infinity; setFray(frayArc(frayWant)); }
      if (!concordDone) concordStep(now() - concordAt);
      const step = Math.max(0, dt) * rate;
      for (let i = 0; i < hands.length; i++) {
        const d = way(shown[i], want[i]);
        if (d === 0) continue;
        shown[i] = Math.abs(d) <= step ? want[i] : sdHour(shown[i] + Math.sign(d) * step);
        handMatrix(i, shown[i], hands[i].object.matrix);
        poseGear(i);
      }
      const t = now();
      for (let i = 0; i < bezels.length; i++) {
        const b = bezels[i];
        if (!b) continue;
        const since = t - lastTurn[i], st = t < emberUntil[i] ? REMAP.ember : since < SD_STONE_SETTLE_MS * SD_BEZEL_MS.gold ? REMAP.gold : since < SD_STONE_SETTLE_MS ? REMAP.dim : null;
        if (b.texRemap !== st) b.texRemap = st;
      }
      const flashing = t < flashUntil;
      if (flashDraw) flashDraw.hidden = !flashing;
      if (litDraw) { litDraw.hidden = flashing && !!flashDraw; litDraw.texRemap = t < dimUntil ? REMAP.litDim : null; }
      if (frayDraw) frayDraw.texRemap = frayWarn && Math.floor((t / 1000) * SD_FRAY_PULSE_HZ * 2) % 2 === 1 ? REMAP.pulse : null;
      const cms = ok ? (concordAt === -Infinity ? Infinity : t - concordAt) : -1;
      if (hubDraw) { hubDraw.texRemap = cms >= SD_CONCORD_MS.bandFrom && cms < SD_CONCORD_MS.bandFrom + SD_CONCORD_MS.flare ? REMAP.flare : REMAP.gem[Math.max(0, Math.min(6, lit))]; hubMatrix(ringTicks(clockNow()) * 0.13, hubDraw.object.matrix); }
      if (rings.length) {
        ringState[0] = clockNow(); ringState[1] = frayFullUntil !== -Infinity ? 0 : fray / tabs;
        ringState[2] = snapAt === -Infinity ? -1 : (t - snapAt) / 1000; ringState[3] = cms < 0 ? -1 : cms / 1000;
        if (ringState[2] > SD_RING_SNAP_S) snapAt = -Infinity;
        for (let k = 0; k < rings.length; k++) if (rings[k]) { ringPoseInto(k, hang, ringState, pose); ringMatrix(k, hang, pose, rings[k].object.matrix); }
      }
    },
    targets() {
      return draws && o ? targetList : NONE;
    },
    hoverName(key) {
      if (!o || typeof key !== 'string') return null;
      const st = /^sdstone:([0-5]):([fb])$/.exec(key);
      if (st) { const i = Number(st[1]), stone = SD_STONES[i]; return { title: `${stone.name.charAt(0).toUpperCase()}${stone.name.slice(1)} - ${stone.sign}`, subs: [SD_HALL_TEXT.hour(want[i]), ok ? SD_HALL_TEXT.held : st[2] === 'f' ? SD_HALL_TEXT.forward : SD_HALL_TEXT.back, ...(lastBy[i] ? [SD_HALL_TEXT.lastBy(lastBy[i])] : [])] }; }
      const pl = /^sdplaque:([0-5])$/.exec(key);
      if (pl) { const k = Number(pl[1]); return { title: SD_HALL_TEXT.plaque(k), subs: [o.riddles[k].text] }; }
      return null;
    },
    press(key) {
      if (!o || typeof key !== 'string') return false;
      const pl = /^sdplaque:([0-5])$/.exec(key);
      if (pl) { say(o.riddles[Number(pl[1])].text); return true; }
      const st = /^sdstone:([0-5]):([fb])$/.exec(key);
      if (!st) return false;
      const i = Number(st[1]), a = st[2] === 'f' ? 1 : -1;
      if (ok) { say(SD_HALL_TEXT.still); return true; }
      const at = hasFeet ? dungeonToRealm(feet[0], feet[1], feet[2]) : null;
      if (!at || !stoneInReach(i, at[0], at[2])) { say(SD_HALL_TEXT.closer); return true; }
      if (!beforeStone(i, at[0], at[2])) { say(SD_HALL_TEXT.front); return true; }
      // The realm refuses a turn while the gear settles, so the press is dropped here instead of sent.
      if (now() - lastTurn[i] < SD_STONE_SETTLE_MS) return true;
      if (onTurn(i, a)) { pressedStone = i; pressedAt = now(); }
      return true;
    },
    lights() {
      if (!draws || !o) return NONE;
      const k = gemGlow(lit) * SD_GEM_LIGHT.gain;
      _light.color[0] = SD_LIGHT.mantella[0] * k; _light.color[1] = SD_LIGHT.mantella[1] * k; _light.color[2] = SD_LIGHT.mantella[2] * k;
      return _lights;
    },
    halos() {
      _halos.length = 0;
      if (!draws || !o) return _halos;
      const t = now(), cms = ok ? (concordAt === -Infinity ? Infinity : t - concordAt) : -1, flare = cms >= SD_CONCORD_MS.bandFrom && cms < SD_CONCORD_MS.bandFrom + SD_CONCORD_MS.flare;
      const k = flare ? 1 : gemGlow(lit) * 0.6;
      for (let c = 0; c < 3; c++) _gemHalo.color[c] = (flare ? SD_FLASH_COLOR[c] / 255 : SD_LIGHT.mantella[c]) * k;
      _halos.push(_gemHalo);
      for (let i = 0; i < bezels.length; i++) {
        const b = bezels[i];
        if (!b?.texRemap || b.texRemap === REMAP.dim) continue;
        const c = b.texRemap === REMAP.ember ? SD_LIGHT.ember : SD_LIGHT.gold, h = _bezelHalos[i];
        h.color[0] = c[0] * 0.4; h.color[1] = c[1] * 0.4; h.color[2] = c[2] * 0.4;
        _halos.push(h);
      }
      return _halos;
    },
    get concord() { return ok; },
    // The outer host opens the bridge floor only when this is true, so the floor never appears before the plates
    // are laid.
    get bridgeLaid() { return ok && laid; },
    get shown() { return [...shown]; },
    get counts() { return { lit, fray }; },
    get parts() { return { hands, gears, bezels, rings, plates, hub: hubDraw, banner: bannerDraw, lit: litDraw, flash: flashDraw, fray: frayDraw, band: bandDraw, bridge: bridgeDraw }; },
    clear() {
      for (const m of [hallMesh, handMesh, bridgeMesh, litMesh, frayMesh, gearMesh, bannerMesh, hubMesh, flashMesh, bandMesh, ...bezelMeshes, ...ringMeshes, ...plateMeshes]) drop(m);
      hallMesh = handMesh = bridgeMesh = litMesh = frayMesh = gearMesh = bannerMesh = hubMesh = flashMesh = bandMesh = null;
      bezelMeshes.length = ringMeshes.length = plateMeshes.length = 0;
      hands.length = gears.length = bezels.length = rings.length = plates.length = 0;
      litDraw = frayDraw = bridgeDraw = bannerDraw = hubDraw = flashDraw = bandDraw = null; draws = null; targetList = NONE;
    },
  };
}
