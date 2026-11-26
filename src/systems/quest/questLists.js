import { Table } from './table.js';
import { intTryParse } from './parseUtils.js';
import { GUILD_GROUPS, SOCIAL_GROUPS } from '../../formats/factionFile.js';

export const MEMBERSHIP_STATUS = Object.freeze({
  Nonmember: 'N', Member: 'M', Prospect: 'P',
  Akatosh: 'T', Arkay: 'A', Dibella: 'D', Julianos: 'J',
  Kynareth: 'K', Mara: 'R', Stendarr: 'S', Zenithar: 'Z',
});

export const isMainQuestName = (questName) => /^S0000/.test(questName ?? '') || questName === '_BRISIEN';

const INIT_AT_GAME_START = 'InitAtGameStart';

const _questLists = [];
const _questListGates = new Map();
// A list whose gate returns false is skipped when the manager loads, so a toggle applies on the next load.
export function registerQuestList(name, isOn = null) {
  if (_questLists.includes(name)) return false;
  _questLists.push(name);
  if (typeof isOn === 'function') _questListGates.set(name, isOn);
  return true;
}
export const registeredQuestLists = () => _questLists.filter((n) => _questListGates.get(n)?.() ?? true);
export function _resetQuestLists() { _questLists.length = 0; _questListGates.clear(); }

export class QuestListsManager {
  constructor(deps = {}) {
    this.deps = deps;
    this.guilds = new Map();
    this.social = new Map();
    this.init = [];
    this.oneTimeQuestsAccepted = null;
    this.loadQuestLists();
  }

  loadQuestLists() {
    this.guilds.clear();
    this.social.clear();
    this.init.length = 0;
    this._loadQuestList('Classic');
    this._loadQuestList('DFU');
    for (const questList of registeredQuestLists()) this._loadQuestList(questList);
  }

  _loadQuestList(name) {
    const text = this.deps.readListTable?.(name);
    if (text == null) { console.warn(`[quest] Quest list ${name} not found`); return; }
    try {
      this._parseQuestList(new Table(text));
    } catch (e) {
      console.warn(`[quest] Unable to parse quest list table ${name}: ${e?.message ?? e}`);
    }
  }

  _parseQuestList(table) {
    for (let i = 0; i < table.rowCount; i++) {
      const minReq = intTryParse(table.getValue('minReq', i));
      if (minReq === null) continue;
      const flag = table.getValue('flag', i)[0];
      const questData = {
        name: table.getValue('name', i),
        group: table.getValue('group', i),
        membership: table.getValue('membership', i)[0],
        minReq,
        oneTime: flag === '1',
        adult: flag === 'X',
      };
      if (Object.hasOwn(GUILD_GROUPS, questData.group)) {
        const id = GUILD_GROUPS[questData.group];
        if (!this.guilds.has(id)) this.guilds.set(id, []);
        this.guilds.get(id).push(questData);
      } else if (Object.hasOwn(SOCIAL_GROUPS, questData.group)) {
        const id = SOCIAL_GROUPS[questData.group];
        if (!this.social.has(id)) this.social.set(id, []);
        this.social.get(id).push(questData);
      } else if (questData.group === INIT_AT_GAME_START) {
        this.init.push(questData);
      }
    }
  }

  findQuestMeta(questName) {
    for (const quest of this.init) if (quest.name === questName) return { scope: 'init', quest };
    for (const [group, pool] of this.guilds) {
      for (const quest of pool) if (quest.name === questName) return { scope: 'guild', group, quest };
    }
    for (const [group, pool] of this.social) {
      for (const quest of pool) if (quest.name === questName) return { scope: 'social', group, quest };
    }
    return null;
  }

  // The quest source comes first, as Daggerfall Unity checks its quest source folder before the lists.
  getQuest(questName, factionId = 0) {
    if (this.deps.getQuestSourceLines?.(questName)) {
      return this.loadQuest({ name: questName }, factionId);
    }
    for (const questData of this.init) {
      if (questData.name === questName) return this.loadQuest(questData, factionId);
    }
    for (const pool of this.guilds.values()) {
      for (const questData of pool) {
        if (questData.name === questName) return this.loadQuest(questData, factionId);
      }
    }
    for (const pool of this.social.values()) {
      for (const questData of pool) {
        if (questData.name === questName) return this.loadQuest(questData, factionId);
      }
    }
    return null;
  }

  getGuildQuest(guildGroup, status, factionId, rep, rank) {
    const pool = this.getGuildQuestPool(guildGroup, status, factionId, rep, rank);
    return this.selectQuest(pool, factionId);
  }

  getGuildQuestPool(guildGroup, status, _factionId, rep, rank) {
    if (this.oneTimeQuestsAccepted == null) this.oneTimeQuestsAccepted = [];
    const guildQuests = this.guilds.get(guildGroup);
    if (!guildQuests) return null;
    const tplMemb = (guildGroup === GUILD_GROUPS.HolyOrder && status !== MEMBERSHIP_STATUS.Nonmember)
      ? MEMBERSHIP_STATUS.Member : status;
    const pool = [];
    for (const quest of guildQuests) {
      if ((status === quest.membership || tplMemb === quest.membership)
        && ((status === MEMBERSHIP_STATUS.Nonmember && quest.minReq === 0)
          || (quest.minReq < 10 && quest.minReq <= rank)
          || (quest.minReq >= 10 && quest.minReq <= rep))) {
        if ((!quest.adult || this.deps.playerNudity)
          && !(quest.oneTime && this.oneTimeQuestsAccepted.includes(quest.name))) {
          pool.push(quest);
        }
      }
    }
    return pool;
  }

  getSocialQuest(socialGroup, factionId, gender, rep, level) {
    if (this.oneTimeQuestsAccepted == null) this.oneTimeQuestsAccepted = [];
    const socialQuests = this.social.get(socialGroup);
    if (!socialQuests) return null;
    const pool = [];
    for (const quest of socialQuests) {
      if (((quest.minReq < 10 && quest.minReq <= level) || rep >= quest.minReq)
        && (quest.membership === 'N'
          || (quest.membership === 'M' && gender === 'male')
          || (quest.membership === 'F' && gender === 'female'))) {
        if ((!quest.adult || this.deps.playerNudity)
          && !(quest.oneTime && this.oneTimeQuestsAccepted.includes(quest.name))) {
          pool.push(quest);
        }
      }
    }
    return this.selectQuest(pool, factionId);
  }

  selectQuest(pool, factionId) {
    if (pool && pool.length > 0) {
      const roll = this.deps.rolls ?? Math.random;
      const questData = pool[Math.floor(roll() * pool.length)];
      try {
        return this.loadQuest(questData, factionId);
      } catch (e) {
        console.warn(`[quest] Exception for quest ${questData.name} during quest compile: ${e?.message ?? e}`);
      }
    }
    return null;
  }

  loadQuest(questData, factionId, partialParse = false) {
    const lines = this.deps.getQuestSourceLines?.(questData.name);
    if (!lines) throw new Error(`Quest file ${questData.name} not found.`);
    const quest = this.deps.parseQuest?.(lines, factionId, partialParse);
    if (!quest) return null;
    quest.oneTime = !!questData.oneTime;
    return quest;
  }

  // Each quest starts immediately, not scheduled, so it is live before this returns, as in Daggerfall Unity.
  initAtGameStartQuests(startQuestImmediate) {
    for (const questData of this.init) {
      const quest = this.loadQuest(questData, 0);
      if (!quest) continue;
      startQuestImmediate(quest);
    }
  }

  noteQuestStarted(quest) {
    if (quest.oneTime && this.oneTimeQuestsAccepted != null) {
      this.oneTimeQuestsAccepted.push(quest.questName);
    }
  }

  // A share can land before any pool creates the one-time list, so this creates it; noteQuestStarted only
  // pushes once the list exists.
  markOneTimeAccepted(questName) {
    if (this.oneTimeQuestsAccepted == null) this.oneTimeQuestsAccepted = [];
    if (!this.oneTimeQuestsAccepted.includes(questName)) this.oneTimeQuestsAccepted.push(questName);
  }

  hasAcceptedOneTime(questName) {
    return !!this.oneTimeQuestsAccepted?.includes(questName);
  }
}
