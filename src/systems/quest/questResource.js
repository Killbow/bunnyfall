// Tick does nothing until a scene behavior is linked, as in C#.
// C# alternations reuse one group name, which a JS RegExp cannot, so matchFirst takes an ordered pattern list
// and returns the leftmost match, ties to pattern order, as .NET does.

import { symbolToSaveData, symbolFromSaveData } from './symbol.js';
import { staticMessagesTable } from './tables.js';
import { parseInt as questParseInt } from './parseUtils.js';

export function matchFirst(line, patterns) {
  let best = null, bestIndex = Infinity;
  for (const p of patterns) {
    const m = p.exec(line);
    if (m && m.index < bestIndex) { best = m; bestIndex = m.index; }
  }
  return best;
}

const MESSAGE_TAGS = /anyInfo (?<info>\d+)|used (?<used>\d+)|rumors (?<rumors>\d+)|anyInfo (?<infoName>\w+)|used (?<usedName>\w+)|rumors (?<rumorsName>\w+)/g;

export class QuestResource {
  constructor(parentQuest) {
    this.parentQuest = parentQuest;
    this.symbol = null;
    this.infoMessageID = -1;
    this.usedMessageID = -1;
    this.rumorsMessageID = -1;
    this._isHidden = false;
    this.hasPlayerClicked = false;
    // The destroy handler keeps one identity so the subscribe and unsubscribe calls match.
    this._questResourceBehaviour = null;
    this._onBehaviourDestroyed = (behaviour) => {
      // C# never clears the field (its parameter shadows it). Clear it only while it is still this behavior, so a
      // late destroy of an old behavior cannot drop a newer link.
      this.uncoupleBehaviour(behaviour);
    };
  }

  uncoupleBehaviour(behaviour) {
    behaviour.offDestroy(this._onBehaviourDestroyed);
    if (this._questResourceBehaviour === behaviour) this._questResourceBehaviour = null;
  }

  get questResourceBehaviour() { return this._questResourceBehaviour; }
  set questResourceBehaviour(value) {
    this._questResourceBehaviour = value;
    value.onDestroy(this._onBehaviourDestroyed);
  }

  get isHidden() { return this._isHidden; }
  set isHidden(value) { this._isHidden = value; }

  setResource(line) {
    this._parseMessageTags(line);
  }

  tick(_caller) {
    if (!this.questResourceBehaviour) return;
    if (this.isFoe) return;
    if (this.isPerson && this.isDestroyed) this.isHidden = true;
    this.questResourceBehaviour.setGameObjectActive(!this.isHidden);
  }

  postTick(_caller) {
    this.rearmPlayerClick();
  }

  expandMacro(_macroType) { return false; }

  getMessage(messageId) {
    const message = this.parentQuest?.getMessage(messageId);
    if (!message) return null;
    const tokenList = [];
    for (let i = 0; i < message.variants.length; i++) {
      tokenList.push(message.getTextTokensByVariant(i, false));
    }
    return tokenList;
  }

  get gender() { return 0; }

  dispose() {}

  // Derived from the is* flags so a minifying build cannot rename it.
  get resourceTypeName() {
    if (this.isPerson) return 'Person';
    if (this.isPlace) return 'Place';
    if (this.isItem) return 'Item';
    if (this.isFoe) return 'Foe';
    if (this.isClock) return 'Clock';
    return 'QuestResource';
  }

  // rumorsMessageID is never written or restored, as in C#, so a loaded resource's rumors id resets to -1.
  getResourceSaveData() {
    return {
      type: this.resourceTypeName,
      symbol: symbolToSaveData(this.symbol),
      infoMessageID: this.infoMessageID,
      usedMessageID: this.usedMessageID,
      rumorsMessageID: 0,
      hasPlayerClicked: this.hasPlayerClicked,
      isHidden: this.isHidden,
      resourceSpecific: this.getSaveData(),
    };
  }

  restoreResourceSaveData(data) {
    this.symbol = symbolFromSaveData(data.symbol);
    this.infoMessageID = data.infoMessageID;
    this.usedMessageID = data.usedMessageID;
    this.hasPlayerClicked = data.hasPlayerClicked;
    this.isHidden = data.isHidden;
    this.restoreSaveData(data.resourceSpecific);
  }

  getSaveData() { return null; }
  restoreSaveData(_dataIn) {}

  setPlayerClicked() {
    if (this.isPerson && (this.isMuted || this.isDestroyed)) {
      console.warn(`[quest] Ignoring click on muted or destroyed Person ${this.symbol?.original}.`);
      return;
    }
    this.hasPlayerClicked = true;
  }

  rearmPlayerClick() { this.hasPlayerClicked = false; }

  _parseMessageTags(line) {
    const matches = [...line.matchAll(MESSAGE_TAGS)];
    for (const match of matches) {
      const g = match.groups;
      if (g.info) this.infoMessageID = questParseInt(g.info);
      if (this.infoMessageID === -1 && g.infoName) {
        this.infoMessageID = questParseInt(staticMessagesTable().getValue('id', g.infoName));
      }
      if (g.used) this.usedMessageID = questParseInt(g.used);
      if (this.usedMessageID === -1 && g.usedName) {
        this.usedMessageID = questParseInt(staticMessagesTable().getValue('id', g.usedName));
      }
      if (g.rumors) this.rumorsMessageID = questParseInt(g.rumors);
      if (this.rumorsMessageID === -1 && g.rumorsName) {
        this.rumorsMessageID = questParseInt(staticMessagesTable().getValue('id', g.rumorsName));
      }
    }
  }
}
