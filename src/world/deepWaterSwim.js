const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothStep = (from, to, t) => { t = clamp01(t); t = -2 * t * t * t + 3 * t * t; return to * t + from * (1 - t); };

export const SWIM_ENTER_CLEARANCE = 0.1;
export const SWIM_EXIT_CLEARANCE = 0.75;
export const SWIM_PHYSICS_SURFACE_OFFSET = 0.55;
export const HEAD_DIVE_BELOW_SURFACE = 0.25;
export const CAMERA_ENTER_UNDERWATER_CLEARANCE = 0.04;
export const CAMERA_EXIT_UNDERWATER_CLEARANCE = 0.08;
export const FOG_CAMERA_CLEARANCE = 0.65;
export const SHORE_GROUND_PROBE_HEIGHT = 1.25;
export const SHORE_GROUND_PROBE_DISTANCE = 3.25;
export const SHORE_GROUND_OCEAN_MARGIN = 0.5;
export const WATER_CONTACT_MINIMUM_DEPTH = 0.5;
export const WATER_CONTACT_GRACE_SECONDS = 1.25;
export const DESCEND_WATER_CONTACT_ALLOWANCE = 1.5;
export const SHORE_EXIT = Object.freeze({ probeHeightAboveOcean: 13, probeDistance: 18, minForwardInput: 0.02, minLandingNormalY: 0.45, landingWaterMargin: 0.25, maxLandingAboveOcean: 8, minOpenWaterColumnDepth: 2 });
export const STROKE = Object.freeze({ duration: 0.48, cooldown: 0.9, extraSpeed: 2.65, fatigueFraction: 0.025, minFatigue: 24, tempoExponent: 0.35, surfaceUpwardCameraClearance: 0.35, seafloorClearance: 0.18, maxShoreClampCorrection: 2.5, maxMoveDelta: 0.1 });

export const swimCheckY = (centreY) => centreY + 1.25 - 0.95;
export const headUnderwater = (centreY, oceanY) => centreY + 1.9 - 0.95 < oceanY - HEAD_DIVE_BELOW_SURFACE;
export const headClearOfSurface = (centreY, oceanY) => centreY + 1.9 - 0.95 > oceanY;
// Rounds a .5 tie to the even integer like Unity's Mathf.Round, where `Math.round` rounds it up.
const roundHalfEven = (v) => { const f = Math.floor(v); const r = v - f; return r > 0.5 ? f + 1 : r < 0.5 ? f : (f % 2 === 0 ? f : f + 1); };
export const NO_WATER_LEVEL = 10000;
export const worldYToBlockWaterLevel = (y) => clamp(roundHalfEven(-y / 0.025), -32768, 32767);
export const blockWaterLevelToWorldY = (level) => -level * 0.025;

export function forgedSwimWaterLineY(oceanY, isSwimming, centreY) {
  let line = oceanY + SWIM_EXIT_CLEARANCE;
  if (!isSwimming) return line;
  const check = swimCheckY(centreY);
  if (check >= line) line = check + 0.05;
  return line;
}

export const surfaceAscentCeiling = (oceanY) => oceanY + SWIM_PHYSICS_SURFACE_OFFSET - 1.25 + 0.93;

export const presentationWaterLineForFog = (oceanY, cameraY) => Math.max(oceanY, cameraY + 1.25 - 0.95 - FOG_CAMERA_CLEARANCE);

export class DeepWaterSwimState {
  constructor() {
    this.waterContactUntil = 0;
    this.forged = false;
    this._headInit = false;
    this._presentationUnderwater = false;
    this.inWater = false;
    this.swimming = false;
    this.headSubmerged = false;
    this.underwater = false;
    this.wasForged = false;
  }

  resetHead(underwater = false) { this._presentationUnderwater = underwater; this._headInit = false; }

  clear() {
    this.inWater = this.swimming = this.headSubmerged = this.underwater = false;
    this.forged = false;
    this.resetHead(false);
  }

  /**
   * @param {number} oceanY
   * @param {number} cameraY
   * @param {number} centreY
   */
  presentationUnderwater(oceanY, cameraY, centreY) {
    const flag = cameraY < oceanY + CAMERA_ENTER_UNDERWATER_CLEARANCE || headUnderwater(centreY, oceanY);
    if (!this._headInit) { this._presentationUnderwater = flag; this._headInit = true; }
    if (this._presentationUnderwater) {
      if (!flag && cameraY > oceanY + CAMERA_EXIT_UNDERWATER_CLEARANCE) this._presentationUnderwater = false;
    } else if (flag) this._presentationUnderwater = true;
    return this._presentationUnderwater;
  }

  /** @param {object} f */
  recentContact(f) {
    if (!f.descend && f.onShore) { this.waterContactUntil = 0; return false; }
    const allowance = f.descend ? DESCEND_WATER_CONTACT_ALLOWANCE : SWIM_EXIT_CLEARANCE;
    if (!(swimCheckY(f.centreY) > f.oceanY + allowance) && f.usableColumnHere) {
      this.waterContactUntil = f.now + WATER_CONTACT_GRACE_SECONDS;
      return true;
    }
    if (!f.descend && f.grounded) { this.waterContactUntil = 0; return false; }
    return f.now < this.waterContactUntil;
  }

  /**
   * @param {object} f
   * @returns {{inWater: boolean, swimming: boolean, headSubmerged: boolean, underwater: boolean, onShore: boolean}}
   */
  step(f) {
    const onShore = !f.descend && f.onShore;
    const contact = this.recentContact(f) && !onShore;
    const atDepth = swimCheckY(f.centreY) < f.oceanY + (this.forged ? SWIM_EXIT_CLEARANCE : SWIM_ENTER_CLEARANCE);
    const swimming = contact && (atDepth || f.descend || f.ascend);
    const underwater = contact && this.presentationUnderwater(f.oceanY, f.cameraY, f.centreY);
    const headSubmerged = contact && headUnderwater(f.centreY, f.oceanY);
    if (onShore) this.resetHead(false);
    this.inWater = contact; this.swimming = swimming; this.headSubmerged = headSubmerged; this.underwater = underwater;
    return { inWater: contact, swimming, headSubmerged, underwater, onShore };
  }
}

export const strokeTempoScale = (swimSpeedMultiplier) => Math.max(0.5, Math.pow(clamp(swimSpeedMultiplier, 0.25, 30), STROKE.tempoExponent));

export const strokeFatigueCost = (maxFatigue) => Math.max(STROKE.minFatigue, Math.ceil(maxFatigue * STROKE.fatigueFraction));

/**
 * @param {object} i
 * @returns {?number[]}
 */
export function strokeDirection(i) {
  let d;
  const moving = Math.abs(i.strafe) > 0.001 || Math.abs(i.forward) > 0.001;
  if (moving) {
    const k = i.strafe !== 0 && i.forward !== 0 ? 0.7071 : 1;
    const sin = Math.sin(i.yaw), cos = Math.cos(i.yaw), cp = Math.cos(i.pitch ?? 0);
    d = [(sin * cp * i.forward + cos * i.strafe) * k, 0, (cos * cp * i.forward - sin * i.strafe) * k];
  } else d = [i.lookDir[0], i.lookDir[1], i.lookDir[2]];
  if (i.up) d[1] += 0.65;
  else if (i.down) d[1] -= 0.65;
  if (d[1] > 0 && i.oceanY != null && i.cameraY > i.oceanY + STROKE.surfaceUpwardCameraClearance) d[1] = 0;
  const m = Math.hypot(d[0], d[1], d[2]);
  if (m * m < 0.001) return null;
  return [d[0] / m, d[1] / m, d[2] / m];
}

export const isBoatEffectBundle = (name) => name === 'ImOnABoat' || name === "I'm On A Boat";

export function strokeVelocity({ direction, swimSpeed, tempo, remaining, duration }) {
  const s = smoothStep(0, 1, clamp01(remaining / Math.max(0.01, duration)));
  const k = swimSpeed * STROKE.extraSpeed * tempo * s;
  return [direction[0] * k, direction[1] * k, direction[2] * k];
}

export const UNDERWATER_CUTOFF_HZ = 1000;
export const SWIM_SOUND_CLIP = 346;
export const SWIM_SOUND_VOLUME = 0.7;
export const SWIM_SOUND_DISTANCE = 2.5;

// A floating-origin shift goes through `rebase`, so recentering the world never counts as distance swum.
export class SwimSoundOdometer {
  constructor() { this.tracking = false; this.last = [0, 0, 0]; this.distance = 0; }
  reset() { this.tracking = false; this.distance = 0; }
  rebase(offset) { if (this.tracking) for (let i = 0; i < 3; i++) this.last[i] += offset[i]; }
  /**
   * @param {number[]} pos
   * @returns {boolean}
   */
  step(pos) {
    if (!this.tracking) {
      this.last[0] = pos[0]; this.last[1] = pos[1]; this.last[2] = pos[2];
      this.distance = 0;
      this.tracking = true;
      return false;
    }
    this.distance += Math.hypot(pos[0] - this.last[0], pos[1] - this.last[1], pos[2] - this.last[2]);
    this.last[0] = pos[0]; this.last[1] = pos[1]; this.last[2] = pos[2];
    if (!(this.distance < SWIM_SOUND_DISTANCE)) { this.distance = 0; return true; }
    return false;
  }
}
