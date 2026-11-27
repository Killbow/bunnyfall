import { textureEntry } from '../../render/textureReplacement.js';
import { setFlatReplacerSources } from '../flatReplacer/flatReplacer.js';
import { attachedDfmods } from '../../mods/dfmodTextures.js';
import { getPref } from '../../ui/uiPrefs.js';

export const MOD_PACKS = Object.freeze({
  pde: Object.freeze({ id: 'pde', title: 'Paperdoll Enhanced', stem: 'paperdoll enhanced', guid: 'ed9ba1e2-5971-4b03-9cb8-83a1abb7cb2d', titleWord: /paperdoll\s*enhanced/i }),
  weeberfall: Object.freeze({ id: 'weeberfall', title: 'Weeberfall', stem: 'weeberfall', guid: null, titleWord: /weeb/i }),
});
export const MOD_PACK_IDS = Object.freeze(Object.keys(MOD_PACKS));
export const MOD_PACK_PREFIX = 'modpack/';
export const modPackManifestKey = (id) => `${MOD_PACK_PREFIX}${id}.json`;

// Keys start with the pack stem because attached mods load in key order and the last one loaded wins, so Weeberfall
// draws over Paperdoll Enhanced.
export function modPackDfmodKey(id, fileName) {
  const stem = MOD_PACKS[id].stem;
  const base = String(fileName ?? '').split('/').pop().replace(/\.dfmod$/i, '').toLowerCase().trim();
  return `dfmod/${base === stem || base.startsWith(`${stem} `) || base.startsWith(`${stem}-`) ? base : `${stem} - ${base}`}.dfmod`;
}

const baseOf = (path) => String(path).split('/').pop();
const isAddonFile = (path) => /dibellan/i.test(path);

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

export const emptyManifest = (id) => ({ id, v: 1, dfmods: [], loose: [], flat: [], addon: [] });

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

let _manifests = new Map();
let _gen = 0;
export const modPackManifest = (id) => _manifests.get(id) ?? null;
export const modPackGeneration = () => _gen;
export const modPackOwnedKeys = () => new Set([..._manifests.values()].flatMap((m) => [...m.dfmods, ...m.loose]));

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

export const pdeGapFillOn = () => getPref('pdeFillGaps') !== false && attachedDfmods().some((m) => m.guid === MOD_PACKS.pde.guid && m.enabled);

export function _resetModPacks() { _manifests = new Map(); _gen++; }
