import { audio as defaultAudio } from './audio.js';
import { soundSilenced } from './soundReplacer.js';
import { rand } from '../formats/dfRandom.js';
import { CLASSIC_UPDATE_INTERVAL } from '../characters/weaponStates.js';

export const AMBIENT_SOUNDS = Object.freeze({
  dungeon: Object.freeze([63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76]),
  storm: Object.freeze([348, 349, 350]),
  sunnyDay: Object.freeze([437, 438]),
});
export const AMBIENT_RAIN_LOOP = 389;
export const AMBIENT_CRICKETS_LOOP = 6;
// Crickets sing in choruses with quiet spells between, a deliberate change from Daggerfall Unity's all-night loop.
export const CRICKET_CHORUS = Object.freeze({
  volume: 0.55,
  bout: Object.freeze([20, 46]),
  quiet: Object.freeze([45, 121]),
  fade: 3,
});
// Daggerfall Unity lists the creepy bird twice, so a graveyard calls it on two draws in three.
export const CEMETERY_AMBIENT_SOUNDS = Object.freeze([113, 14, 14]);
export const CEMETERY_AMBIENT_WAITS = Object.freeze({ minWait: 1, maxWait: 80 });
export const WATER_GENTLE = 439;
export const AMBIENT_WATER_BUBBLES = 114;

// Serialized scene components override the script default waits of 4 to 35 seconds.
export const DUNGEON_AMBIENT_WAITS = Object.freeze({ minWait: 5, maxWait: 28 });
export const EXTERIOR_AMBIENT_WAITS = Object.freeze({ minWait: 5, maxWait: 25 });

export function presetForExterior(weather, night, desolate = false) {
  if (weather === 'rain') return 'rain';
  if (weather === 'thunder') return 'storm';
  if (desolate) return 'none';
  return night ? 'clearNight' : 'sunnyDay';
}

// Every instance joins on construction and leaves on dispose, so a video mute reaches the ambience of every host.
const liveAmbients = new Set();

export function muteAmbientForVideo() {
  for (const a of liveAmbients) a.setMuted(true);
}

export function unmuteAmbientForVideo() {
  for (const a of liveAmbients) a.setMuted(false);
}

export const INDOOR_RAIN_GAIN = 0.35;

export class AmbientEffects {
  constructor({ minWait, maxWait }, engine = defaultAudio, rng = Math.random, classicRand = rand) {
    this.minWait = minWait;
    this.maxWait = maxWait;
    this.engine = engine;
    this.rng = rng;
    this.classicRand = classicRand;
    this.preset = 'none';
    this._busy = 0;
    this._waterCounter = 0;
    this._rainLoop = null;
    this._cricketsLoop = null;
    this._cricketPhase = null;
    this._cricketT = 0;
    this._cricketLen = 0;
    this.isMuted = false;
    this.rainGain = 1;
    this._rainGainSet = null;
    this.cemeteryNearby = false;
    this._cemeteryWait = 0;
    this._cemeteryCounter = 0;
    this.onPlayEffect = null;
    this._startWaiting();
    liveAmbients.add(this);
  }

  // Only the exterior hosts arm this layer; Daggerfall Unity arms it only while the player is outside.
  setCemeteryNearby(near) {
    const on = !!near;
    if (on && !this.cemeteryNearby) this._startCemeteryWaiting();
    this.cemeteryNearby = on;
  }

  _startCemeteryWaiting() {
    const w = CEMETERY_AMBIENT_WAITS;
    this._cemeteryWait = w.minWait + Math.floor(this.rng() * (w.maxWait - w.minWait));
    this._cemeteryCounter = 0;
  }

  _playCemeteryEffects(deps) {
    const list = CEMETERY_AMBIENT_SOUNDS;
    const index = Math.floor(this.rng() * list.length);
    this._playSomewhereAround(list[index], deps.playerPos ?? [0, 0, 0]);
  }

  // Waits roll like System.Random.Next(min, max): whole seconds with an exclusive max.
  _startWaiting() {
    this._wait = this.minWait + Math.floor(this.rng() * (this.maxWait - this.minWait));
    this._counter = 0;
  }

  setPreset(preset) {
    if (preset === this.preset) return;
    this.preset = preset;
    if (this._rainLoop) { this._rainLoop.stop(); this._rainLoop = null; }
    if (this._cricketsLoop) { this._cricketsLoop.stop(); this._cricketsLoop = null; }
    this._startWaiting();
    this._cricketPhase = null;
    if (preset === 'clearNight') this._cricketPhaseTo('bout');
  }

  _cricketPhaseTo(phase) {
    const [lo, hi] = CRICKET_CHORUS[phase];
    this._cricketPhase = phase;
    this._cricketT = 0;
    this._cricketLen = lo + Math.floor(this.rng() * (hi - lo));
  }

  _updateCrickets(dt) {
    this._cricketT += dt;
    if (this._cricketPhase === 'quiet') {
      if (this._cricketT >= this._cricketLen) this._cricketPhaseTo('bout');
      return;
    }
    if (this._cricketT >= this._cricketLen) {
      if (this._cricketsLoop) { this._cricketsLoop.stop(); this._cricketsLoop = null; }
      this._cricketPhaseTo('quiet');
      return;
    }
    if (!this._cricketsLoop) this._cricketsLoop = this.engine.loop(AMBIENT_CRICKETS_LOOP, 0);
    const { volume, fade } = CRICKET_CHORUS;
    const swell = Math.min(1, this._cricketT / fade, (this._cricketLen - this._cricketT) / fade);
    this._cricketsLoop?.setVolume?.(volume * Math.max(0, swell));
  }

  // Muting drops the loop handles and stops the sources; unmuting only clears the flag, so update reopens loops.
  setMuted(v) {
    if (v) {
      if (this._rainLoop) { this._rainLoop.stop(); }
      if (this._cricketsLoop) { this._cricketsLoop.stop(); }
      this._rainLoop = null;
      this._cricketsLoop = null;
      this._rainGainSet = null;
      this.isMuted = true;
    } else {
      this.isMuted = false;
    }
  }

  dispose() {
    this.setPreset('none');
    liveAmbients.delete(this);
  }

  _spatialized(index, pos, minDistance) {
    if (this._busy > 0) return;
    const d = this.engine.play3d(index, pos, 1, { refDistance: minDistance, maxDistance: minDistance * 8 });
    this._busy = d ?? 0;
  }

  _flat(index) {
    if (this._busy > 0) return;
    const d = this.engine.playOneShot(index, 1);
    this._busy = d ?? 0;
  }

  _playSomewhereAround(index, playerPos) {
    const z = this.rng() * 2 - 1;
    const theta = this.rng() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    const dist = Math.sqrt(100 + this.rng() * (400 - 100));
    this._spatialized(index, [
      playerPos[0] + r * Math.cos(theta) * dist,
      playerPos[1] + z * dist,
      playerPos[2] + r * Math.sin(theta) * dist,
    ], 13);
  }

  _playSomewhereOnHorizon(index, playerPos) {
    const deg = Math.sqrt(this.rng() * 10000 * 10000);
    const a = deg * Math.PI / 180;
    const x = 0.94 * Math.cos(a), zz = -0.94 * Math.sin(a);
    this._spatialized(index, [playerPos[0] + x, playerPos[1] + 0.34, playerPos[2] + zz], 3000);
  }

  _playEffects(deps) {
    const sounds = AMBIENT_SOUNDS[this.preset];
    if (!sounds) return;
    const index = Math.floor(this.rng() * sounds.length);
    if (this.preset === 'storm') {
      this._playSomewhereOnHorizon(sounds[index], deps.playerPos ?? [0, 0, 0]);
      this.onPlayEffect?.(sounds[index], deps.playerPos ?? null);
    } else {
      if (deps.inCastle) return;
      this._playSomewhereAround(sounds[index], deps.playerPos ?? [0, 0, 0]);
      this.onPlayEffect?.(sounds[index], deps.playerPos ?? null);
    }
  }

  update(dt, deps = {}) {
    // The mute check comes first, as in Daggerfall Unity, so no loop or one-shot starts during a video.
    if (this.isMuted) return;
    // The preset is not updated while the player is inside, so the street rain carries on indoors and
    // underground, as it does in Daggerfall Unity.
    if ((this.preset === 'rain' || this.preset === 'storm') && !this._rainLoop) {
      this._rainLoop = this.engine.loop(AMBIENT_RAIN_LOOP, 1);
      this._rainGainSet = null;
    }
    const building = !!deps.inside && !deps.underground;
    const rainGain = this.rainGain * (building ? (deps.indoorRainSource ? 0 : INDOOR_RAIN_GAIN) : (deps.underground && deps.indoorRainSource ? 0 : 1));
    if (this._rainLoop && this._rainGainSet !== rainGain) {
      this._rainLoop.setVolume?.(rainGain);
      this._rainGainSet = rainGain;
    }
    // A chorus already sounding holds its own source, so the switch, a building, or the underground stops it here.
    if (this.preset === 'clearNight') {
      if (deps.inside || deps.underground || soundSilenced(AMBIENT_CRICKETS_LOOP)) { if (this._cricketsLoop) { this._cricketsLoop.stop(); this._cricketsLoop = null; } }
      else this._updateCrickets(dt);
    }
    this._busy = Math.max(0, this._busy - dt);
    this._counter += dt;
    this._waterCounter += dt;
    if (this._counter > this._wait) {
      if (!deps.inside) this._playEffects(deps);
      this._startWaiting();
    }
    // The cemetery layer keeps its own counter and plays over the ordinary one-shots, not instead of them.
    if (this.cemeteryNearby && !deps.inside) {
      this._cemeteryCounter += dt;
      if (this._cemeteryCounter > this._cemeteryWait) {
        this._playCemeteryEffects(deps);
        this._startCemeteryWaiting();
      }
    }
    if (this._waterCounter > CLASSIC_UPDATE_INTERVAL) {
      if (deps.waterSurfaceY != null && deps.playerPos) {
        if (this.classicRand() < 50) {
          this._spatialized(WATER_GENTLE, [
            deps.playerPos[0] + (this.rng() * 6 - 3),
            deps.waterSurfaceY,
            deps.playerPos[2] + (this.rng() * 6 - 3),
          ], 8);
        }
        if (deps.submerged && this.classicRand() < 100) {
          this._flat(AMBIENT_WATER_BUBBLES);
        }
      }
      this._waterCounter = 0;
    }
  }
}
