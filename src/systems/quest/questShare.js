// Each party member holds an independent copy of a shared quest, rebuilt from the sender's save envelope and kept
// equal by resyncs while partied. The receiver mints its own uid, since uids come from each machine's counter.

import { MEMBERSHIP_STATUS, isMainQuestName } from './questLists.js';
import { TaskType } from './task.js';
import { getInnerSymbolName } from './symbol.js';
import { sharedActionMatches, takeLocalActions } from './shareActions.js';
import { GUILDS, hasJoined } from '../../guilds/guilds.js';
import { QUEST_FRAME_MAX } from '../../net/wire.js';
import { BUILD_TAG } from '../../buildTag.js';
import { relayQuestOnline, relayQuestMovedLayout } from './questRepair.js';
import { isOnlinePage } from '../../platform/onlineLane.js';
import { isShelved } from './quest.js';
import { lineStepOf } from '../questlines/qlLines.js';
import { QL_STAMP } from '../questlines/qlState.js';
import { t } from '../../ui/textManager.js';
import { ONLINE_REPUTE_GATES } from './onlineRepute.js';

export const QUEST_SHARE_MAX_BYTES = QUEST_FRAME_MAX - 512;

export function prepareQuestShare(machine, uid) {
  const prepared = prepareShareData(machine.getShareableQuestData(uid));
  // A copy unchanged since it arrived answers its first sync as held, so it never undoes the sharer's progress.
  const quest = machine.quests?.get?.(Number(uid));
  if (prepared.ok && quest?._heldSig !== undefined) {
    if (quest._heldSig === shareSignature(quest)) prepared.data = { ...prepared.data, held: 1 };
    else delete quest._heldSig;
  }
  return prepared;
}

export function prepareShareData(data) {
  if (!data) return { ok: false, reason: 'gone' };
  if (isMainQuestName(data.questName)) return { ok: false, reason: 'mainQuest' };
  if (lineStepOf(data.questName)) return { ok: false, reason: 'questline' };
  const slim = slimShareMarkers({ ...data, build: BUILD_TAG });
  const text = JSON.stringify(slim);
  if (text.length > QUEST_SHARE_MAX_BYTES) return { ok: false, reason: 'tooLarge' };
  return { ok: true, questName: slim.questName, displayName: slim.displayName, data: slim };
}

// Kills, give pc, end quest, and say write no log line, so the signature covers actions, triggers, and kill counts.
export function shareSignature(quest) {
  if (!quest) return '';
  const parts = [quest.getLogMessages?.()?.length ?? 0, quest.questComplete ? 1 : 0, quest.ticksToEnd | 0];
  for (const task of quest.tasks?.values?.() ?? []) {
    parts.push(task.triggered ? 1 : 0);
    for (const action of task.actions ?? []) parts.push(action.isComplete ? 1 : 0);
  }
  for (const r of quest.resources?.values?.() ?? []) if (r.isFoe) parts.push(`${r.killCount | 0}${r.injuredTrigger ? 'i' : ''}`);
  return parts.join(',');
}

export function syncBaselineAfter(quest, result, prev = undefined) {
  if (result?.held) return prev;
  return quest?._keptLocal || !result?.resync ? '' : shareSignature(quest);
}

export function questBusyAgain(machine, quest, seen) {
  if (quest?.data?.final === 1) { machine?.pendFinishedShare?.(quest.data); return; }
  if (quest?.questName) seen?.set?.(quest.questName, '');
}

export function shareEnvelopeEnding(data) {
  for (const task of Array.isArray(data?.tasks) ? data.tasks : []) {
    for (const action of Array.isArray(task?.actions) ? task.actions : []) if (action?.type === 'EndQuest' && action.isComplete === true) return true;
  }
  return false;
}

// A marker's index is its identity, so none is dropped; only fields the site already implies leave the wire.
const MARKER_LISTS = ['questSpawnMarkers', 'questItemMarkers'];
const ownSymbol = (m, symbol) => !!m && !!symbol && m.original === symbol.original && m.name === getInnerSymbolName(m.original ?? '')
  && Object.keys(m).length === 2;
function mapPlaceMarkers(data, each) {
  if (!data || !Array.isArray(data.resources)) return data;
  return {
    ...data,
    resources: data.resources.map((r) => {
      const sd = r?.type === 'Place' ? r.resourceSpecific?.siteDetails : null;
      if (!sd || !MARKER_LISTS.some((k) => Array.isArray(sd[k]))) return r;
      const out = { ...sd };
      for (const k of MARKER_LISTS) if (Array.isArray(sd[k])) out[k] = sd[k].map((m) => (m && typeof m === 'object' ? each(m, sd, r.symbol) : m));
      return { ...r, resourceSpecific: { ...r.resourceSpecific, siteDetails: out } };
    }),
  };
}
export function slimShareMarkers(data) {
  return mapPlaceMarkers(data, (m, sd, symbol) => {
    const out = { ...m };
    if (m.questUID === sd.questUID) delete out.questUID;
    if (ownSymbol(m.placeSymbol, symbol)) delete out.placeSymbol;
    if (m.targetResources === null) delete out.targetResources;
    if (m.buildingKey === 0) delete out.buildingKey;
    return out;
  });
}
export function fullShareMarkers(data) {
  return mapPlaceMarkers(data, (m, sd, symbol) => ({
    questUID: sd.questUID,
    placeSymbol: symbol ? { original: symbol.original, name: getInnerSymbolName(symbol.original ?? '') } : null,
    targetResources: null,
    buildingKey: 0,
    ...m,
  }));
}

export function canReceiveSharedQuest(machine, questLists, questName, { memberships = {}, shareId, factionId = 0 } = {}) {
  // A copy finished under a share is never received again this session, or its rewards would pay twice.
  if (shareId !== undefined ? machine.hasFinishedSharedCopy?.(questName, shareId) : machine.hasFinishedSharedQuestNamed?.(questName)) return { ok: false, reason: 'done' };
  if (lineStepOf(questName)) return { ok: false, reason: 'questline' };
  if (isMainQuestName(questName)) return { ok: false, reason: 'mainQuest' };
  if (isShelved(machine.sharedCandidateNamed?.(questName))) return { ok: false, reason: 'shelved' };
  if (machine.hasActiveQuestNamed(questName)) {
    // A resync updates only the same copy: a different known shareId keeps the receiver's own quest.
    const own = machine.sharedCandidateNamed?.(questName)?.shareId;
    if (typeof shareId === 'string' && shareId && typeof own === 'string' && own && own !== shareId) return { ok: false, reason: 'active' };
    if (machine.hasSharedQuestNamed(questName)) return { ok: true, resync: true };
    return { ok: false, reason: 'active' };
  }
  const meta = questLists.findQuestMeta(questName);
  if (meta?.quest?.oneTime && questLists.hasAcceptedOneTime(questName)) return { ok: false, reason: 'done' };
  // The guild gate checks membership only, not the rank and reputation a normal guild offer needs.
  if (meta?.scope === 'guild' && meta.quest.membership !== MEMBERSHIP_STATUS.Nonmember) {
    const guild = Object.values(GUILDS).find((g) => g.guildGroup === meta.group);
    if (guild && !hasJoined(memberships, guild)) return { ok: false, reason: 'guild', guild: guild.name };
  }
  // The faction comes from the catalog row's guild, never from the envelope, which the sender writes.
  const need = ONLINE_REPUTE_GATES[questName];
  const fid = Object.values(GUILDS).find((g) => g.guildGroup === meta?.group)?.factionId ?? (Number(factionId) || 0);
  if (need != null && isOnlinePage() && (machine.deps?.getReputation?.(fid) ?? 0) < need) return { ok: false, reason: 'repute', need };
  return { ok: true, meta };
}

export function receiveSharedQuest(machine, questLists, questName, data, ctx = {}) {
  const check = canReceiveSharedQuest(machine, questLists, questName, { ...ctx, shareId: data?.shareId ?? null, factionId: data?.factionId ?? 0 });
  const held = data?.held === 1;
  if (!check.ok) return held && data.sync === 1 ? { ...check, quiet: true } : check;
  if (held && check.resync) {
    machine.noteShareHolder?.(questName, ctx.from);
    const quest = machine.sharedCandidateNamed?.(questName) ?? null;
    return quest ? { ok: true, quest, resync: true, held: true } : { ok: false, reason: 'gone' };
  }
  // The envelope is untrusted: its shape must match the local parse, and items come from local rolls.
  if (!data || typeof data !== 'object' || data.questName !== questName) return { ok: false, reason: 'mismatch' };
  const local = machine.parseQuestShape?.(questName, data.factionId, { questlines: data.ql?.stamp === QL_STAMP }) ?? null;
  if (!local) return { ok: false, reason: 'unknown' };
  const why = shapeMismatch(local, data);
  if (why) return { ok: false, reason: 'mismatch' };
  const live = check.resync ? machine.sharedCandidateNamed?.(questName) ?? null : null;
  const safe = takeLocalItems(local, takeLocalActions(local, fullShareMarkers(data), live));
  const relay = (q) => {
    const online = ctx.online ?? isOnlinePage();
    if (online) relayQuestOnline(q, { carriesQuestItem: ctx.carriesQuestItem ?? null });
    relayQuestMovedLayout(q, machine, { carriesQuestItem: ctx.carriesQuestItem ?? null }, online);
  };
  if (check.resync) {
    const quest = machine.updateSharedQuest(questName, safe, { from: ctx.from });
    if (quest) { relay(quest); machine.noteShareHolder?.(questName, ctx.from); return { ok: true, quest, resync: true }; }
    const still = machine.sharedCandidateNamed?.(questName) ?? null;
    return { ok: false, reason: still && !still.questComplete && !still.questTombstoned ? 'restore' : 'gone' };
  }
  if (safe.questComplete === true || shareEnvelopeEnding(safe)) return { ok: false, reason: 'finished' };
  const quest = machine.receiveSharedQuest(safe);
  if (!quest) return { ok: false, reason: 'restore' };
  relay(quest);
  machine.noteShareHolder?.(questName, ctx.from);
  quest._sentBy = ctx.from ?? null;
  quest._heldSig = shareSignature(quest);
  if (check.meta?.quest?.oneTime) questLists.markOneTimeAccepted(questName);
  return { ok: true, quest };
}

// Headless and persist-until task symbols are minted at parse, so they match by type and order, never by number.
const MINTED_TASK_TYPES = new Set([TaskType.Headless, TaskType.PersistUntil]);

const HOME_SYMBOL = /^_(.+)_home_$/;

export function shapeMismatch(local, data) {
  const ref = local.getSaveData();
  const tasks = Array.isArray(data.tasks) ? data.tasks : null;
  if (!tasks || tasks.length !== ref.tasks.length) return 'tasks';
  const taskNames = new Set();
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i], r = ref.tasks[i];
    if (!t || typeof t !== 'object' || t.type !== r.type || typeof t.symbol?.original !== 'string') return 'task';
    if (MINTED_TASK_TYPES.has(r.type)) {
      if (!/^\d+$/.test(t.symbol.original)) return 'task';
      if (r.type === TaskType.PersistUntil && t.targetSymbol?.original !== r.targetSymbol?.original) return 'task';
    } else if (t.symbol.original !== r.symbol?.original) return 'task';
    const name = getInnerSymbolName(t.symbol.original);
    if (taskNames.has(name)) return 'task';
    taskNames.add(name);
    const acts = Array.isArray(t.actions) ? t.actions : null;
    if (!acts || acts.length !== r.actions.length) return 'actions';
    for (let j = 0; j < acts.length; j++) if (!sharedActionMatches(r.actions[j], acts[j])) return 'action';
  }
  const res = Array.isArray(data.resources) ? data.resources : null;
  if (!res) return 'resources';
  const want = new Map(ref.resources.map((r) => [r.symbol?.original, r.type]));
  const persons = new Set(ref.resources.filter((r) => r.type === 'Person').map((r) => getInnerSymbolName(r.symbol?.original ?? '')));
  const seen = new Set();
  for (const r of res) {
    const sym = r && typeof r === 'object' ? r.symbol?.original : null;
    if (typeof sym !== 'string' || seen.has(sym)) return 'resource';
    seen.add(sym);
    if (want.has(sym)) { if (want.get(sym) !== r.type) return 'resource'; continue; }
    const home = HOME_SYMBOL.exec(sym);
    if (!home || r.type !== 'Place' || !persons.has(home[1])) return 'resource';
  }
  for (const sym of want.keys()) if (!seen.has(sym)) return 'resources';
  return null;
}

export function takeLocalItems(local, data) {
  const mine = new Map();
  for (const r of local.resources.values()) if (r.resourceTypeName === 'Item') mine.set(r.symbol?.original, r);
  return {
    ...data,
    resources: data.resources.map((r) => {
      const own = r?.type === 'Item' ? mine.get(r.symbol?.original) : null;
      if (!own) return r;
      const item = own.daggerfallUnityItem ? structuredClone(own.daggerfallUnityItem) : null;
      return { ...r, resourceSpecific: { ...(r.resourceSpecific ?? {}), artifact: !!own.artifact, item } };
    }),
  };
}

export const SHARE_REFUSAL_TEXT = Object.freeze({
  get gone() { return t('quest.share.gone', 'That quest is no longer active.'); },
  get tooLarge() { return t('quest.share.tooLarge', 'This quest is too complex to share.'); },
  get mainQuest() { return t('quest.share.mainQuest', 'The main quest cannot be shared.'); },
  get questline() { return t('quest.share.questline', 'A questline is your own road. Its steps cannot be shared.'); },
  get active() { return t('quest.share.active', 'already have this quest.'); },
  get done() { return t('quest.share.done', 'have already done this quest.'); },
  get mismatch() { return t('quest.share.mismatch', 'received a quest that did not match your own copy.'); },
  get unknown() { return t('quest.share.unknown', 'do not know this quest.'); },
  get guild() { return t('quest.share.guild', 'are not a member of the guild this quest requires.'); },
  get repute() { return t('quest.share.repute', 'do not yet have the standing with its guild this quest asks for.'); },
});

export const SHARE_GUILD_NAMES = Object.freeze({
  get FightersGuild() { return t('quest.share.guildName.fighters', 'the Fighters Guild'); },
  get MagesGuild() { return t('quest.share.guildName.mages', 'the Mages Guild'); },
  get ThievesGuild() { return t('quest.share.guildName.thieves', 'the Thieves Guild'); },
  get DarkBrotherhood() { return t('quest.share.guildName.darkBrotherhood', 'the Dark Brotherhood'); },
});

/**
 * @param {{reason?: string, guild?: string}|null} result
 */
export function shareRefusalText(result, theirBuild = undefined) {
  const named = result?.reason === 'guild' ? SHARE_GUILD_NAMES[result.guild] : null;
  if (named) return t('quest.share.guildNamed', 'are not a member of {guild}, which this quest requires.', { guild: named });
  const base = RECEIVER_REFUSAL_TEXT[result?.reason] ?? SHARE_REFUSAL_TEXT[result?.reason] ?? null;
  return base && theirBuild !== undefined && SKEW_REASONS.has(result.reason) ? base + shareSkewText(theirBuild) : base;
}

export function shareSentLine(sent, quest) {
  return sent ? t('quest.share.sent', 'Shared "{quest}" with your party.', { quest }) : t('quest.share.notNow', 'Could not share that quest right now.');
}

export const shareSomeone = () => t('quest.share.someone', 'A party member');
export const shareReceivedLine = (who, quest) => t('quest.share.received', '{who} shared a quest: "{quest}".', { who, quest });
export function shareRefusedLine(result, who, quest, theirBuild = undefined) {
  const why = shareRefusalText(result, theirBuild);
  return why ? t('quest.share.refused', '{who} tried to share "{quest}", but you {why}', { who, quest, why })
    : t('quest.share.notReceived', 'Could not receive the quest "{quest}" from {who}.', { who, quest });
}

export const RECEIVER_REFUSAL_TEXT = Object.freeze({
  get gone() { return t('quest.share.receiver.gone', 'no longer have a copy of it to bring up to date.'); },
  get tooLarge() { return t('quest.share.receiver.tooLarge', 'were sent a quest too large to read.'); },
  get mainQuest() { return t('quest.share.receiver.mainQuest', 'cannot be given the main quest.'); },
  get questline() { return t('quest.share.questline.receiver', 'cannot be given a step of a questline. Each player walks their own.'); },
  get restore() { return t('quest.share.receiver.restore', 'could not rebuild it in your world.'); },
  get shelved() { return t('quest.share.receiver.shelved', 'have abandoned it. Reclaim it from the Quests tab of the pause menu to take it up again.'); },
});

const SKEW_REASONS = new Set(['mismatch', 'unknown', 'restore']);
export function shareSkewText(theirBuild, mine = BUILD_TAG) {
  if (!theirBuild) return ` ${t('quest.share.skewOld', 'Their game is out of date. They should reload the page.')}`;
  return theirBuild === mine ? '' : ` ${t('quest.share.skewDiffer', 'You are on different versions of the game. Both of you should reload the page.')}`;
}

// Syncs share on every change, so a sync's refusal is said once per sharer, quest, reason, and copy.
export function sayShareRefusal(said, acct, questName, result, sync, copy = '') {
  if (result?.quiet) return false;
  const key = `${acct}|${questName}|${result?.reason}|${result?.guild ?? ''}|${copy}`;
  const fresh = !said.has(key);
  said.add(key);
  return !sync || fresh;
}
