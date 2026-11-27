// @ts-check
// Clips under public/sfx come from tools/soundscapeSfx.mjs and tools/soundscapeSfxInstall.mjs; record each
// recording's source in public/sfx/SOURCES.md.
import { APP_ROOT } from '../../platform/appRoot.js';
import { createClipInstaller } from './clipInstall.js';

/** @param {string} stem @param {number} n */
const takes = (stem, n) => Object.freeze(Array.from({ length: n }, (_, i) => `${stem}-${i + 1}`));

export const SCAPE_SFX = Object.freeze({
  gull: takes('sea-gull', 6),
  shoreCrash: takes('shore-crash', 2),
  owl: takes('wild-owl', 2),
  howl: takes('wild-howl', 2),
  crow: takes('wild-crow', 1),
  frog: takes('wild-frog', 4),
  anvil: takes('town-anvil', 2),
});

export const SCAPE_SFX_FILES = Object.freeze(Object.fromEntries(Object.values(SCAPE_SFX).flat().map((key) => [key, `${key}.wav`])));

export const scapeSfxUrl = (/** @type {string} */ file) => new URL(`sfx/${file}`, APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/').href;

const _installer = createClipInstaller(SCAPE_SFX_FILES, { urlOf: scapeSfxUrl });
/** @param {any} audio */
export const installSoundscapeSounds = (audio) => _installer.install(audio);
export const soundscapeSoundReady = (/** @type {string} */ key) => _installer.has(key);
export function _resetSoundscapeSounds() { _installer._reset(); }
