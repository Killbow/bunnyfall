import { getBool } from '../platform/settings.js';

// In preference order: when a pick holds a song twice, the earlier extension wins, whatever the file order.
export const MUSIC_EXTENSIONS = Object.freeze(['ogg', 'mp3', 'm4a', 'flac', 'wav']);

export const musicReplacementEnabled = () => getBool('Enhancements', 'AssetInjection');

export const replacementKey = (songName) =>
  String(songName ?? '').trim().replace(/\.HMI$/i, '').toUpperCase();

export function replacementEntry(fileName) {
  const name = String(fileName ?? '').trim();
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  if (!MUSIC_EXTENSIONS.includes(ext)) return null;
  // Daggerfall Unity packs prefix songs with `song_`; no MIDI.BSA record starts with SONG_, so the strip is safe.
  return { key: base.slice(0, dot).replace(/^song_/i, '').toUpperCase(), ext };
}

export function indexReplacements(fileNames) {
  const index = new Map();
  for (const fileName of fileNames ?? []) {
    const entry = replacementEntry(fileName);
    if (!entry) continue;
    const held = index.get(entry.key);
    if (held && MUSIC_EXTENSIONS.indexOf(held.ext) <= MUSIC_EXTENSIONS.indexOf(entry.ext)) continue;
    index.set(entry.key, { ext: entry.ext, fileName });
  }
  return index;
}

// The AssetInjection gate sits inside the lookup, so no caller plays a replacement the player turned off.
export function replacementFor(songName, index) {
  if (!musicReplacementEnabled()) return null;
  if (!index || index.size === 0) return null;
  return index.get(replacementKey(songName))?.fileName ?? null;
}

let _index = new Map();
let _load = null;

export function setMusicReplacements(fileNames, load) {
  _index = indexReplacements(fileNames);
  _load = typeof load === 'function' ? load : null;
  return _index.size;
}

export const replacementCount = () => _index.size;

export const replacementKeys = () => [..._index.keys()].sort();

export const hasReplacement = (songName) => replacementFor(songName, _index) !== null;

export function clearMusicReplacements() {
  _index = new Map();
  _load = null;
}

export async function replacementBytes(songName) {
  const fileName = replacementFor(songName, _index);
  if (!fileName || !_load) return null;
  try {
    const bytes = await _load(fileName);
    return bytes && bytes.byteLength > 0 ? bytes : null;
  } catch (e) {
    console.warn(`[music] replacement ${fileName} would not load:`, e?.message ?? e);
    return null;
  }
}
