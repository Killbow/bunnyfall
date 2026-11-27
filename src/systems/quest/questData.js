// Loads the vendored quest pack and preloads every source once, so the quest machine's reads stay synchronous.
// Browser only: `import.meta.glob` is a Vite compile-time macro, so Node tests never import this module.

import { loadQuestTables } from './tables.js';
import { applyForageFix } from '../../professions/foragingLaw.js';
import { applyQuestPatches, QUEST_PATCHES } from './questPatches.js';
import { questlineLines } from '../questlines/qlPatches.js';

const tableFiles = import.meta.glob('../../../vendor/dfu-quests/Tables/*.txt', { query: '?raw', import: 'default' });
const questFiles = import.meta.glob('../../../vendor/dfu-quests/Quests/*.txt', { query: '?raw', import: 'default' });
const modQuestFiles = {
  ...import.meta.glob('../../../vendor/roleplay-realism/Quests/*.txt', { query: '?raw', import: 'default' }),
  ...import.meta.glob('../../../vendor/warm-ashes-ships/Quests/*.txt', { query: '?raw', import: 'default' }),
  ...import.meta.glob('../../../vendor/foraging/Quests/*.txt', { query: '?raw', import: 'default' }),
  ...import.meta.glob('../questlines/quests/*.txt', { query: '?raw', import: 'default' }),
};

const stripBom = (s) => s.replace(/^﻿/, '');
const baseName = (path) => path.split('/').pop().replace(/\.txt$/, '');

let _pack = null;

// Patches apply on every read because their entry text follows the player's current language.
const _patchWarned = new Set();
function patchedLines(name, text) {
  try { return applyQuestPatches(name, text).split(/\r?\n/); } catch (e) {
    if (!_patchWarned.has(name)) { _patchWarned.add(name); console.warn(`[questData] ${e.message} - loaded as shipped`); }
    return null;
  }
}

export async function loadQuestPack() {
  if (_pack) return _pack;
  _pack = (async () => {
    const tables = new Map();
    await Promise.all(Object.entries(tableFiles).map(async ([path, load]) => {
      tables.set(baseName(path), stripBom(await load()));
    }));
    const quests = new Map();
    const patchable = new Map();
    await Promise.all(Object.entries(questFiles).map(async ([path, load]) => {
      const name = baseName(path);
      const text = stripBom(await load());
      if (QUEST_PATCHES[name]) patchable.set(name, text);
      quests.set(name, text.split(/\r?\n/));
    }));
    await Promise.all(Object.entries(modQuestFiles).map(async ([path, load]) => {
      const name = baseName(path);
      const text = stripBom(await load());
      let patched = text;
      if (path.includes('/vendor/foraging/')) {
        try { patched = applyForageFix(name, text); } catch (e) { console.warn(`[questData] ${e.message} - loaded as shipped`); }
      }
      if (name.startsWith('QuestList-')) tables.set(name, patched);
      else { quests.set(name, patched.split(/\r?\n/)); patchable.delete(name); }
    }));
    loadQuestTables(Object.fromEntries(tables));
    return {
      readListTable: (name) => tables.get(`QuestList-${name}`) ?? null,
      // `questlines` is the switch state a saved copy was read with; undefined reads the switch now.
      getQuestSourceLines: (name, questlines) => questlineLines(name, (patchable.has(name) ? patchedLines(name, patchable.get(name)) : null) ?? quests.get(name) ?? null, questlines),
      questCount: quests.size,
    };
  })();
  return _pack;
}
