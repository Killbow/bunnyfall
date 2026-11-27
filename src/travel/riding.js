
import { CfaFile } from '../formats/cfaFile.js';
import { frameToColor32 } from '../combat/fpsWeapon.js';
import { TRANSPORT_MODES, isRiding } from './transport.js';
import { recolorHorse, horseLookCode, horseLookOfCode, lookSuffix } from './horseCoats.js';

export const HORSE_TEXTURE = 'MRED00I0.CFA';
export const CART_TEXTURE = 'MRED01I0.CFA';
export const ANIM_FRAME_TIME = 0.125;
export const WALK_FRAME_TIME = 2 * ANIM_FRAME_TIME;
export const RIDING_VOLUME_SCALE = 0.6;
export const SCALE_FACTOR_X = 0.8;
export const NATIVE_SCREEN_HEIGHT = 200;
export const STOP_RIDING_DELAY = 0.2;

export const RIDING_SOUND = Object.freeze({
  neigh: 'AnimalHorse',
  horseSlow: 'HorseClop',
  horseFast: 'HorseClop2',
  cart: 'HorseAndCart',
});

export const ridingTextureName = (mode) => (mode === TRANSPORT_MODES.Cart ? CART_TEXTURE : HORSE_TEXTURE);

export const ridingLoopClip = (mode) => (mode === TRANSPORT_MODES.Cart ? RIDING_SOUND.cart : RIDING_SOUND.horseFast);

// Unity's integer `Random.Range` excludes its maximum, so the delays are 2 to 39 and 1 to 4 whole seconds.
export const nextNeighDelay = (rolls = Math.random) => 2 + Math.floor(rolls() * 38);
export const mountNeighDelay = (rolls = Math.random) => 1 + Math.floor(rolls() * 4);

// The cart sprite is never dyed, because its wood is the same brown as the horse hide and would take the dye too.
export const ridingLook = (mode, look) => (mode === TRANSPORT_MODES.Horse ? horseLookCode(horseLookOfCode(look)) : 0);

export async function loadRidingArt(getBytes, palette, renderer, mode, look = 0) {
  const fileName = ridingTextureName(mode);
  const c = ridingLook(mode, look);
  const cfa = new CfaFile();
  cfa.load(await getBytes(fileName), fileName, palette);
  const { width, height } = cfa.getSize(0);
  const frames = [], records = [];
  for (let f = 0; f < cfa.getFrameCount(0); f++) {
    const c32 = recolorHorse(frameToColor32(cfa.getDFBitmap(0, f), palette, null), c, { bottomFirst: false, legs: false, tack: false });
    records.push(`ride:${fileName}:${f}${lookSuffix(c)}`);
    frames.push(renderer.uploadTexture('img', records[f], c32));
  }
  return { fileName, width, height, frames, look: c, records };
}

export function ridingRect(canvas, art, hudOffset = 0) {
  const scaleY = canvas.height / NATIVE_SCREEN_HEIGHT;
  const scaleX = scaleY * SCALE_FACTOR_X;
  const w = art.width * scaleX;
  const h = art.height * scaleY;
  return { x: canvas.width / 2 - w / 2, y: canvas.height - h - hudOffset, w, h };
}

export class RidingAnimator {
  constructor() {
    this.frameIndex = 0;
    this.lastFrameTime = 0;
    this.now = 0;
    this.neighTime = 0;
    this.wasMovingLessThanHalfSpeed = true;
    this.stopAt = null;
    this.playing = false;
    this.clip = null;
  }

  // The rig's `setMode` stops the riding audio channel; this only stops requesting it.
  mount(mode, { rolls = Math.random } = {}) {
    this.frameIndex = 0;
    this.lastFrameTime = 0;
    this.playing = false;
    this.stopAt = null;
    this.clip = ridingLoopClip(mode);
    this.neighTime = this.now + mountNeighDelay(rolls);
  }

  /** @returns {{frame:number, clip:string|null, playing:boolean, volume:number, pitch:number, neigh:boolean}} */
  update(dt, { mode = TRANSPORT_MODES.Foot, standingStill = false, grounded = true,
    paused = false, movingLessThanHalfSpeed = true, running = false, walking = false,
    soundVolume = 1, rolls = Math.random } = {}) {
    this.now += dt;
    if (!isRiding(mode)) return { frame: 0, clip: this.clip, playing: false, volume: 0, pitch: 1, neigh: false };
    if (standingStill || !grounded || paused) {
      this.lastFrameTime = 0;
      this.frameIndex = 0;
      if (this.stopAt == null && this.playing) this.stopAt = this.now + STOP_RIDING_DELAY;
      if (this.stopAt != null && this.now >= this.stopAt) { this.playing = false; this.stopAt = null; }
    } else {
      if (this.lastFrameTime === 0) this.lastFrameTime = this.now;
      else if (this.now > this.lastFrameTime + (walking ? WALK_FRAME_TIME : ANIM_FRAME_TIME)) {
        this.lastFrameTime = this.now;
        this.frameIndex = this.frameIndex === 3 ? 0 : this.frameIndex + 1;
      }
      if (mode === TRANSPORT_MODES.Horse) {
        // The clop clip swaps only when the half-speed line is crossed, as in DFU, not from the current speed.
        this.stopAt = null;
        if (walking) {
          // A walk forces the slow clop and arms the edge, because a ride that starts at a walk never crosses the
          // half-speed line.
          this.wasMovingLessThanHalfSpeed = true;
          this.clip = RIDING_SOUND.horseSlow;
        } else if (!this.wasMovingLessThanHalfSpeed && movingLessThanHalfSpeed) {
          this.wasMovingLessThanHalfSpeed = true;
          this.clip = RIDING_SOUND.horseSlow;
        } else if (this.wasMovingLessThanHalfSpeed && !movingLessThanHalfSpeed) {
          this.wasMovingLessThanHalfSpeed = false;
          this.clip = RIDING_SOUND.horseFast;
        }
      }
      this.playing = true;
    }
    const volume = (movingLessThanHalfSpeed || walking ? RIDING_VOLUME_SCALE * 0.5 : RIDING_VOLUME_SCALE) * soundVolume;
    const pitch = running ? 1.2 : 1;
    // The neigh sits outside the horse-only branch, as in DFU, so a cart neighs too.
    let neigh = false;
    if (this.neighTime < this.now) {
      neigh = true;
      this.neighTime = this.now + nextNeighDelay(rolls);
    }
    return { frame: this.frameIndex, clip: this.clip, playing: this.playing, volume, pitch, neigh };
  }
}
