// The overhauls: three panels (texture, sound, UI), each one choice out of a set.
// An option is a whole look over Features rows, so the panel and the Features home read and write the same rows.

import { FEATURES, resolveControl } from './features.js';
import { getPref, setPref } from '../ui/uiPrefs.js';
import { pageParam } from '../platform/pageQuery.js';
import { modSetting, setModSetting } from './modSettings.js';
import { onlineForcedPref, onlineForcedModSetting } from '../platform/onlineLane.js';
import { uiSkin, setUiSkin, SKIN_NAMES } from '../ui/uiSkin.js';
import { activeUiPack, setUiPack, UI_PACKS, UI_PACK_NONE } from '../ui/uiPack.js';
import { veBase, veAddons, veWorn, classicTexturesWorn, wearVanillaEnhanced, wearClassicTextures, classicBlocked, customTextureNote } from './vanillaEnhanced.js';

const row = (id) => {
  const f = FEATURES.find((x) => x.id === id);
  if (!f) throw new Error(`overhauls: no Features row '${id}'`);
  return f;
};

export function rowEnds(f) {
  const c = resolveControl(f);
  if (c.store === 'prefs' && c.tiers) {
    const def = c.default ?? c.initial;
    return {
      classic: c.tiers[0][0], enhanced: c.tiers.some(([v]) => String(v) === String(def)) ? def : c.tiers[c.tiers.length - 1][0],
      read: () => String(c.read ? c.read() : getPref(c.key)),
      write: (v) => (c.write ?? ((x) => setPref(c.key, x)))(v),
      forced: onlineForcedPref(c.key) !== undefined,
    };
  }
  if (c.store === 'prefs') {
    return { classic: false, enhanced: true, read: () => String(!!getPref(c.key)), write: (v) => setPref(c.key, !!v), forced: onlineForcedPref(c.key) !== undefined };
  }
  if (c.store === 'mods') {
    return {
      classic: false, enhanced: true,
      read: () => String(modSetting(c.vendor, c.key) === true || modSetting(c.vendor, c.key) === 'True'),
      write: (v) => setModSetting(c.vendor, c.key, !!v),
      forced: onlineForcedModSetting(c.vendor, c.key) !== undefined,
    };
  }
  throw new Error(`overhauls: '${f.id}' lives in the ${c.store} store, which a look does not set`);
}

function preset(id, name, end, rows, { by, blurb }) {
  return Object.freeze({
    id, name, by, blurb, rows: Object.freeze([...rows]),
    isOn: () => rows.every((r) => { const e = rowEnds(row(r)); return e.read() === String(e[end]); }),
    apply: () => { for (const r of rows) { const e = rowEnds(row(r)); e.write(e[end]); } return { reload: false }; },
  });
}

export const SOUND_ROWS = Object.freeze(['enhanced-sounds', 'mod-immersive-footsteps']);

export function uiChoiceUrl(skin, pack, href = globalThis.location?.href ?? 'http://localhost/') {
  const url = new URL(href);
  url.searchParams.delete('skin'); url.searchParams.delete('uipack'); url.searchParams.delete('plus');
  if (setUiSkin(skin) === null) url.searchParams.set('skin', skin);
  if (skin === 'classic' && setUiPack(pack) === false) url.searchParams.set('uipack', pack);
  return url.toString();
}
const dressWorn = (search = globalThis.location?.search ?? '') => {
  const url = pageParam('dress', search);
  return (url === 'grimoire' || url === 'none' ? url : getPref('plusDress')) === 'grimoire' ? 'grimoire' : 'none';
};
const uiOption = (id, name, skin, pack, { by, blurb, dress = 'none', vendor = null }) => Object.freeze({
  id, name, by, blurb, skin, pack, dress, vendor,
  isOn: () => uiSkin() === skin && (skin !== 'classic' ? dressWorn() === dress : (activeUiPack()?.id ?? UI_PACK_NONE) === pack),
  apply: () => {
    const url = new URL(uiChoiceUrl(skin, pack));
    url.searchParams.delete('dress');
    if (skin === 'enhanced' && setPref('plusDress', dress) === false) url.searchParams.set('dress', dress);
    return { reload: true, url: url.toString() };
  },
});

const textureOption = (id, name, { by, blurb, isOn, wear, addons = null, vendor = null, blocked = null }) => Object.freeze({
  id, name, blurb, isOn, addons, vendor, blocked,
  get by() { return typeof by === 'function' ? by() : by; },
  apply: () => { wear(); return { reload: false }; },
});

const G = UI_PACKS.grimoire;
export const OVERHAUL_PANELS = Object.freeze([
  Object.freeze({
    id: 'texture', title: 'Texture Overhaul',
    effect: 'Takes effect when the world next loads.',
    online: null,
    get custom() { return customTextureNote(); },
    options: Object.freeze([
      textureOption('classic', 'Classic', {
        by: 'The original game',
        blurb: 'The original game\u2019s own textures, for the classic look.',
        isOn: classicTexturesWorn, wear: wearClassicTextures, blocked: classicBlocked,
      }),
      textureOption('vanilla-enhanced', 'Vanilla Enhanced', {
        by: () => { const b = veBase(); return b?.version ? `carademono, version ${b.version}` : 'carademono'; },
        blurb: 'The original game\u2019s own textures, remastered and sharper: the ground, trees, rocks, city walls and dungeons.',
        isOn: veWorn, wear: wearVanillaEnhanced, addons: veAddons, vendor: 'vanilla-enhanced',
      }),
    ]),
  }),
  Object.freeze({
    id: 'sound', title: 'Sound Overhaul',
    effect: 'Takes effect at once.',
    online: null,
    options: Object.freeze([
      preset('classic', 'Classic', 'classic', SOUND_ROWS, { by: 'The original game', blurb: 'The original game\u2019s own sounds, for a retro feel.' }),
      preset('enhanced', 'Enhanced', 'enhanced', SOUND_ROWS, { by: 'Bunnyfall and Immersive Footsteps', blurb: 'New and improved sounds and ambience.' }),
    ]),
  }),
  Object.freeze({
    id: 'ui', title: 'UI Overhaul',
    effect: 'Switching reloads the game.',
    online: 'Online, chat, friends, party and trading keep their own panels with any of these.',
    options: Object.freeze([
      uiOption('classic', SKIN_NAMES.classic, 'classic', UI_PACK_NONE, { by: 'The original game', blurb: 'The original game\u2019s own interface, for the classic feel.' }),
      uiOption('enhanced-plus', SKIN_NAMES.enhanced, 'enhanced', UI_PACK_NONE, { by: 'Bunnyfall', blurb: 'A modern interface built for mouse and keyboard, controller or phone. You can adjust some settings and the controller bindings.' }),
      uiOption(G.id, G.title, 'classic', G.id, { by: `${G.author}, version ${G.version}`, blurb: 'The classic interface with improvements: 3 times the detail, a new font, a spellbook for all your spells, and parchment and wood in place of the original stone.' }),
      uiOption('dfo-grimoire', 'Bunnyfall Grimoire', 'enhanced', UI_PACK_NONE, { dress: 'grimoire', vendor: G.vendor, by: `Bunnyfall, in ${G.author}'s GrimoireUI ${G.version}`, blurb: 'GrimoireUI\u2019s parchment, wood and red-and-gold buttons on every window, with everything Enhanced Plus has: the hotbar, camps and tents, resting, the maps, trading and every online panel. Your vitals show as glass vials.' }),
    ]),
  }),
]);

export function currentOption(panel) { return panel.options.find((o) => o.isOn()) ?? null; }
export const forcedRows = (option) => (option.rows ?? []).filter((r) => rowEnds(row(r)).forced);
