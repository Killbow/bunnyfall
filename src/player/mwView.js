import { mwCamera, MW_UNITS_PER_METER, FOCAL_HEIGHT, PITCH_LIMIT } from './mwCamera.js';
import { fpArm } from '../combat/fpArm.js';
import { eotbCamera } from './eotbCamera.js';
import { eotbBody } from './eotbBody.js';
import { eotbWagon } from './eotbWagon.js';
import { modSetting } from '../mods/modSettings.js';
import { getPref } from '../ui/uiPrefs.js';
import { horseRigFor, HORSE_SEAT } from '../world/horseRig.js';
import { gaitShare } from '../world/horseModel.js';
import { SEAT_PELVIS_HEIGHT } from './seatPose.js';
import { RIDE_EYE_HEIGHT } from './motor.js';

let eotbBodyReady = () => false;
let eotbPlayerState = () => ({});
export function setEotbPlayerState(fn) { eotbPlayerState = typeof fn === 'function' ? fn : () => ({}); }
export function setEotbBodyReady(fn) { eotbBodyReady = typeof fn === 'function' ? fn : () => false; }
let eotbCartYields = () => false;
let _standInWas = false;
let _beastInSprite = false;
function standInEdge({ fpEye, feet, yaw, pitch }) {
  const now = !!fpArm.standingIn?.();
  if (now) _beastInSprite = _beastInSprite || eotbLane();
  if (now === _standInWas) return;
  _standInWas = now;
  if (now) {
    _beastInSprite = eotbLane();
    if (!_beastInSprite) return;
    const third = mwCamera.thirdPerson();
    eotbCamera.toggleOffset(false);
    eotbCamera.eye({ fpEye, feet, yaw, pitch });
    if (third) eotbCamera.toggleOffset(true);
    return;
  }
  if (_beastInSprite && !mounted) mwCamera.restore({ firstPerson: !eotbCamera.thirdPerson(), baseDistance: mwCamera.baseDistance() });
  _beastInSprite = false;
}
export function setEotbCartYields(fn) { eotbCartYields = typeof fn === 'function' ? fn : () => false; }

export const SPIRE_CAMERA_EASE_S = 0.25;
export const SPIRE_EOTB_FULL_M = Math.hypot(0.5, 2);
let _spireCamera = () => false;
export function setSpireCamera(fn) { _spireCamera = typeof fn === 'function' ? fn : () => false; }
export function spireCameraEase(prev, want, full, dt) {
  if (!(prev != null && Number.isFinite(prev)) || !(want > prev)) return want;
  const step = (Math.max(full, want) * Math.max(0, Number(dt) || 0)) / SPIRE_CAMERA_EASE_S;
  return Math.min(want, prev + step);
}
let _spireCamDist = null;
export function spireCameraFrame(out, full, dt) {
  let on = false;
  try { on = !!_spireCamera(); } catch { on = false; }
  if (!on || !out?.thirdPerson || !out.focal || !(out.distance > 1e-6)) { _spireCamDist = null; return out; }
  const d = spireCameraEase(_spireCamDist, out.distance, full, dt);
  _spireCamDist = d;
  if (d < out.distance) {
    const f = out.focal, k = d / out.distance;
    out.eye = [f[0] + (out.eye[0] - f[0]) * k, f[1] + (out.eye[1] - f[1]) * k, f[2] + (out.eye[2] - f[2]) * k];
    out.distance = d;
  }
  return out;
}
export const SPIRE_SHAFT_PITCH = (20 * Math.PI) / 180;
export const SPIRE_SHAFT_RISE_M = 1.0;
export const SPIRE_SHAFT_EASE_S = 0.5;
export const SPIRE_SHAFT_FACE_IN = Math.cos((60 * Math.PI) / 180);
export const SPIRE_SHAFT_FACE_OUT = Math.cos((75 * Math.PI) / 180);
let _spireShaft = () => null;
export function setSpireShaft(fn) { _spireShaft = typeof fn === 'function' ? fn : () => null; }
export function spireShaftFacing(way, yaw, was) {
  const c = Math.sin(yaw) * way[0] + Math.cos(yaw) * way[1];
  return c >= (was ? SPIRE_SHAFT_FACE_OUT : SPIRE_SHAFT_FACE_IN);
}
export function spireShaftEase(prev, want, dt, still) {
  if (still) return 0;
  const step = (SPIRE_SHAFT_PITCH * Math.max(0, Number(dt) || 0)) / SPIRE_SHAFT_EASE_S;
  return prev < want ? Math.min(want, prev + step) : Math.max(want, prev - step);
}
let _shaftBias = 0, _shaftFacing = false;
export function spireShaftPitch(pitch, yaw, dt, third) {
  let word = null;
  try { word = _spireShaft(); } catch { word = null; }
  if (!word || !third) { _shaftBias = 0; _shaftFacing = false; return pitch; }
  _shaftFacing = !!word.way && spireShaftFacing(word.way, yaw, _shaftFacing);
  _shaftBias = spireShaftEase(_shaftBias, _shaftFacing ? SPIRE_SHAFT_PITCH : 0, dt, !!word.still);
  return _shaftBias > 0 ? Math.max(-PITCH_LIMIT, pitch - _shaftBias) : pitch;
}
export function spireShaftPivot(floor, pivotY) {
  if (!(_shaftBias > 0)) return floor;
  return Math.max(floor ?? -Infinity, pivotY + (SPIRE_SHAFT_RISE_M * _shaftBias) / SPIRE_SHAFT_PITCH);
}
export function spireShaftLook(out, yaw, pitch) {
  if (_shaftBias > 0 && out?.thirdPerson && out.focal) { const cp = Math.cos(pitch); out.look = [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp]; }
  return out;
}
export const spireShaftBias = () => _shaftBias;
export function setEotbComeSailAway(mod) {
  eotbCamera.setComeSailAway(mod);
  eotbCamera.setLog((text) => { if (modSetting('eye-of-the-beholder', 'Enabled')) console.log(text); });
}
export function eotbLane() {
  if (fpArm.canThirdPerson()) return false;
  try {
    if (!modSetting('eye-of-the-beholder', 'Enabled')) return false;
  } catch { return false; }
  return !!eotbBodyReady();
}

let pendingClicks = 0;

/** @returns {{eye:number[], thirdPerson:boolean, distance:number, look?:number[]}} */
export function mwViewFrame({ fpEye, feet, yaw, pitch, heightScale = null, raycast = null, spherecast = null, eyeOverride = null, seaReach = 0, pivotFloor = null, ...state }) {
  standInEdge({ fpEye, feet, yaw, pitch });
  benchSeated = !!state.seated;
  mwCamera.setSeaReach(seaReach);
  eotbCamera.setSeaReach(seaReach);
  horseRig?.tick();
  if (!state.riding) dropOwnHorse();
  if (eotbLane()) {
    const frame = { ...eotbPlayerState(), ...state };
    pendingClicks = 0;
    eotbCamera.tick(frame);
    pitch = spireShaftPitch(pitch, yaw, frame.dt ?? 0, eotbCamera.thirdPerson());
    pivotFloor = spireShaftPivot(pivotFloor, fpEye[1]);
    const out = eotbCamera.eye({ fpEye, feet, yaw, pitch, raycast, pivotFloor, ...frame });
    spireCameraFrame(out, SPIRE_EOTB_FULL_M, frame.dt ?? 0);
    spireShaftLook(out, yaw, pitch);
    eotbBody.tick(frame.dt ?? 0, { ...frame, feet, yaw, cameraPos: eyeOverride ?? out.eye });
    eotbWagon.tick(frame.dt ?? 0, { feet, yaw, height: frame.motion?.height, cart: !!frame.cart && !eotbCartYields(), onExteriorPath: !!frame.onExteriorPath, raycast });
    dropOwnHorse(); saddled = false;
    return eyeOverride ? { ...out, eye: eyeOverride, ownEye: out.eye } : out;
  }
  eotbBody.standDown();
  ownSink = fpEye && feet ? Math.max(0, RIDE_EYE_HEIGHT - (fpEye[1] - feet[1]) - SINK_SLACK) : 0;
  saddled = !!state.riding && stepOwnHorse(state.horse, feet, yaw, state.dt ?? 0);
  mounted = !!state.riding && !saddled;
  if (mounted) { mwIntoHead(); pendingClicks = 0; }
  if (pendingClicks) {
    mwCamera.wheel(pendingClicks, { ready: fpArm.upperBodyReady() });
    pendingClicks = 0;
  }
  if (heightScale == null) heightScale = fpArm.raceHeightScale();
  mwCamera.update({ ready: fpArm.upperBodyReady() });
  if (mwCamera.thirdPerson()) {
    if (!fpArm.setViewMode('third')) {
      mwCamera.restore({ firstPerson: true, baseDistance: mwCamera.baseDistance() });
      fpArm.setViewMode('first');
    }
  } else {
    fpArm.setViewMode('first');
  }
  mwCamera.setShoulder(getPref('mwShoulderCam'));
  mwCamera.stepShoulder(state.dt ?? 0, fpArm.shoulderStance());
  pitch = spireShaftPitch(pitch, yaw, state.dt ?? 0, mwCamera.thirdPerson());
  pivotFloor = spireShaftPivot(pivotFloor, feet[1] + (FOCAL_HEIGHT * heightScale) / MW_UNITS_PER_METER);
  if (saddled && ownSaddle) feet = [feet[0], feet[1] + Math.max(0, ownSaddle.seat[1] - feet[1] - SEAT_PELVIS_HEIGHT * heightScale), feet[2]];
  const eye = mwCamera.eye({ fpEye, feet, yaw, pitch, heightScale, raycast, spherecast, pivotFloor });
  spireCameraFrame(eye, mwCamera.baseDistance() / MW_UNITS_PER_METER, state.dt ?? 0);
  spireShaftLook(eye, yaw, pitch);
  return eyeOverride ? { ...eye, eye: eyeOverride, ownEye: eye.eye } : eye;
}

export function mwViewWheel(deltaY) {
  const clicks = deltaY < 0 ? 1 : deltaY > 0 ? -1 : 0;
  if (!clicks) return false;
  if (eotbLane()) return eotbCamera.wheel(clicks);
  if (mwCamera.mode() === 'first' && clicks < 0 && (!fpArm.canThirdPerson() || mounted)) return false;
  pendingClicks += clicks;
  return true;
}

export function mwViewPendingClicks() { return pendingClicks; }

export function mwViewFirstPerson() {
  if (heldFirst) heldFirst.changed = false;
  if (eotbLane()) {
    if (!eotbCamera.thirdPerson()) return false;
    eotbCamera.toggleOffset(false);
    return true;
  }
  return mwIntoHead();
}

export function mwViewTogglePerspective() {
  if (!mwViewCanTogglePerspective()) return false;
  if (eotbLane()) { eotbCamera.toggleOffset(!eotbCamera.thirdPerson()); return true; }
  if (mwCamera.thirdPerson()) return mwIntoHead();
  mwCamera.restore({ firstPerson: false, baseDistance: mwCamera.baseDistance() });
  fpArm.setViewMode('third');
  return true;
}
export function mwViewCanTogglePerspective() {
  if (heldThird || heldFirst) return false;
  if (eotbLane() || mwCamera.thirdPerson()) return true;
  return !!fpArm.canThirdPerson() && !mounted;
}

let heldThird = null;
export function mwViewHoldThird(on) {
  if (on) {
    if (heldThird) return heldThird.lane != null;
    if (heldFirst) mwViewHoldFirst(false);
    if (eotbLane()) {
      const was = eotbCamera.thirdPerson();
      if (!was) eotbCamera.toggleOffset(true);
      heldThird = { lane: 'eotb', changed: !was };
      return true;
    }
    if (fpArm.canThirdPerson() && !mounted) {
      const was = mwCamera.thirdPerson();
      if (!was) { mwCamera.restore({ firstPerson: false, baseDistance: mwCamera.baseDistance() }); fpArm.setViewMode('third'); }
      heldThird = { lane: 'mw', changed: !was };
      return true;
    }
    heldThird = { lane: null, changed: false };
    return false;
  }
  if (!heldThird) return false;
  const h = heldThird;
  heldThird = null;
  if (h.changed && h.lane === 'eotb' && eotbCamera.thirdPerson()) eotbCamera.toggleOffset(false);
  else if (h.changed && h.lane === 'mw') mwIntoHead();
  return true;
}
let heldFirst = null;
export function mwViewHoldFirst(on) {
  if (on) {
    if (heldFirst) return true;
    if (heldThird) return false;
    const lane = eotbLane() ? 'eotb' : 'mw';
    heldFirst = { changed: mwViewFirstPerson(), lane };
    return true;
  }
  if (!heldFirst) return false;
  const h = heldFirst;
  heldFirst = null;
  if (h.changed) mwViewTogglePerspective();
  return true;
}
export const mwViewHeldFirst = () => !!heldFirst;
export const mwViewHeldThird = () => (heldThird ? heldThird.lane : undefined);
export const mwViewHoldChanged = () => !!heldThird?.changed;
export function mwViewSaveCamera() {
  const s = mwCamera.state();
  if (heldFirst?.changed && heldFirst.lane === 'mw') return { ...s, firstPerson: false };
  return heldThird?.changed && heldThird.lane === 'mw' ? { ...s, firstPerson: true } : s;
}

function mwIntoHead() {
  if (!mwCamera.thirdPerson()) return false;
  mwCamera.restore({ firstPerson: true, baseDistance: mwCamera.baseDistance() });
  fpArm.setViewMode('first');
  return true;
}

let mounted = false;

let horseRig = null;
let ownHorse = null;
let saddled = false;
let ownSaddle = null;
let lastFeet = null;
let groundSpeed = 0;
let lastCamera = null;
const SPEED_EASE = 0.12;
const HORSE_TELEPORT = 40;
let ownSink = 0;
const SINK_SLACK = 0.15;

export function mwViewAttachHorse(renderer) {
  if (!renderer || horseRig) return;
  horseRig = horseRigFor(renderer);
  horseRig.load();
}

function stepOwnHorse(horse, feet, yaw, dt) {
  if (!horse || !horseRig?.ready() || !feet || !fpArm.canThirdPerson()) { dropOwnHorse(); return false; }
  ownHorse ??= horseRig.horse(1);
  if (!ownHorse) return false;
  if (lastFeet && dt > 0) {
    const v = Math.hypot(feet[0] - lastFeet[0], feet[2] - lastFeet[2]) / dt;
    if (v < HORSE_TELEPORT) groundSpeed += (v - groundSpeed) * Math.min(1, dt / SPEED_EASE);
  }
  lastFeet = [feet[0], feet[1], feet[2]];
  horseRig.step(ownHorse, { feet: horseFeetUnder(feet, yaw), yaw, speed: groundSpeed, dt, look: horse.look | 0, gallops: !horse.slow });
  const seat = horseRig.seat(ownHorse);
  ownSaddle = seat ? { feet: lastFeet, seat, yaw, lean: gaitShare(ownHorse.gait, 'gallop') } : null;
  return !!ownSaddle;
}
const horseFeetUnder = (feet, yaw, grow = 1) => [feet[0] - Math.sin(yaw) * HORSE_SEAT[1] * grow, feet[1] - ownSink * grow, feet[2] - Math.cos(yaw) * HORSE_SEAT[1] * grow];
function dropOwnHorse() {
  if (ownHorse) horseRig?.release(ownHorse);
  ownHorse = null; ownSaddle = null; lastFeet = null; groundSpeed = 0;
}

export function mwViewHorseRig() {
  return horseRig?.ready() && !eotbLane() && fpArm.canThirdPerson() ? horseRig : null;
}

export const mwViewSaddle = () => (saddled ? ownSaddle : null);

export function mwViewDrawSaddle(canvas) {
  if (!saddled || !ownHorse || !lastCamera || mwCamera.thirdPerson() || eotbLane()) return false;
  horseRig.place(ownHorse, horseFeetUnder(lastCamera.feet, lastCamera.yaw), lastCamera.yaw);
  return horseRig.drawFirstPerson(ownHorse, canvas, lastCamera);
}

let benchSeated = false;

export function mwViewFootstep() {
  if (!eotbLane()) return { owns: false, fell: false, volumeScale: 1 };
  return eotbBody.footstep();
}

export function mwViewTransition(kind) {
  if (!eotbLane()) return false;
  if (heldThird?.lane === 'eotb' && eotbCamera.transitionDecides(kind)) heldThird.changed = false;
  if (heldFirst?.lane === 'eotb' && eotbCamera.transitionDecides(kind)) heldFirst.changed = false;
  eotbCamera.transition(kind);
  return true;
}

export function mwViewLoadPose(pose, inside = false) {
  heldFirst = null;
  if (pose) mwCamera.restore(pose);
  eotbCamera.onLoad(inside);
}

export function mwViewNewGame(inside = false) {
  heldFirst = null;
  eotbCamera.onNewGame(inside);
}

export function mwViewRebase(delta) {
  eotbCamera.onPositionUpdate(delta);
  eotbWagon.rebase(delta);
  eotbBody.rebase(delta);
}

export function mwViewAttachWagon(pipeline) { eotbWagon.attach(pipeline); }

export function mwViewDrawWagon(renderer, texRemap = null, cull = null) {
  if (!eotbLane()) return false;
  return eotbWagon.draw(renderer, texRemap, cull);
}

export function mwViewWagonTargets(rayDistance) {
  if (!eotbLane()) return [];
  return eotbWagon.targets(rayDistance);
}

export function mwViewWagonActivate(mode, doors) {
  if (!eotbLane()) return null;
  return eotbWagon.activate(mode, doors);
}

export function mwViewHides() {
  if (heldThird) return { weapon: true, horse: true, spellHands: true };
  const hides = eotbLane() ? eotbBody.hides() : { weapon: false, horse: false, spellHands: false };
  if (!eotbLane() && mwCamera.thirdPerson()) return { ...hides, horse: true };
  return benchSeated ? { ...hides, horse: true } : hides;
}

export function mwViewDrawBody(canvas, { proj, view, eye, feet, yaw, viewYaw = yaw, face = null }) {
  if (eotbLane()) { const drawn = drawEotbBody(canvas, { proj, view, eye, feet, yaw: viewYaw, face }); spriteFigure = drawn ? eotbFigure() : null; spriteFacing = drawn ? eotbFacing() : null; return drawn; }
  lastCamera = { proj, view, feet, yaw };
  if (!mwCamera.thirdPerson()) return false;
  const grow = face?.grow > 1 ? face.grow : 1;
  const horse = saddled && ownHorse ? horseRig.picture(ownHorse, horseFeetUnder(feet, yaw, grow), yaw, grow) : null;
  return fpArm.drawThird(canvas, { proj, view, eye, feet, yaw, grow: face?.grow > 1 ? face.grow : 1, up: face?.up ?? null, horse });
}

export function mwViewBodyBones(names) {
  if (eotbLane() || !mwCamera.thirdPerson()) return null;
  return fpArm.thirdBones(names);
}
let spriteFigure = null;
export function mwViewSpriteFigure() { return eotbLane() ? spriteFigure : null; }
let spriteFacing = null;
export function mwViewSpriteFacing() { return eotbLane() ? spriteFacing : null; }

let drawEotbBody = () => false;
let eotbFigure = () => null;
let eotbFacing = () => null;
export function setEotbDrawBody(fn, figure = null, facing = null) { drawEotbBody = typeof fn === 'function' ? fn : () => false; eotbFigure = typeof figure === 'function' ? figure : () => null; eotbFacing = typeof facing === 'function' ? facing : () => null; }
