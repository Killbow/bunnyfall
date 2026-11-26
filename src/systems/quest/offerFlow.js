// Headless port of the Daggerfall Unity quest offer windows for social, guild, coven, and named offers.
// Each entry returns a step descriptor that the UI host renders.

import { MEMBERSHIP_STATUS } from './questLists.js';
import { QUEST_MESSAGES } from './quest.js';
import { GUILD_GROUPS } from '../../formats/factionFile.js';
import { GENDERS } from '../../characters/nameHelper.js';
import { localizedText } from '../../ui/textManager.js';
import { reputeGated } from './onlineRepute.js';

export const FAIL_QUEST_FLAVOUR_ID = 600;
export const GETTING_QUESTS_1 = 'Hmm, let me see what tasks we have available.';
export const GETTING_QUESTS_2 = 'Please have patience and wait here a moment, %pcf.';
export const ACTIVE_QUESTOR = 'activeQuestor';

// Daggerfall Unity closes silently on an active questor; this close names the open quest so the popup can say why.
export function questorBusy(machine) {
  return { kind: 'close', reason: ACTIVE_QUESTOR, quest: machine.lastNPCClickedQuestorOf?.()?.quest ?? null };
}

export class QuestOfferFlow {
  constructor(machine, questLists, deps = {}) {
    this.machine = machine;
    this.questLists = questLists;
    this.deps = deps;
    this.offeredQuest = null;
    this.questPool = null;
    this.menu = false;
    this._guild = null;
    this._guildCtx = null;
  }

  // A load calls this, because an offer parsed in the replaced game must not start in the loaded one.
  reset() {
    this.offeredQuest = null;
    this.questPool = null;
    this.menu = false;
    this._guild = null;
    this._guildCtx = null;
  }

  offerSocialQuest(npcData, socialGroup, menu = false) {
    this.offeredQuest = null;
    this.questPool = null;
    this._guild = null;
    this.menu = menu;
    if (!this.deps.isPlayerInsideCastle?.()) this.deps.removeNpcQuestor?.(npcData.nameSeed);
    if (this.machine.isLastNPCClickedAnActiveQuestor()) return { kind: 'close' };
    const factionId = npcData.factionID;
    const gender = npcData.gender === GENDERS.Female ? 'female' : 'male';
    const reputation = this.machine.deps.getReputation?.(factionId) ?? 0;
    const level = this.machine.deps.playerLevel?.() ?? 0;
    this.offeredQuest = this.questLists.getSocialQuest(socialGroup, factionId, gender, reputation, level);
    if (this.offeredQuest) {
      const prompt = this.machine.createMessagePrompt(this.offeredQuest, QUEST_MESSAGES.QuestorOffer);
      // As in Daggerfall Unity, a missing offer message shows nothing and the drawn quest never starts.
      if (!prompt) return { kind: 'close' };
      return { kind: 'offer', prompt, respond: (yes) => this._offerResponse(yes) };
    }
    if (!this.deps.isPlayerInsideCastle?.()) return this._failGetQuestMessage();
    return { kind: 'close' };
  }

  offerNamedQuest(questName, factionId = 0) {
    this.offeredQuest = null;
    this.menu = false;
    this._guild = null;
    this._guildCtx = { guildGroup: null, buildingFactionId: factionId };
    this.offeredQuest = this.questLists.getQuest(questName, factionId);
    // A null quest returns no step at all, so the daedra summoning reads it as no quest before it spends gold.
    if (!this.offeredQuest) return null;
    return this._offerQuest();
  }

  offerCovenQuest(factionId, reputation = 0) {
    this.offeredQuest = null;
    this.questPool = null;
    this.menu = false;
    this._guild = null;
    this._guildCtx = { guildGroup: GUILD_GROUPS.Witches, buildingFactionId: factionId };
    if (this.machine.isLastNPCClickedAnActiveQuestor()) return questorBusy(this.machine);
    const level = this.machine.deps.playerLevel?.() ?? 0;
    this.offeredQuest = this.questLists.getGuildQuest(
      GUILD_GROUPS.Witches, MEMBERSHIP_STATUS.Nonmember, factionId, reputation, level);
    return this._offerQuest();
  }

  offerGuildQuest({ guildGroup, guild, buildingFactionId = 0 }) {
    this.offeredQuest = null;
    this.menu = false;
    this._guild = guild;
    this._guildCtx = { guildGroup, buildingFactionId };
    if (this.machine.isLastNPCClickedAnActiveQuestor(guild)) return questorBusy(this.machine);
    let status = guild.isMember() ? MEMBERSHIP_STATUS.Member : MEMBERSHIP_STATUS.Nonmember;
    if (guild.isMember() && guildGroup === GUILD_GROUPS.HolyOrder) {
      status = MEMBERSHIP_STATUS[guild.deity];
      if (status == null) throw new Error(`Requested value '${guild.deity}' was not found.`);
    }
    const factionId = this._getFactionIdForGuild();
    let rank = guild.rank;
    const level = this.machine.deps.playerLevel?.() ?? 0;
    if (guild.isSatisfyQuestReqByLevel?.() && level > rank) rank = level;
    this.questPool = reputeGated(this.questLists.getGuildQuestPool(guildGroup, status, factionId, guild.getReputation(), rank),
      guild.getReputation(), !!this.deps.sharedClock?.());
    if (this.deps.guildQuestListBox && !this.questPool?.length) return this._failGetQuestMessage();
    if (this.deps.guildQuestListBox) {
      return {
        kind: 'gettingQuests',
        textLines: [localizedText('gettingQuests1', GETTING_QUESTS_1), localizedText('gettingQuests2', GETTING_QUESTS_2)],
        clickAnywhereToClose: true,
        onClose: () => this._gettingQuestsBoxClose(),
      };
    }
    this.offeredQuest = this.questLists.selectQuest(this.questPool, factionId);
    return this._offerQuest();
  }

  _getFactionIdForGuild() {
    const { guildGroup, buildingFactionId } = this._guildCtx;
    return (guildGroup === GUILD_GROUPS.HolyOrder || guildGroup === GUILD_GROUPS.KnightlyOrder)
      ? buildingFactionId : (this.deps.getGuildFactionId?.(guildGroup) ?? 0);
  }

  _offerQuest() {
    let step = null;
    if (this.offeredQuest) {
      // The guild goes in as the { quest, source } bundle the macro engine reads, so its source stays visible.
      if (this._guild?.isMember()) {
        this.offeredQuest.externalMCP = this._guild.source
          ? { quest: this.offeredQuest, source: this._guild.source }
          : this._guild;
      }
      const prompt = this.machine.createMessagePrompt(this.offeredQuest, QUEST_MESSAGES.QuestorOffer);
      if (prompt) step = { kind: 'offer', prompt, respond: (yes) => this._offerResponse(yes) };
    } else {
      step = this._failGetQuestMessage();
    }
    if (this.questPool) this.questPool.length = 0;
    return step;
  }

  // As in Daggerfall Unity, failed rows are removed by original index, so a second failure can hit the wrong row.
  _gettingQuestsBoxClose() {
    const factionId = this._getFactionIdForGuild();
    const entries = [];
    const failures = [];
    for (let i = 0; i < this.questPool.length; i++) {
      try {
        const quest = this.questLists.loadQuest(this.questPool[i], factionId, true);
        let displayName = quest.displayName;
        const localized = this.deps.getLocalizedQuestDisplayName?.(quest.questName);
        if (localized) displayName = localized;
        entries.push(displayName ?? quest.questName);
      } catch {
        failures.push(i);
      }
    }
    for (const i of failures) {
      if (i >= this.questPool.length) throw new Error('Index was out of range. Must be non-negative and less than the size of the collection.');
      this.questPool.splice(i, 1);
    }
    if (!entries.length) return this._failGetQuestMessage();
    return { kind: 'pickQuest', entries, onPick: (index) => this._questPicked(index) };
  }

  _questPicked(index) {
    if (!this.questPool) return null;
    if (index < this.questPool.length) {
      this.offeredQuest = this.questLists.loadQuest(this.questPool[index], this._getFactionIdForGuild());
      return this._offerQuest();
    }
    return null;
  }

  _offerResponse(yes) {
    if (!this.offeredQuest) return { kind: 'close' };
    if (yes) {
      // The AcceptQuest tokens are drawn before the quest starts, while questStartTime is still unset.
      const popup = this._showQuestPopupMessage(this.offeredQuest, QUEST_MESSAGES.AcceptQuest);
      this.machine.startQuestImmediate(this.offeredQuest);
      return { kind: 'accepted', popup, quest: this.offeredQuest };
    }
    const md = this.machine.deps;
    md.removeQuestInfoTopics?.(this.offeredQuest.uid);
    md.removeQuestRumors?.(this.offeredQuest.uid);
    md.removeProgressRumors?.(this.offeredQuest.uid);
    return { kind: 'refused', popup: this._showQuestPopupMessage(this.offeredQuest, QUEST_MESSAGES.RefuseQuest, false) };
  }

  _showQuestPopupMessage(quest, id, exitOnClose = true) {
    const message = quest.getMessage(id);
    if (!message) return null;
    return {
      tokens: message.getTextTokens(-1, quest.rolls),
      mcp: this.offeredQuest.externalMCP ?? null,
      clickAnywhereToClose: true,
      allowCancel: true,
      exitOnClose,
    };
  }

  _failGetQuestMessage() {
    return {
      kind: 'fail',
      textId: FAIL_QUEST_FLAVOUR_ID,
      random: true,
      clickAnywhereToClose: true,
      allowCancel: true,
    };
  }
}
