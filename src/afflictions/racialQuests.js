export const CURE_QUEST_INTERVAL_MINUTES = 120960;
export const VAMPIRE_QUEST_PREFIX = 'P0';
export const LYCANTHROPY_CURE_QUEST = '$CUREWER';
export const VAMPIRISM_CURE_QUEST = '$CUREVAM';
export const VAMPIRE_INITIAL_QUEST = 'P0A01L00';

// world.js registers the host from its quest machine; with no host every quest arm idles.
let _host = null;
export function setRacialQuestHost(host) { const prev = _host; _host = host ?? null; return prev; }

const rangeInclusive = (rolls, lo, hi) => lo + Math.min(hi - lo, Math.floor(rolls() * (hi - lo + 1)));

export function startRacialOverrideQuest(entity, isCureQuest, { rolls = Math.random } = {}) {
  const override = entity?.racialOverride;
  if (!override || override.ended || !_host) return null;

  if (override.racial === 'lycanthropy') {
    if (!isCureQuest) return null;
    if (rangeInclusive(rolls, 1, 100) >= 30) return null;
    if ((_host.findQuests?.(LYCANTHROPY_CURE_QUEST) ?? []).length > 0) return null;
    _host.startQuest?.(LYCANTHROPY_CURE_QUEST);
    return LYCANTHROPY_CURE_QUEST;
  }

  if (override.racial === 'vampirism') {
    if (isCureQuest) {
      // The 10 floor on this roll is Daggerfall Unity's own.
      if (rangeInclusive(rolls, 10, 100) >= 30) return null;
      _host.startQuest?.(VAMPIRISM_CURE_QUEST);
      return VAMPIRISM_CURE_QUEST;
    }
    if (override.hasStartedInitialVampireQuest) {
      if (rangeInclusive(rolls, 1, 100) >= 50) return null;
      const factionId = override.clan ?? 0;
      const quest = _host.getVampireClanQuest?.(factionId, entity.level ?? 1) ?? null;
      if (!quest) return null;
      _host.startQuestObject?.(quest);
      return quest.questName ?? quest.name ?? null;
    }
    if (rangeInclusive(rolls, 1, 100) >= 50) return null;
    _host.startQuest?.(VAMPIRE_INITIAL_QUEST);
    override.hasStartedInitialVampireQuest = true;
    return VAMPIRE_INITIAL_QUEST;
  }

  return null;
}

// Online, each arm rolls every 24 character minutes while racialArmIdle finds nothing of its kind running.
export const ONLINE_RACIAL_INTERVAL_MINUTES = 24;
const CURE_QUESTS = Object.freeze([LYCANTHROPY_CURE_QUEST, VAMPIRISM_CURE_QUEST]);
export function racialArmIdle(isCureQuest) {
  const live = _host?.activeQuestNames?.();
  if (!Array.isArray(live)) return false;
  return !live.some((n) => (isCureQuest ? CURE_QUESTS.includes(n) : String(n).startsWith(VAMPIRE_QUEST_PREFIX)));
}

// The vampire cure quest is not a P0 quest; it ends itself.
export function endVampireQuests() {
  _host?.tombstoneQuestsByPrefix?.(VAMPIRE_QUEST_PREFIX);
  _host?.tombstoneQuestsByName?.(VAMPIRE_AWAKENING_QUEST);
}

export const VAMPIRE_AWAKENING_QUEST = 'QLVA01';
export function racialQuestLive(name) {
  const live = _host?.activeQuestNames?.();
  return Array.isArray(live) ? live.includes(name) : null;
}
export function startClanQuest(entity) {
  const clan = entity?.racialOverride?.clan;
  if (!clan || !_host) return null;
  const quest = _host.getVampireClanQuest?.(clan, entity.level ?? 1) ?? null;
  if (!quest) return null;
  _host.startQuestObject?.(quest);
  return quest.questName ?? quest.name ?? null;
}
export function startNamedRacialQuest(name) {
  if (racialQuestLive(name) !== false) return false;
  _host?.startQuest?.(name);
  return true;
}

export function endLycanthropyQuests() {
  _host?.tombstoneQuestsByName?.(LYCANTHROPY_CURE_QUEST);
}
