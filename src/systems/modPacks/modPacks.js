// BUNNYFALL MODPACK1: MODS WITH A SECTION OF THEIR OWN - Paperdoll Enhanced and Weeberfall. The player picks the
// mod's download (its .zip or .7z, or the bare .dfmod) and the game takes what it uses out of it:
//
//   - every .dfmod goes on the texture-mod door (systems/dfmodTextures.js), stored under the mod's own name so the load
//     order is fixed: "paperdoll enhanced..." loads before "weeberfall...", and where both carry a picture the one
//     loaded last - Weeberfall - is the one drawn (DFU's TryGetAsset);
//   - loose DFU-named textures (a Textures/ folder) go on the loose tier, which outranks every .dfmod;
//   - Flat Replacer's JSON files (a FlatReplacements/ folder) are Weeberfall's townsfolk (systems/flatReplacer/); the
//     ones of its Dibellan Degeneracy add-on are kept apart, read only while its switch is on.
//
// What each mod brought is written down in a manifest (`modpack/<id>.json`, in the texture store beside the bundles),
// so the mod's section lists it and its Remove takes all of it and nothing else. A mod may come in several downloads
// (Weeberfall, its Flat Replacements, its add-on): each pick adds to what is there, a file of the same name replaced.
//
// The store itself is the data source's (scenes/dataSource.js); everything here is pure but `registerModPacks`.

import { textureEntry } from '../textureReplacement.js';
import { setFlatReplacerSources } from '../flatReplacer/flatReplacer.js';
import { attachedDfmods } from '../dfmodTextures.js';
import { getPref } from '../uiPrefs.js';

export const MOD_PACKS = Object.freeze({
  pde: Object.freeze({ id: 'pde', title: 'Paperdoll Enhanced', stem: 'paperdoll enhanced', guid: 'ed9ba1e2-5971-4b03-9cb8-83a1abb7cb2d', titleWord: /paperdoll\s*enhanced/i }),
  weeberfall: Object.freeze({ id: 'weeberfall', title: 'Weeberfall', stem: 'weeberfall', guid: null, titleWord: /weeb/i }),
});
export const MOD_PACK_IDS = Object.freeze(Object.keys(MOD_PACKS));
export const MOD_PACK_PREFIX = 'modpack/';
export const modPackManifestKey = (id) => `${MOD_PACK_PREFIX}${id}.json`;

/** The store key a pack's .dfmod is kept under: the pack's name first, so the packs load in their order. */
export function modPackDfmodKey(id, fileName) {
  const stem = MOD_PACKS[id].stem;
  const base = String(fileName ?? '').split('/').pop().replace(/\.dfmod$/i, '').toLowerCase().trim();
  return `dfmod/${base === stem || base.startsWith(`${stem} `) || base.startsWith(`${stem}-`) ? base : `${stem} - ${base}`}.dfmod`;
}

const baseOf = (path) => String(path).split('/').pop();
const isAddonFile = (path) => /dibellan/i.test(path);

/** What a download's files are, by their paths: { dfmods, flat, addon, loose } - each a list of the entries. */
export function classifyModPackEntries(entries) {
  const out = { dfmods: [], flat: [], addon: [], loose: [] };
  for (const e of entries ?? []) {
    const path = String(e.name ?? '');
    const base = baseOf(path);
    if (/\.dfmod$/i.test(base)) { out.dfmods.push(e); continue; }
    if (/\.json$/i.test(base) && /(^|\/)flatreplacements\//i.test(path)) { (isAddonFile(path) ? out.addon : out.flat).push(e); continue; }
    if (/(^|\/)textures\//i.test(path) && (textureEntry(base) || (/\.xml$/i.test(base) && textureEntry(base.replace(/\.xml$/i, '.png'))))) out.loose.push(e);
  }
  return out;
}

/** An empty manifest. */
export const emptyManifest = (id) => ({ id, v: 1, dfmods: [], loose: [], flat: [], addon: [] });

/** A manifest with a pick added: `add` is { dfmods: [key], loose: [name], flat: [{ name, text }], addon: [...] }. */
export function mergeManifest(m, add) {
  const out = { ...emptyManifest(m?.id), ...(m ?? {}) };
  const union = (a, b) => [...new Set([...(a ?? []), ...(b ?? [])])];
  const byName = (a, b) => { const map = new Map((a ?? []).map((f) => [f.name, f])); for (const f of b ?? []) map.set(f.name, f); return [...map.values()]; };
  out.dfmods = union(out.dfmods, add.dfmods);
  out.loose = union(out.loose, add.loose);
  out.flat = byName(out.flat, add.flat);
  out.addon = byName(out.addon, add.addon);
  return out;
}

// ---- what the store holds, for the menu --------------------------------------------------------------------------

let _manifests = new Map();   // id -> manifest (only the ones whose files are stored)
let _gen = 0;
/** The pack's manifest as the last registration read it, or null when the pack is not attached. */
export const modPackManifest = (id) => _manifests.get(id) ?? null;
export const modPackGeneration = () => _gen;
/** Every store key a pack owns (its .dfmods, their indexes are the store's to find, its loose files). */
export const modPackOwnedKeys = () => new Set([..._manifests.values()].flatMap((m) => [...m.dfmods, ...m.loose]));

/**
 * Read the packs' manifests out of the store (`names` its keys, `load(key)` its bytes) and hand Weeberfall's Flat
 * Replacer files on. A manifest whose files are all gone (removed elsewhere) reads as not attached. Answers the
 * number of Flat Replacer records standing.
 */
export async function registerModPacks(names, load) {
  const have = new Set(names);
  const next = new Map();
  for (const id of MOD_PACK_IDS) {
    const key = modPackManifestKey(id);
    if (!have.has(key)) continue;
    try {
      const m = JSON.parse(new TextDecoder().decode(await load(key)));
      m.dfmods = (m.dfmods ?? []).filter((k) => have.has(k));
      m.loose = (m.loose ?? []).filter((k) => have.has(k));
      if (m.dfmods.length || m.loose.length || m.flat?.length || m.addon?.length) next.set(id, m);
    } catch (e) { console.warn(`[modpacks] ${id}: the manifest will not read -`, e?.message ?? e); }
  }
  _manifests = next;
  _gen++;
  const w = next.get('weeberfall');
  return setFlatReplacerSources({ base: w?.flat ?? [], addon: w?.addon ?? [] });
}

/** MODPACK1: Paperdoll Enhanced's missing pieces are filled in (pdeGapFill.js) - its switch on, and the mod attached
 *  and switched on, however it was attached. */
export const pdeGapFillOn = () => getPref('pdeFillGaps') !== false && attachedDfmods().some((m) => m.guid === MOD_PACKS.pde.guid && m.enabled);

/** Test seam. */
export function _resetModPacks() { _manifests = new Map(); _gen++; }
