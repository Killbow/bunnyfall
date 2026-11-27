// Replaces listed classic clips with loose WAVs named after their SoundClips entry, from a sound pack the player
// attaches. The WAVs are never bundled because sound mods carry their authors' own terms.
import { getPref } from '../ui/uiPrefs.js';

export const SOUND_REPLACEMENTS = Object.freeze({
  6: 'AmbientCrickets',
  113: 'AmbientDistantHowl',
});
export const SOUND_SWITCHES = Object.freeze({ 6: 'nightCrickets', 113: 'distantHowl' });

export const soundBufferKey = (name) => `rep:${name}`;
export function soundEntry(fileName) {
  const base = String(fileName ?? '').split(/[\\/]/).pop().toLowerCase();
  for (const name of Object.values(SOUND_REPLACEMENTS)) if (base === `${name.toLowerCase()}.wav`) return name;
  return null;
}

let _files = new Map();
let _load = null;
let _gen = 0;

export function setSoundReplacements(fileNames, load) {
  _files = new Map();
  for (const f of fileNames ?? []) { const n = soundEntry(f); if (n) _files.set(n, f); }
  _load = load ?? null;
  _gen++;
  return _files.size;
}
export const soundReplacementCount = () => _files.size;
export const soundReplacementGen = () => _gen;

export function soundSilenced(index) {
  const k = SOUND_SWITCHES[index];
  if (!k) return false;
  try { return getPref(k) === false; } catch { return false; }
}

export async function fetchReplacement(name) {
  const f = _files.get(name);
  if (!f || !_load) return null;
  try { return (await _load(f)) ?? null; } catch { return null; }
}
