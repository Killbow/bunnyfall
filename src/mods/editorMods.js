// Mods made by the Bunnyfall Dungeon Editor: a `vendor/<name>/` folder marked with `dungeon-editor.mod.json`.
// Each is a world-data mod with the one `Enabled` switch.

export const EDITOR_MOD_FORMAT = 'bunnyfall-dungeon-mod/1';

const IN_BROWSER = typeof window !== 'undefined';
const HAND_DECLARED = new Set(['bunnyfall-dungeons']);
const VENDOR_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');

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

export const EDITOR_MODS = readEditorMods(IN_BROWSER
  ? import.meta.glob('../../vendor/*/dungeon-editor.mod.json', { eager: true, import: 'default' })
  : {});
