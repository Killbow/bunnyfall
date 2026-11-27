// @ts-check
// Animated static flats after DaggerfallBillboard.cs AnimateBillboard. The fixed-step clock runs on the host's dt
// and holds the remainder, so every frame rate shows the same speed and a stall catches up.

// DaggerfallBillboard.cs rates: 5 by default and for Animals, 12 for Lights.
export const GENERAL_FPS = 5;
export const ANIMAL_FPS = 5;
export const LIGHT_FPS = 12;

export const ANIMALS_TEXTURE_ARCHIVE = 201;
export const LIGHTS_TEXTURE_ARCHIVE = 210;

export const MISSILE_FPS = 5;
export const IMPACT_FPS = 15;

// DFU precedence: the per-billboard rate is the default, and the Animals and Lights archives override it.
export function flatFps(archive, framesPerSecond = GENERAL_FPS) {
  if (archive === ANIMALS_TEXTURE_ARCHIVE) return ANIMAL_FPS;
  if (archive === LIGHTS_TEXTURE_ARCHIVE) return LIGHT_FPS;
  return framesPerSecond;
}

export const isAnimatedFlat = (frameCount) => frameCount > 1;

export class FlatAnim {
  /**
   * @param {number} archive
   * @param {number} frameCount
   * @param {boolean} [oneShot]
   */
  constructor(archive, frameCount, oneShot = false, framesPerSecond = GENERAL_FPS) {
    this.archive = archive;
    this.frameCount = frameCount;
    this.oneShot = oneShot;
    this.fps = flatFps(archive, framesPerSecond);
    this.currentFrame = 0;
    this.frame = 0;
    this.done = false;
    this._acc = 0;
    // DFU's coroutine runs its first pass before its first wait.
    this._step();
  }

  // DFU tests the wrap first and shows the frame before the increment; a modulo would change where a one-shot ends.
  _step() {
    if (this.currentFrame >= this.frameCount) {
      this.currentFrame = 0;
      if (this.oneShot) { this.done = true; return; }
    }
    this.frame = this.currentFrame;
    this.currentFrame++;
  }

  tick(dt) {
    if (this.done || !(dt > 0)) return this.frame;
    this._acc += dt;
    const period = 1 / this.fps;
    const steps = Math.floor(this._acc / period);
    if (steps < 1) return this.frame;
    this._acc = Math.max(0, this._acc - steps * period);
    // Every owed advance lands: a looping clock plays the remainder of its frameCount cycle, and a one-shot at most
    // its length plus the wrap that ends it.
    const n = this.oneShot ? Math.min(steps, this.frameCount + 1) : ((steps - 1) % this.frameCount) + 1;
    for (let i = 0; i < n && !this.done; i++) this._step();
    return this.frame;
  }
}

export class FlatAnimator {
  constructor() { this.entries = []; }

  /** @param {import('./contract.js').BillboardBatch} batch */
  add(batch, archive, frameCount, oneShot = false, framesPerSecond = GENERAL_FPS) {
    if (!isAnimatedFlat(frameCount)) return null;
    const anim = new FlatAnim(archive, frameCount, oneShot, framesPerSecond);
    batch.frame = anim.frame;
    const entry = { batch, anim };
    this.entries.push(entry);
    return entry;
  }

  remove(batch) {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].batch === batch) this.entries.splice(i, 1);
    }
  }

  rebind(from, to) {
    for (const e of this.entries) if (e.batch === from) { e.batch = to; to.frame = e.anim.frame; }
  }

  clear() { this.entries.length = 0; }

  tick(dt) {
    for (const e of this.entries) e.batch.frame = e.anim.tick(dt);
  }
}

/**
 * @param {import('./contract.js').BillboardBatch} batch
 * @param {{ getFrameCount?: (record: number) => number }|null|undefined} textureFile
 * @param {number} archive
 * @param {number} record
 * @param {FlatAnimator|null} animator
 * @param {((archive: number, record: number, frame: number) => void)|null} uploadRecordFrame
 * @returns {boolean}
 */
export function armFlatAnim(batch, textureFile, archive, record, animator, uploadRecordFrame, opts = {}) {
  const frameCount = textureFile?.getFrameCount?.(record) ?? 1;
  if (!isAnimatedFlat(frameCount) || !animator || !uploadRecordFrame) return false;
  // Uploads every frame up front, so no texture upload lands inside the frame loop.
  for (let f = 0; f < frameCount; f++) uploadRecordFrame(archive, record, f);
  animator.add(batch, archive, frameCount, opts.oneShot ?? false, opts.fps ?? GENERAL_FPS);
  return true;
}
