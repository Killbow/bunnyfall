// @ts-check
// Climb sound effects, driven by the same motor frame as the climb camera.

import { APP_ROOT } from '../platform/appRoot.js';
import { enhancedSoundsOn } from '../audio/enhancedSounds.js';
import { PARKOUR_GRIP_LOW } from './parkour.js';
import { FEEL } from './climbFeel.js';

export const CLIMB_SFX = Object.freeze({
  grab: Object.freeze(['climb:grab-1', 'climb:grab-2']),
  catch: Object.freeze(['climb:catch']),
  step: Object.freeze(['climb:step-1', 'climb:step-2', 'climb:step-3']),
  scrape: Object.freeze(['climb:scrape-1', 'climb:scrape-2']),
  pull: Object.freeze(['climb:pull']),
  whoosh: Object.freeze(['climb:whoosh']),
  crumble: Object.freeze(['climb:crumble']),
});
export const CLIMB_SFX_FILES = Object.freeze(Object.fromEntries(
  Object.values(CLIMB_SFX).flat().map((key) => [key, `${key.replace(':', '-')}.wav`]),
));

export const CLIMB_SOUND = Object.freeze({
  GRAB: 0.6,
  CATCH_BASE: 0.5,
  CATCH_PER_SPEED: 0.06,
  CATCH_MAX: 0.95,
  HARD_CATCH_SPEED: 5,
  STEP: 0.34,
  SHIMMY: 0.26,
  SHIMMY_PITCH: 1.08,
  FOOT: 0.22,
  FOOT_PITCH: 0.72,
  SCRAPE: 0.4,
  PULL: 0.55,
  STEP_UP_RISE: 0.7,
  HIGH_PULL_RISE: 1.2,
  WHOOSH: 0.42,
  CRUMBLE: 0.5,
  TRICKLE: 0.3,
  TRICKLE_MIN_S: 1.6,
  TRICKLE_MAX_S: 3.4,
  LET_GO: 0.22,
  SLIP: 0.55,
  PITCH_JITTER: 0.06,
  STRAIN: 0.6,
  STRAIN_GAP_S: 3,
});

export const climbSfxUrl = (file) => new URL(`sfx/${file}`, APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/').href;

let _install = null;
export function installClimbSounds(audio, { fetchBytes = null } = {}) {
  if (!audio?.registerSound) return Promise.resolve(0);
  return (_install ??= (async () => {
    const load = fetchBytes ?? (async (file) => {
      const r = await fetch(climbSfxUrl(file));
      if (!r.ok) throw new Error(`${file}: ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    });
    let n = 0;
    for (const [key, file] of Object.entries(CLIMB_SFX_FILES)) {
      try { if (await audio.registerSound(key, await load(file))) n++; } catch { }
    }
    return n;
  })());
}
export function _resetClimbSounds() { _install = null; }

export function climbClip(sound, prev, rand, pitch = 1) {
  const keys = CLIMB_SFX[/** @type {keyof typeof CLIMB_SFX} */ (sound)];
  if (!keys) return null;
  let key = keys[Math.floor(rand() * keys.length) % keys.length];
  if (keys.length > 1 && key === prev) key = keys[(keys.indexOf(key) + 1) % keys.length];
  return { key, pitch: pitch * (1 + CLIMB_SOUND.PITCH_JITTER * (2 * rand() - 1)) };
}

/**
 * @param {any} e
 * @param {string|null} from
 */
export function moveCues(e, from) {
  const C = CLIMB_SOUND;
  const split = Number.isFinite(e.split) ? Math.min(1, Math.max(0, e.split)) : 0.5;
  const rise = e.rise ?? 0;
  /** @type {Array<[number, string|null, number, number, number]>} */
  const cues = [];
  switch (e.kind) {
    case 'catch':
    case 'reach': {
      const speed = e.speed ?? 0;
      cues.push([0, 'catch', Math.min(C.CATCH_MAX, C.CATCH_BASE + C.CATCH_PER_SPEED * speed), 1, speed > C.HARD_CATCH_SPEED ? 0.5 : 0]);
      break;
    }
    case 'mantle':
      if (rise < C.STEP_UP_RISE) {
        if (!from) cues.push([0, 'grab', C.GRAB * 0.7, 1, 0]);
        cues.push([split, 'scrape', C.SCRAPE * 0.6, 1, 0]);
      } else {
        if (!from) cues.push([0, 'grab', C.GRAB * 0.9, 1, 0]);
        cues.push([0.06, 'pull', C.PULL * (rise >= C.HIGH_PULL_RISE ? 1 : 0.7), 1, from === 'hang' ? 0.5 : rise >= 1.4 ? 0.35 : 0]);
        cues.push([split, 'scrape', C.SCRAPE * 0.75, 1, 0]);
      }
      break;
    case 'vault':
      cues.push([split * 0.6, 'grab', C.GRAB * 0.8, 1.08, 0]);
      cues.push([split, 'whoosh', C.WHOOSH * 0.6, 1.1, 0]);
      break;
    case 'lower':
      cues.push([0, 'scrape', C.SCRAPE, 0.92, 0]);
      cues.push([split, 'grab', C.GRAB, 1, 0]);
      cues.push([0.92, 'step', C.FOOT, C.FOOT_PITCH, 0]);
      break;
    case 'corner':
      cues.push([0.2, 'step', C.SHIMMY * 1.15, C.SHIMMY_PITCH, 0]);
      cues.push([0.7, 'step', C.SHIMMY * 1.15, C.SHIMMY_PITCH, 0]);
      break;
    case 'leap':
      cues.push([0, 'step', C.STEP, 0.75, rise > 0.3 ? 0.6 : 0.4]);
      cues.push([0.02, 'whoosh', C.WHOOSH, 1, 0]);
      cues.push([1, 'grab', C.GRAB * 1.2, 1, 0]);
      break;
    case 'wallrun':
      cues.push([0, 'whoosh', C.WHOOSH * 0.5, 0.9, 0.35]);
      cues.push([0.1, 'step', C.FOOT * 2, C.FOOT_PITCH, 0]);
      cues.push([0.32, 'step', C.FOOT * 1.9, C.FOOT_PITCH * 0.95, 0]);
      cues.push([0.54, 'step', C.FOOT * 1.8, C.FOOT_PITCH * 1.03, 0]);
      cues.push([1, 'grab', C.GRAB * 1.1, 1, 0]);
      break;
    default: break;
  }
  return cues.sort((a, b) => a[0] - b[0]);
}

export class ClimbSounds {
  /**
   * @param {{ audio?: any, strain?: ((rolls: () => number) => ({ clip: number, pitchLift?: number } | null)) | null,
   * rand?: () => number, on?: () => boolean, install?: boolean }} [opts]
   */
  constructor({ audio = null, strain = null, rand = Math.random, on = enhancedSoundsOn, install = true } = {}) {
    this.audio = audio;
    this.strain = strain;
    this.rand = rand;
    this.on = on;
    this.install = install;
    this.last = new Map();
    this.reset();
  }

  reset() {
    this.t = 0;
    this.prev = null;
    this.cues = null;
    this.climbPhase = 0;
    this.shimmyPhase = 0;
    this.trickleAt = Infinity;
    this.lastStrain = -Infinity;
  }

  update(dt, m) {
    this.t += Math.min(Math.max(dt, 0), 1 / 20);
    if (!m || !this.on()) { this.cues = null; this.prev = null; return; }
    if (this.install && this.audio) installClimbSounds(this.audio);
    const events = m.climbEvents ?? [];
    const live = m.climbMove;
    const moving = events.some((e) => e.type === 'move');
    let from = null;
    for (const e of events) {
      switch (e.type) {
        case 'release':
          from = e.mode ?? null;
          if (!moving) {
            if (!(m.grip > 0)) {
              this._play('scrape', CLIMB_SOUND.SLIP);
              this._play('crumble', CLIMB_SOUND.CRUMBLE);
              this._strain(0.7, m);
            } else {
              this._play('step', CLIMB_SOUND.LET_GO, 1.15);
            }
          }
          this.trickleAt = Infinity;
          break;
        case 'move':
          this._flush(1);
          this.cues = moveCues(e, from);
          from = null;
          this._due(0, m);
          break;
        case 'hold':
          this.climbPhase = 0; this.shimmyPhase = 0;
          if (this.cues && !live) {
            this._flush(1, m);
          } else {
            this._play('grab', CLIMB_SOUND.GRAB * (e.mode === 'hang' ? 0.85 : 0.75));
          }
          break;
        case 'launch':
          this._play('step', CLIMB_SOUND.STEP, 0.75);
          this._play('whoosh', CLIMB_SOUND.WHOOSH);
          this._strain(0.45, m);
          break;
        case 'gripLow':
          this._play('crumble', CLIMB_SOUND.CRUMBLE);
          this.trickleAt = this.t + this._between(CLIMB_SOUND.TRICKLE_MIN_S, CLIMB_SOUND.TRICKLE_MAX_S);
          break;
        default: break;
      }
    }
    if (this.cues) {
      if (live) this._due(live.t ?? 0, m);
      else this._flush(1, m);
    }
    const p = m.climbTrackPos?.() ?? m.pos;
    let dx = 0, dy = 0, dz = 0;
    if (this.prev && p && m.onWall && !live) { dx = p[0] - this.prev[0]; dy = p[1] - this.prev[1]; dz = p[2] - this.prev[2]; }
    this.prev = p && (m.onWall || live) ? [p[0], p[1], p[2]] : null;
    if (Math.hypot(dx, dy, dz) > 1) { dx = dy = dz = 0; }
    if (m.onWall && !live) {
      if (m.hanging) {
        const n = m.wallNormal;
        const along = n ? Math.abs(-n[2] * dx + n[0] * dz) : 0;
        if (along > 1e-5) {
          const was = this.shimmyPhase;
          this.shimmyPhase += along / FEEL.SHIMMY_SPAN;
          if (Math.floor(this.shimmyPhase) > Math.floor(was)) this._play('step', CLIMB_SOUND.SHIMMY, CLIMB_SOUND.SHIMMY_PITCH);
        }
      } else {
        const travel = Math.hypot(dx, dy, dz);
        if (travel > 1e-5) {
          const was = this.climbPhase;
          this.climbPhase += travel / FEEL.REACH;
          if (Math.floor(this.climbPhase) > Math.floor(was)) this._play('step', CLIMB_SOUND.STEP);
          if (Math.floor(this.climbPhase - 0.5) > Math.floor(was - 0.5)) this._play('step', CLIMB_SOUND.FOOT, CLIMB_SOUND.FOOT_PITCH);
        }
      }
      if (m.grip <= PARKOUR_GRIP_LOW && this.t >= this.trickleAt) {
        this._play('crumble', CLIMB_SOUND.TRICKLE);
        this.trickleAt = this.t + this._between(CLIMB_SOUND.TRICKLE_MIN_S, CLIMB_SOUND.TRICKLE_MAX_S);
      }
    } else if (!live) {
      this.trickleAt = Infinity;
    }
  }

  _due(t, m = null) {
    const c = this.cues;
    if (!c) return;
    while (c.length && c[0][0] <= t + 1e-9) {
      const [, sound, vol, pitch, strain] = /** @type {[number, string|null, number, number, number]} */ (c.shift());
      if (sound) this._play(sound, vol, pitch);
      if (strain > 0) this._strain(strain, m);
    }
  }

  _flush(t, m = null) {
    this._due(t, m);
    this.cues = null;
  }

  _play(sound, vol, pitch = 1) {
    if (!this.audio?.playOneShot) return;
    const c = climbClip(sound, this.last.get(sound), this.rand, pitch);
    if (!c) return;
    this.last.set(sound, c.key);
    this.audio.playOneShot(c.key, Math.min(1, vol), c.pitch);
  }

  _strain(chance, m) {
    if (!this.strain || this.t - this.lastStrain < CLIMB_SOUND.STRAIN_GAP_S) return;
    const grip = Number.isFinite(m?.grip) ? Math.min(1, Math.max(0, m.grip)) : 1;
    if (this.rand() >= Math.min(0.9, chance * (1 + (1 - grip)))) return;
    const voice = this.strain(this.rand);
    if (!voice || !(voice.clip >= 0)) return;
    this.lastStrain = this.t;
    this.audio?.playOneShot?.(voice.clip, CLIMB_SOUND.STRAIN, 1 + (voice.pitchLift ?? 0));
  }

  _between(a, b) { return a + (b - a) * this.rand(); }
}
