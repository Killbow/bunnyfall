// Port of the Daggerfall Unity quest message: a <ce> prefix centers a line, and <---> starts a new variant.

import { expandQuestMessage } from './questMacros.js';

const CENTER_TOKEN = '<ce>';
const SPLIT_TOKEN = '<--->';

export const Formatting = Object.freeze({
  Nothing: 'nothing',
  Text: 'text',
  JustifyCenter: 'center',
});

export class Message {
  constructor(parentQuest, id = 0, source = null) {
    this.parentQuest = parentQuest;
    this.id = 0;
    this.variants = [];
    this.ownLines = null;
    if (source) this.loadMessage(id, source);
  }

  get variantCount() { return this.variants.length; }

  loadMessage(id, source) {
    this.id = id;
    this.variants = [];
    let variant = { tokens: [] };
    for (let i = 0; i < source.length; i++) {
      let line = source[i];

      let formatting = Formatting.Nothing;
      if (line.startsWith(CENTER_TOKEN)) {
        formatting = Formatting.JustifyCenter;
        line = line.replaceAll(CENTER_TOKEN, '');
      }

      line = formatting === Formatting.Nothing ? line.replace(/\s+$/, '') : line.trim();

      if (line.includes(SPLIT_TOKEN)) {
        this.variants.push(variant);
        variant = { tokens: [] };
        continue;
      }

      variant.tokens.push({ formatting: Formatting.Text, text: line });
      variant.tokens.push({ formatting, text: '' });
    }
    this.variants.push(variant);
  }

  // As in Daggerfall Unity, any explicit variant returns variant 0; getTextTokensByVariant picks a real one.
  // revealDialogLinks is false only for a read on the player's behalf, which must not open talk topics.
  getTextTokens(variant = -1, roll = Math.random, expandMacros = true, revealDialogLinks = true) {
    const index = variant === -1 ? Math.floor(roll() * this.variantCount) : 0;
    const tokens = this.variants[index].tokens.map((t) => ({ ...t }));
    // Setting currentLogMessageId during expansion lets %qdt in a log message return the date of that step.
    if (expandMacros) {
      const quest = this.parentQuest;
      // There is no try/finally, as in Daggerfall Unity, so a throwing expansion leaves the id set.
      if (quest) quest.currentLogMessageId = this.id;
      expandQuestMessage(quest, tokens, revealDialogLinks);
      if (quest) quest.currentLogMessageId = -1;
    }
    return tokens;
  }

  getTextTokensByVariant(variant = 0, expandMacros = true) {
    const tokens = this.variants[variant].tokens.map((t) => ({ ...t }));
    if (expandMacros) expandQuestMessage(this.parentQuest, tokens, false);
    return tokens;
  }

  // Saves hold the quest's own lines, not the translation, so each language reads its own text again after a load.
  localize(lines) {
    if (!this.ownLines) this.ownLines = this.getSaveData().lines;
    this.loadMessage(this.id, lines);
  }
  ownText() {
    if (!this.ownLines) return;
    const own = this.ownLines;
    this.ownLines = null;
    this.loadMessage(this.id, own);
  }

  getSaveData() {
    if (this.ownLines) return { id: this.id, lines: [...this.ownLines] };
    const lines = [];
    for (let variant = 0; variant < this.variants.length; variant++) {
      if (variant > 0) lines.push(SPLIT_TOKEN);
      let foundText = false;
      let currentLine = '';
      for (const token of this.variants[variant].tokens) {
        switch (token.formatting) {
          case Formatting.Text:
            if (foundText) {
              lines.push(currentLine);
              currentLine = '';
              foundText = false;
              continue;
            }
            currentLine += token.text;
            foundText = true;
            break;
          case Formatting.JustifyCenter:
            currentLine = CENTER_TOKEN + currentLine;
            lines.push(currentLine);
            currentLine = '';
            foundText = false;
            break;
          case Formatting.Nothing:
            lines.push(currentLine);
            currentLine = '';
            foundText = false;
            continue;
          default:
            throw new Error(`Message.GetSaveData() encountered unexpected formatting token ${token.formatting}`);
        }
      }
    }
    return { id: this.id, lines };
  }

  restoreSaveData(data) {
    this.ownLines = null;
    this.loadMessage(data.id, data.lines);
  }
}
