import { isRetiredItem } from '../../items/retiredItems.js';
import { QuestResource, matchFirst } from './questResource.js';
import { Symbol as QuestSymbol } from './symbol.js';
import { parseInt as questParseInt } from './parseUtils.js';
import { itemsTable } from './tables.js';
import {
  createRegularMagicItem, createArtifact, getMagicItemTemplates,
  createPotion, createRandomPotion,
  ITEM_GROUP_NAME_BY_CLASS, BOOK_TEMPLATE,
} from '../../items/loot.js';
import { GROUP_TEMPLATE_INDICES, ITEM_TEMPLATES, mintCondition, rollPaintingMessage } from '../../items/itemTemplates.js';
import { createBook, createRandomBook } from '../../items/books.js';
import { goldStack, isGoldPieces } from '../../items/inventory.js';
import { itemLongName, shownItemName } from '../../items/itemInfo.js';
import { alterReward } from '../../guilds/guilds.js';
import { CLOTHING_DYES } from '../../characters/dyes.js';

export function makeItemPermanent(dfItem) {
  if (dfItem?.questItem) {
    dfItem.questUID = 0;
    dfItem.questSymbol = null;
    dfItem.questItem = false;
    delete dfItem.questClone;
  }
}

const DECL = [
  /(Item|item) (?<s1>[a-zA-Z0-9_.-]+) item class (?<itemClass>\d+) subclass (?<itemSubClass>\d+)/,
  /(Item|item) (?<s2>[a-zA-Z0-9_.-]+) item class (?<c2>\d+) template (?<itemTemplate>\d+)/,
  /(Item|item) (?<s3>[a-zA-Z0-9_.-]+) (?<artifact>artifact) (?<n3>[a-zA-Z0-9_.-]+)/,
  /(Item|item) (?<s4>[a-zA-Z0-9_.-]+) (?<n4>[a-zA-Z0-9_.-]+) key (?<itemKey>\d+)/,
  /(Item|item) (?<s5>[a-zA-Z0-9_.-]+) (?<n5>[a-zA-Z0-9_.-]+)/,
];
const OPTIONS = /range (?<rangeLow>\d+) to (?<rangeHigh>\d+)/g;

export class Item extends QuestResource {
  constructor(parentQuest, line = null) {
    super(parentQuest);
    this.itemName = '';
    this.itemKey = -1;
    this.itemClass = -1;
    this.itemSubClass = -1;
    this.itemTemplate = -1;
    this.artifact = false;
    this.isGold = false;
    this.rangeLow = -1;
    this.rangeHigh = -1;
    this.useClicked = false;
    this.actionWatching = false;
    this.allowDrop = false;
    this.playerDropped = false;
    this.madePermanent = false;
    this.daggerfallUnityItem = null;
    if (line !== null) this.setResource(line);
  }

  get isItem() { return true; }

  expandMacro(macroType) {
    if (macroType !== 1 && macroType !== 5) return false;
    const it = this.daggerfallUnityItem;
    if (!it) return false;
    if (this.artifact) return it.shortName ?? shownItemName(it) ?? false;
    if (isGoldPieces(it)) return String(it.stackCount ?? 0);
    const long = itemLongName(it, {
      // Quest text names a plant, not its northern variant, as in the classic engine.
      differentiatePlantIngredients: false,
      getQuest: (uid) => (uid === this.parentQuest?.uid ? this.parentQuest : null),
    });
    return long || it.name || it.shortName || false;
  }

  setResource(line) {
    super.setResource(line);
    const match = matchFirst(line, DECL);
    if (!match) return;
    const g = match.groups;
    this.symbol = new QuestSymbol(g.s1 ?? g.s2 ?? g.s3 ?? g.s4 ?? g.s5);
    this.itemName = g.n3 ?? g.n4 ?? g.n5 ?? '';
    if (g.itemClass != null || g.c2 != null) this.itemClass = questParseInt(g.itemClass ?? g.c2);
    if (g.itemSubClass != null) this.itemSubClass = questParseInt(g.itemSubClass);
    if (g.itemTemplate != null) this.itemTemplate = questParseInt(g.itemTemplate);
    if (g.artifact) this.artifact = true;
    if (g.itemKey != null) this.itemKey = questParseInt(g.itemKey);
    if (this.itemName === 'gold') this.isGold = true;

    const optionsLine = line.slice(match.index + match[0].length);
    for (const option of optionsLine.matchAll(OPTIONS)) {
      if (option.groups.rangeLow != null) this.rangeLow = questParseInt(option.groups.rangeLow);
      if (option.groups.rangeHigh != null) this.rangeHigh = questParseInt(option.groups.rangeHigh);
    }

    if (this.itemClass !== -1 && this.itemSubClass !== -1 && !this.isGold) {
      this.daggerfallUnityItem = this._createItem(this.itemClass, this.itemSubClass);
    } else if (this.itemClass !== -1 && this.itemTemplate > 0 && !this.isGold) {
      // The class and template form is not quest-linked, as in the classic engine, so it survives the quest's end.
      this.daggerfallUnityItem = this._templateItem(
        ITEM_GROUP_NAME_BY_CLASS[this.itemClass], this.itemTemplate, this._rolls());
    } else if (this.itemName && !this.isGold) {
      this.daggerfallUnityItem = this._createItemByName(this.itemName, this.itemKey);
    } else if (this.isGold) {
      this.daggerfallUnityItem = this._createGold(this.rangeLow, this.rangeHigh);
    } else {
      throw new Error(`Could not create Item from line ${line}`);
    }
  }

  makePermanent() {
    this.madePermanent = true;
    if (this.daggerfallUnityItem) makeItemPermanent(this.daggerfallUnityItem);
    this.parentQuest?.hooks?.makeHeldQuestItemsPermanent?.(this.parentQuest.uid, this.symbol);
  }

  dispose() {
    super.dispose();
    if (this.daggerfallUnityItem && this.daggerfallUnityItem.questItem) {
      this.parentQuest?.hooks?.removeItemFromPlayer?.(this.daggerfallUnityItem);
    }
  }

  _rolls() { return this.parentQuest?.rolls ?? Math.random; }

  _link(dfItem) {
    dfItem.questItem = true;
    dfItem.questUID = this.parentQuest?.uid ?? 0;
    dfItem.questSymbol = this.symbol?.clone() ?? null;
    return dfItem;
  }

  _templateItem(groupName, templateIndex, rolls) {
    const item = mintCondition({
      group: groupName, templateIndex,
      name: ITEM_TEMPLATES[templateIndex]?.name,
    });
    if (groupName === 'Paintings') item.message = rollPaintingMessage(rolls);
    return item;
  }

  _createItemByName(itemName, itemKey) {
    const table = itemsTable();
    if (!table.hasValue(itemName)) {
      throw new Error(`Could not find Item name ${itemName} in items table`);
    }
    const p1 = questParseInt(table.getValue('p1', itemName));
    const p2 = questParseInt(table.getValue('p2', itemName));
    return this._createItem(p1, p2, itemKey);
  }

  _createItem(itemClass, itemSubClass, itemKey = -1) {
    if (itemClass === -1) throw new Error(`Tried to create Item with class ${itemClass}`);
    const rolls = this._rolls();
    let result;
    // The magic item, artifact, book, and potion arms come before the random-subclass arm, in the classic order.
    if (itemClass === 4) {
      const templates = getMagicItemTemplates();
      if (templates) {
        result = createRegularMagicItem(templates,
          this.parentQuest?.hooks?.playerLevel?.() ?? 0,
          this.parentQuest?.hooks?.playerGender?.() ?? 'male',
          rolls, itemSubClass);
      } else {
        result = { group: 'MagicItems', pendingMagicDef: true, name: this.itemName || 'magic item' };
      }
    } else if (itemClass === 5) {
      const templates = getMagicItemTemplates();
      result = templates
        ? createArtifact(templates, itemSubClass,
          { gender: this.parentQuest?.hooks?.playerGender?.() ?? 'male' })
        : { group: 'Artifacts', pendingMagicDef: true, artifactIndex: itemSubClass, name: this.itemName };
    } else if (itemClass === 7) {
      result = itemKey !== -1
        ? (createBook(itemKey) ?? mintCondition({ group: 'Books', templateIndex: BOOK_TEMPLATE, message: itemKey }))
        : createRandomBook(rolls);
    } else if (itemClass === 1 && itemSubClass === 1) {
      result = itemKey !== -1 ? createPotion(itemKey) : createRandomPotion(rolls);
    } else {
      const groupName = ITEM_GROUP_NAME_BY_CLASS[itemClass];
      const groupIndices = GROUP_TEMPLATE_INDICES[groupName];
      if (!groupIndices) throw new Error(`Tried to create Item with unknown class ${itemClass}`);
      if (itemSubClass === -1) itemSubClass = Math.floor(rolls() * groupIndices.length);
      result = this._templateItem(groupName, groupIndices[itemSubClass], rolls);
    }
    if (result.group === 'MensClothing' || result.group === 'WomensClothing') {
      result.dye = CLOTHING_DYES[Math.floor(rolls() * CLOTHING_DYES.length)];
    }
    return this._link(result);
  }

  _createGold(rangeLow, rangeHigh) {
    const rolls = this._rolls();
    const hooks = this.parentQuest?.hooks;
    let amount = 0;
    if (rangeLow === -1 || rangeHigh === -1) {
      let playerMod = Math.trunc((hooks?.playerLevel?.() ?? 0) / 2) + 1;
      let factionMod = 50;
      let guild = null;
      if ((this.parentQuest?.factionId ?? 0) !== 0) {
        guild = hooks?.getGuild?.(this.parentQuest.factionId) ?? null;
        // A non-member guild record pays the base reward whatever its group; rank and bonus apply to members only.
        if (guild && !guild.isNonMember) {
          playerMod = guild.rank + 1;
          factionMod = guild.power;
        }
      }
      if (playerMod > 10) playerMod = 10;
      const regionPriceMod = Math.trunc((hooks?.regionPriceAdjustment?.() ?? 0) / 2);
      const lo = 150 * playerMod, hi = 200 * playerMod + 1;
      const draw = lo + Math.floor(rolls() * (hi - lo));
      // Each step truncates, matching the classic integer division.
      amount = Math.trunc(Math.trunc(draw * (regionPriceMod + 500) / 1000) * (factionMod + 50) / 100);
      if (guild && !guild.isNonMember) amount = alterReward(guild.guildGroup, guild.rank, amount);
    } else {
      amount = rangeLow + Math.floor(rolls() * (rangeHigh + 1 - rangeLow));
    }
    if (amount < 1) amount = 1;
    return this._link(goldStack(amount));
  }

  getSaveData() {
    return {
      artifact: this.artifact,
      useClicked: this.useClicked,
      actionWatching: this.actionWatching,
      allowDrop: this.allowDrop,
      playerDropped: this.playerDropped,
      madePermanent: this.madePermanent,
      item: this.daggerfallUnityItem ? structuredClone(this.daggerfallUnityItem) : null,
      ...(this.goldPaid ? { goldPaid: true } : {}),
    };
  }

  restoreSaveData(dataIn) {
    if (dataIn == null) return;
    this.artifact = dataIn.artifact;
    this.useClicked = dataIn.useClicked;
    this.actionWatching = dataIn.actionWatching;
    this.allowDrop = dataIn.allowDrop;
    this.playerDropped = dataIn.playerDropped;
    this.madePermanent = dataIn.madePermanent;
    this.daggerfallUnityItem = dataIn.item && !isRetiredItem(dataIn.item) ? structuredClone(dataIn.item) : null;
    this.goldPaid = dataIn.goldPaid === true;
  }
}
