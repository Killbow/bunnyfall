// Reads a translation pack's -LOC quest text (display name and QRC messages) the way Daggerfall Unity does.
// English has no -LOC file, so English quests read their own source text.

import { localeDocument, localeTable, tryGetLocalizedText, runtimeCollectionName, currentLocale, textRevision, TextCollections } from '../../ui/textManager.js';
import { staticMessagesTable } from './tables.js';
import { splitField, getFieldStringValue } from './parseUtils.js';

export const QUEST_DOCUMENT = 'quest';
const startsWithCI = (text, prefix) => text.slice(0, prefix.length).toLowerCase() === prefix;

function peekMessageEnd(lines, line) {
  if (line + 1 >= lines.length) return true;
  const next = lines[line + 1];
  return next.includes(':') || next.startsWith('-') || !next.trim();
}

// Mirrors Daggerfall Unity's localized quest parser, including each case where it throws.
export function parseLocalizedQuest(lines) {
  if (!lines?.length) return null;
  let displayName = '';
  const messages = new Map();
  let inQRC = false, inQBN = false;
  const table = staticMessagesTable();
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();
    if (!text || text.startsWith('-')) continue;
    if (startsWithCI(text, 'quest:')) continue;
    if (startsWithCI(text, 'displayname:')) { displayName = getFieldStringValue(text); continue; }
    if (startsWithCI(text, 'qrc:')) inQRC = true;
    else if (startsWithCI(text, 'qbn:')) inQBN = true;
    if (!inQRC || inQBN) continue;
    const parts = splitField(lines[i]);
    if (!parts?.length || !table.hasValue(parts[0])) continue;
    let id;
    if (parts[1].startsWith('[') && parts[1].endsWith(']')) {
      id = table.getInt('id', parts[0]);
      if (id === -1) throw new Error(`Could not parse localized quest message ID '${id}' to an int. Expected message ID value.`);
    } else {
      if (!/^\s*[+-]?\d+\s*$/.test(parts[1])) throw new Error(`Could not parse localized quest message ID '${parts[1]}' to an int. Expected message ID value.`);
      id = Number.parseInt(parts[1], 10);
    }
    let messageLines = '';
    for (;;) {
      if (i + 1 >= lines.length) break;
      const textLine = lines[++i].replace(/\r+$/, '');
      if (!textLine) {
        if (!peekMessageEnd(lines, i)) { messageLines += ' \n'; continue; }
        break;
      }
      messageLines += textLine + '\n';
    }
    if (messages.has(id)) throw new Error('An item with the same key has already been added.');
    messages.set(id, messageLines.replace(/\n+$/, ''));
  }
  return { displayName, messages };
}

const _parsed = new Map();
let _revision = -1;
const questKey = (questName) => String(questName ?? '').replace(/\.txt$/i, '').toUpperCase();

export function parseLocalizedQuestText(questName) {
  if (_revision !== textRevision()) { _parsed.clear(); _revision = textRevision(); }
  const name = questKey(questName);
  const key = `${currentLocale()}|${name}`;
  if (_parsed.has(key)) return _parsed.get(key);
  let entry = null;
  const doc = localeDocument(QUEST_DOCUMENT, name);
  if (doc) {
    let parsed = null;
    try { parsed = parseLocalizedQuest(doc.split('\n')); } catch (err) { console.error(`Parsing localized quest \`${name}-LOC.txt\` FAILED!\r\n${err?.message ?? err}`); }
    if (parsed && !parsed.displayName) console.error(`Localized quest '${name}-LOC.txt' has a null or empty DisplayName: value.`);
    else if (parsed && !parsed.messages.size) console.error(`Localized quest '${name}-LOC.txt' parsed no valid messages. Check source file is a valid format.`);
    else if (parsed) {
      const table = localeTable(currentLocale(), runtimeCollectionName(TextCollections.TextQuests), { create: true });
      for (const [id, text] of parsed.messages) {
        const k = `${name}.${id}`;
        if (!table.has(k)) table.set(k, text);
      }
      entry = { displayName: parsed.displayName };
    }
  }
  _parsed.set(key, entry);
  return entry;
}

export const localizedQuestDisplayName = (questName) => parseLocalizedQuestText(questName)?.displayName ?? '';

export function localizedQuestMessage(questName, id) {
  parseLocalizedQuestText(questName);
  const v = tryGetLocalizedText(TextCollections.TextQuests, `${questKey(questName)}.${id}`);
  return v === undefined ? null : String(v).split('\n');
}
