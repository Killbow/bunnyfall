// @ts-check
// Patches over vendored quests, applied as the pack is read; the vendored files stay verbatim.
// Each patch names its exact old text and how often it occurs, and any other count throws.

import { t } from '../../ui/textManager.js';

/** @typedef {{ old: string, new: string, count: number }} TextPatch */

export function applyTextPatches(label, name, patches, text) {
  let out = text.replace(/\r\n?/g, '\n');
  for (const p of patches) {
    const found = out.split(p.old).length - 1;
    if (found !== p.count) throw new Error(`${label}: ${name} holds "${p.old.trim()}" ${found} times, not ${p.count}`);
    out = out.split(p.old).join(p.new);
  }
  return out;
}

// The entry avoids %g (it reads the last person named) and `=child_` (it expands to a race).
// Translations must keep the four `_symbol_` names, which the quest expands.
export const SHAM_TRAIL_MESSAGE = 1027;
export const SHAM_TRAIL_STEP = 4;
const SHAM_TRAIL_EN = 'No daedra came out of _child_ when I brought the _item_. _child_ just thanked me and ran off with it. Something is not right here. _guardian_ was staying at _tavern_, and someone there may know more.';
export const ENTRY_WIDTH = 34;

// An empty line ends a message in the parser, so no line here is ever empty.
export function entryLines(text, width = ENTRY_WIDTH) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) { lines.push(` ${line}`); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(` ${line}`);
  return lines;
}

// The Duel (A0C00Y10): the journal names the inn's own town, since town mods can move the inn to a nearby town.
export const QUEST_PATCHES = Object.freeze({
  A0C00Y10: () => [{ old: ' _inn_ in ___giver_ in six hours.', new: ' _inn_ in ___inn_ in six hours.', count: 1 }],
  // Lord K'avar (M0B11Y18): reaching the hideout starts a task nothing clears, so the archer waves stop.
  M0B11Y18: () => [
    { old: 'pc at _L.00_ set _S.12_', new: 'pc at _L.00_ set _atL00_', count: 1 },
    { old: '_S.12_ task:\n\tclear _conhouse_ \n', new: '_atL00_ task:\n\tstart task _S.12_ \n\n_S.12_ task:\n\tclear _conhouse_ \n', count: 1 },
  ],
  C0B00Y02: () => {
    const entry = [`Message:  ${SHAM_TRAIL_MESSAGE}`, '%qdt:', ...entryLines(t('quest.possessedChild.shamTrail', SHAM_TRAIL_EN))].join('\n');
    return [
      // The Possessed Child (C0B00Y02): the sham branch logs an entry at the reveal that points to the tavern.
      { old: ' _qgiver_ will want the _item_ back.\n\n\n-- Symbols used in the QRC file:', new: ` _qgiver_ will want the _item_ back.\n\n${entry}\n\n\n-- Symbols used in the QRC file:`, count: 1 },
      { old: '\tplace npc _hooker_ at _tavern_ \n\tclear _talkguardian_\n', new: `\tplace npc _hooker_ at _tavern_ \n\tclear _talkguardian_\n\tlog ${SHAM_TRAIL_MESSAGE} step ${SHAM_TRAIL_STEP}\n`, count: 1 },
    ];
  },
});

export function applyQuestPatches(questName, text) {
  const patches = QUEST_PATCHES[questName];
  return patches ? applyTextPatches('QUEST-PATCH', questName, patches(), text) : text;
}
