// @ts-check
import { APP_ROOT } from '../../platform/appRoot.js';

export const NAVAL_SFX = Object.freeze({
  cannon: 'naval:cannon',
  cannonFar: 'naval:cannon-far',
  swivel: 'naval:swivel',
  hit: 'naval:hit',
  blast: 'naval:blast',
  grapple: 'naval:grapple',
  runout: 'naval:runout',
  ready: 'naval:ready',
  sinking: 'naval:sinking',
  whistle: 'naval:whistle',
});
export const NAVAL_SFX_FILES = Object.freeze({
  [NAVAL_SFX.cannon]: 'naval-cannon.wav',
  [NAVAL_SFX.cannonFar]: 'naval-cannon-far.wav',
  [NAVAL_SFX.swivel]: 'naval-swivel.wav',
  [NAVAL_SFX.hit]: 'naval-hit.wav',
  [NAVAL_SFX.blast]: 'naval-blast.wav',
  [NAVAL_SFX.grapple]: 'naval-grapple.wav',
  [NAVAL_SFX.runout]: 'naval-runout.wav',
  [NAVAL_SFX.ready]: 'naval-ready.wav',
  [NAVAL_SFX.sinking]: 'naval-sinking.wav',
  [NAVAL_SFX.whistle]: 'naval-whistle.wav',
});
// Indices into the classic DAGGER.SND sound set.
export const NAVAL_CLASSIC = Object.freeze({ splashLarge: 342, splashSmall: 346, bell: 107, bubbles: 114, burning: 420 });

// The audio bus's default 3D profile suits footsteps, so each sea sound sets its own range for play3d.
export const NAVAL_SOUND_RANGE = Object.freeze({
  [NAVAL_SFX.cannon]: Object.freeze({ refDistance: 30, maxDistance: 2400 }),
  [NAVAL_SFX.cannonFar]: Object.freeze({ refDistance: 70, maxDistance: 3000 }),
  [NAVAL_SFX.swivel]: Object.freeze({ refDistance: 14, maxDistance: 1200 }),
  [NAVAL_SFX.hit]: Object.freeze({ refDistance: 16, maxDistance: 1000 }),
  [NAVAL_SFX.blast]: Object.freeze({ refDistance: 26, maxDistance: 1800 }),
  [NAVAL_SFX.grapple]: Object.freeze({ refDistance: 6, maxDistance: 240 }),
  [NAVAL_SFX.runout]: Object.freeze({ refDistance: 24, maxDistance: 900 }),
  [NAVAL_SFX.ready]: Object.freeze({ refDistance: 10, maxDistance: 80 }),
  [NAVAL_SFX.whistle]: Object.freeze({ refDistance: 8, maxDistance: 90 }),
  [NAVAL_CLASSIC.splashLarge]: Object.freeze({ refDistance: 12, maxDistance: 600 }),
  [NAVAL_CLASSIC.splashSmall]: Object.freeze({ refDistance: 6, maxDistance: 300 }),
  [NAVAL_CLASSIC.bell]: Object.freeze({ refDistance: 20, maxDistance: 900 }),
  [NAVAL_CLASSIC.bubbles]: Object.freeze({ refDistance: 14, maxDistance: 500 }),
});
export const NAVAL_FIRE_LOOP = Object.freeze({ refDistance: 6, maxDistance: 90, distanceModel: 'linear' });
export const NAVAL_SINK_LOOP = Object.freeze({ refDistance: 18, maxDistance: 420, distanceModel: 'linear' });
export const navalSoundRange = (key) => NAVAL_SOUND_RANGE[/** @type {any} */ (key)] ?? null;

export const navalSfxUrl = (file) => new URL(`sfx/${file}`, APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/').href;

let _sounds = null;
export function installNavalSounds(audio, { fetchBytes = null } = {}) {
  if (!audio?.registerSound) return Promise.resolve(0);
  return (_sounds ??= (async () => {
    const load = fetchBytes ?? (async (file) => {
      const r = await fetch(navalSfxUrl(file));
      if (!r.ok) throw new Error(`${file}: ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    });
    let n = 0;
    for (const [key, file] of Object.entries(NAVAL_SFX_FILES)) {
      try { if (await audio.registerSound(key, await load(file))) n++; } catch { }
    }
    return n;
  })());
}
export function _resetNavalSounds() { _sounds = null; }
