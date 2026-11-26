// A shared save carries progress, not a replacement for the receiver's quest script.
// Every field is immutable unless explicitly listed below. New actions therefore fail closed.
const finite = (v) => Number.isFinite(v);
const count = (v) => Number.isSafeInteger(v) && v >= 0;
const bool = (v) => typeof v === 'boolean';
const location = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffff;
const progress = {
  PlaySound: { lastTimePlayed: finite },
  PcAt: { textShown: bool },
  DroppedItemAtPlace: { textShown: bool },
  CreateFoe: {
    lastSpawnTime: finite, spawnCounter: count,
    msgMessageID: (v, own) => v === own || v === -1,
  },
  WhenPcEntersExits: { currentLocationType: location, previousLocationType: location },
  RunQuest: { questStarted: bool, questUId: (v) => v === null || count(v) },
};
// Holder fields are checked like progress but never taken from the partner: a fresh copy keeps its parsed values,
// and a resync keeps the values of the live copy.
const holders = {
  QlAct: { from: (v) => v === null || count(v) },
  VampClouded: { from: (v) => v === null || count(v) },
  // The guard watch anchors to this holder's own arrival at the hall, never the partner's.
  DailyFrom: { guardAnchor: (v) => v === null || finite(v), guardAway: bool },
  // Classic spell effects come from the holder's own game data at parse; a headless reference parse has none,
  // so only their shape is checked then.
  CastSpellDo: { classicEffects: (v, own) => (own == null ? v === null || Array.isArray(v) : same(v, own)) },
};

// Save fields may be absent rather than undefined after JSON transport. Key order is irrelevant.
const canonical = (value) => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v);
const same = (a, b) => canonical(a) === canonical(b);

// Copies parsed by older builds hold climates 224 and 226 where the parser now reads 225 and 230.
// They are accepted but never taken.
const LEGACY_CLIMATES = Object.freeze({ 225: 224, 230: 226 });
const legacy = Object.freeze({
  Climate: { climate: (v, own) => v === LEGACY_CLIMATES[own] },
});

export function sharedActionMatches(own, incoming) {
  if (!incoming || incoming.type !== own.type || !bool(incoming.isComplete)
    || incoming.isTriggerCondition !== own.isTriggerCondition
    || incoming.isAlwaysOnTriggerCondition !== own.isAlwaysOnTriggerCondition) return false;
  const expected = own.actionSpecific, got = incoming.actionSpecific;
  if (expected == null) return got == null;
  if (!got || typeof got !== 'object' || Array.isArray(got)) return false;
  if (Object.keys(got).some((k) => !Object.hasOwn(expected, k))) return false;
  for (const [key, value] of Object.entries(expected)) {
    const received = got[key];
    if (same(value, received)) continue;
    // These two actions normalize a script argument once executed; accept only that exact result.
    if (own.type === 'StartQuest' && key === 'questName' && value === '' && expected.questIndex1 > 0
      && received === `S${String(expected.questIndex1).padStart(7, '0')}`) continue;
    if (own.type === 'WorldUpdate' && key === 'variant' && value === '-' && received === '') continue;
    const validate = progress[own.type]?.[key] ?? holders[own.type]?.[key] ?? legacy[own.type]?.[key];
    if (!validate || !validate(received, value)) return false;
  }
  return true;
}

export function takeLocalActions(local, data, live = null) {
  const ref = local.getSaveData();
  const mine = live?.getSaveData?.() ?? null;
  return { ...data, tasks: data.tasks.map((task, i) => ({ ...task, actions: task.actions.map((action, j) => {
    const own = ref.tasks[i].actions[j];
    const specific = own.actionSpecific == null ? null : { ...own.actionSpecific };
    if (specific) for (const key of Object.keys(progress[own.type] ?? {})) {
      if (Object.hasOwn(action.actionSpecific, key)) specific[key] = action.actionSpecific[key];
    }
    const kept = mine?.tasks?.[i]?.actions?.[j];
    if (specific && kept?.type === own.type && kept.actionSpecific) for (const key of Object.keys(holders[own.type] ?? {})) {
      if (Object.hasOwn(kept.actionSpecific, key)) specific[key] = kept.actionSpecific[key];
    }
    return { ...own, isComplete: action.isComplete, actionSpecific: specific };
  }) })) };
}
