// Port of the Daggerfall Unity quest parser: reads a quest source file into a Quest.

import { Quest } from './quest.js';
import { Message } from './message.js';
import { Task } from './task.js';
import { Clock } from './clock.js';
import { Item } from './item.js';
import { Person } from './person.js';
import { Place } from './place.js';
import { Foe } from './foe.js';
import { staticMessagesTable, globalVarsTable } from './tables.js';
import { getInnerSymbolName } from './symbol.js';

export { splitLine, splitField, getFieldStringValue, getFieldIntValue, parseInt } from './parseUtils.js';
export { getInnerSymbolName };
import { splitLine, splitField, getFieldStringValue, parseInt } from './parseUtils.js';

const startsWithCI = (text, prefix) => text.slice(0, prefix.length).toLowerCase() === prefix;

export class Parser {
  // Clocks and hooks go in at parse time because resources such as PlaySound and Item read them when created.
  /**
   * @param {string[]} source
   * @param {number} factionId
   * @param {object} [opts]
   */
  parse(source, factionId = 0, { partialParse = false, rolls, actionFactory, nowSeconds, skySeconds = null, worldSeconds = null, raisedSeconds = null, hooks, questClockStepMax = null } = {}) {
    const quest = new Quest({ rolls, actionFactory, nowSeconds, skySeconds, worldSeconds, raisedSeconds, hooks, questClockStepMax });
    quest.factionId = factionId;
    let inQRC = false, inQBN = false;
    const qrcLines = [], qbnLines = [];

    for (const line of source) {
      const text = line.trim();
      if (startsWithCI(text, 'quest:')) {
        quest.questName = getFieldStringValue(text);
      } else if (startsWithCI(text, 'displayname:')) {
        quest.displayName = getFieldStringValue(text);
      } else if (startsWithCI(text, 'qrc:')) {
        inQRC = true; inQBN = false; continue;
      } else if (startsWithCI(text, 'qbn:')) {
        inQRC = false; inQBN = true; continue;
      }
      if (inQRC) {
        qrcLines.push(line);
      } else if (inQBN) {
        if (text.startsWith('-')) continue;
        qbnLines.push(line);
      }
    }

    if (!quest.questName) throw new Error('Parse() error: Quest has no name.');
    if (qrcLines.length === 0) throw new Error('Parse() error: Quest has no QRC section.');
    if (qbnLines.length === 0) throw new Error('Parse() error: Quest has no QBN section.');

    if (!partialParse) {
      this._parseQRC(quest, qrcLines);
      this._parseQBN(quest, qbnLines);
    }
    return quest;
  }

  _parseQRC(quest, lines) {
    const table = staticMessagesTable();
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('-')) continue;
      if (!lines[i].trim()) continue;

      const parts = splitField(lines[i]);
      if (table.hasValue(parts[0])) {
        let messageID = 0;
        if (parts[1].startsWith('[') && parts[1].endsWith(']')) {
          messageID = table.getInt('id', parts[0]);
          if (messageID === -1) throw new Error(`Could not parse text '${table.getInt('id', parts[0])}' to an int. Expected message ID value.`);
        } else {
          if (!/^-?\d+$/.test(parts[1])) throw new Error(`Could not parse text '${parts[1]}' to an int. Expected message ID value.`);
          messageID = Number.parseInt(parts[1], 10);
        }

        const messageLines = [];
        for (;;) {
          if (i + 1 >= lines.length) break;
          const text = lines[++i].replace(/\r+$/, '');
          if (!text) {
            if (!this._peekMessageEnd(lines, i)) { messageLines.push(' '); continue; }
            break;
          }
          messageLines.push(text);
        }

        quest.addMessage(messageID, new Message(quest, messageID, messageLines));
      } else {
        throw new Error(`Could not parse message block near '${lines[i]}'. Check message header syntax, spelling, and casing are all correct.`);
      }
    }
  }

  _peekMessageEnd(lines, line) {
    if (line + 1 >= lines.length) return true;
    const nextLine = lines[line + 1];
    return nextLine.includes(':') || nextLine.startsWith('-') || !nextLine.trim();
  }

  _parseQBN(quest, lines) {
    let foundHeadlessTask = false;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      // Dispatches on the raw line, as Daggerfall Unity does, so an indented clock line is a task, not a clock.
      if (startsWithCI(lines[i], 'clock')) {
        quest.addResource(new Clock(quest, lines[i]));
      } else if (startsWithCI(lines[i], 'item')) {
        quest.addResource(new Item(quest, lines[i]));
      } else if (startsWithCI(lines[i], 'person')) {
        quest.addResource(new Person(quest, lines[i]));
      } else if (startsWithCI(lines[i], 'foe')) {
        quest.addResource(new Foe(quest, lines[i]));
      } else if (startsWithCI(lines[i], 'place')) {
        quest.addResource(new Place(quest, lines[i]));
      } else if (startsWithCI(lines[i], 'variable')) {
        quest.addTask(new Task(quest, [lines[i]]));
      } else if (lines[i].includes('task:')
        || (startsWithCI(lines[i], 'until') && lines[i].includes('performed:'))) {
        quest.addTask(new Task(quest, this._readBlock(lines, (n) => { i = n; }, i)));
      } else if (this._isGlobalReference(lines[i])) {
        let hasBody = false;
        if (i + 1 !== lines.length) hasBody = !this._isNewTaskOrLineBreak(lines[i + 1]);
        const globalVar = this._getGlobalReference(lines[i]);
        const taskLines = hasBody ? this._readBlock(lines, (n) => { i = n; }, i) : [lines[i]];
        quest.addTask(new Task(quest, taskLines, globalVar));
      } else if (foundHeadlessTask === false) {
        // The first unrecognized block is the headless startup task; a second one throws, as in Daggerfall Unity.
        quest.addTask(new Task(quest, this._readBlock(lines, (n) => { i = n; }, i)));
        foundHeadlessTask = true;
      } else {
        throw new Error(`Unknown line signature encounted '${lines[i]}'.`);
      }
    }
  }

  _isNewTaskOrLineBreak(line) {
    return startsWithCI(line, 'variable')
      || line.includes('task:')
      || (startsWithCI(line, 'until') && line.includes('performed:'))
      || this._isGlobalReference(line)
      || !line.trim();
  }

  _readBlock(linesIn, setLine, currentLine) {
    const linesOut = [];
    for (;;) {
      linesOut.push(linesIn[currentLine].replace(/^\t+|\t+$/g, ''));
      if (currentLine + 1 >= linesIn.length) break;
      const text = linesIn[++currentLine].trim();
      if (!text) break;
    }
    setLine(currentLine);
    return linesOut;
  }

  _isGlobalReference(line) {
    const parts = splitLine(line);
    if (!parts.length) return false;
    return globalVarsTable().hasValue(parts[0]);
  }

  _getGlobalReference(line) {
    const parts = splitLine(line);
    if (!parts.length) return -1;
    if (globalVarsTable().hasValue(parts[0])) {
      return parseInt(globalVarsTable().getValue('id', parts[0]));
    }
    return -1;
  }
}
