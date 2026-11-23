// BUNNYFALL: MODS THE DUNGEON EDITOR MADE. The Bunnyfall Dungeon Editor (the C++ project beside this repo) exports
// a project as a mod folder of its own, `vendor/<name>/`, and marks it with `dungeon-editor.mod.json`:
//
//   { "format": "bunnyfall-dungeon-mod/1", "title": "Crypts of Hope", "author": "Kay", "description": "..." }
//
// Every such folder is a world-data mod like `bunnyfall-dungeons` (WorldData/, WorldDataPatches/, Models/), with
// the same one switch, `Enabled`: modSettings.js declares it, features.js gives it a Features row, settingsMap.js
// places that row under Gameplay > Dungeons, and onlineLane.js hands the switch to the room. So a new editor mod
// needs no code here - only its folder.
//
// `bunnyfall-dungeons` is declared by hand (modSettings.js) and is left out of this list.
//
// BROWSER-ONLY glob (as scenes/modWorldData.js): in node the list is empty.

export const EDITOR_MOD_FORMAT = 'bunnyfall-dungeon-mod/1';

const IN_BROWSER = typeof window !== 'undefined';
const HAND_DECLARED = new Set(['bunnyfall-dungeons']);
const VENDOR_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');

/** The editor mods among `files` (a glob's path -> manifest), checked: a bad manifest is warned about and skipped. */
export function readEditorMods(files) {
  const mods = [];
  for (const [path, json] of Object.entries(files)) {
    const vendor = /vendor\/([^/]+)\/dungeon-editor\.mod\.json$/.exec(path)?.[1] ?? '';
    if (HAND_DECLARED.has(vendor)) continue;
    if (!VENDOR_NAME.test(vendor) || json?.format !== EDITOR_MOD_FORMAT || !text(json.title, 80)) {
      console.warn(`[editor mods] ${path}: not a ${EDITOR_MOD_FORMAT} manifest in a vendor folder named a-z, 0-9 and - - skipped`);
      continue;
    }
    mods.push(Object.freeze({
      vendor,
      title: text(json.title, 80),
      author: text(json.author, 80) || 'Bunnyfall',
      description: text(json.description, 400),
    }));
  }
  return Object.freeze(mods.sort((a, b) => a.vendor.localeCompare(b.vendor)));
}

/** Every editor mod in vendor/, by vendor folder. */
export const EDITOR_MODS = readEditorMods(IN_BROWSER
  ? import.meta.glob('../../vendor/*/dungeon-editor.mod.json', { eager: true, import: 'default' })
  : {});
