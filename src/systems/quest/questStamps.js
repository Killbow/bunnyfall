// @ts-check
// Online, quest countdowns use the character's clock and journal dates use the event clock; offline they are one.
// Envelopes without `ownSecondsAt` predate that split, and their own-clock stamps still sit on the event clock.

export const QUEST_OWN_SECOND_KEYS = Object.freeze(['lastWorldTimeSample', 'lastTimePlayed', 'lastSpawnTime', 'guardAnchor', 'questTombstoneTime', 'shelvedAt']);
// Log entry `time` fields also follow the event clock; `time` is too common a key to match across the tree.
export const QUEST_WORLD_SECOND_KEYS = Object.freeze(['questStartTime']);

export const raisedSince = (now, sample) => (Number.isFinite(now) && Number.isFinite(sample) && now >= sample ? now - sample : 0);

const isOwnMarked = (node) => Number.isFinite(node?.ownSecondsAt);

/**
 * @param {any} node
 * @param {number} deltaSeconds
 * @param {{ own?: boolean | 'legacy', world?: boolean }} which
 */
export function shiftQuestStamps(node, deltaSeconds, { own = false, world = false } = {}) {
  if (!deltaSeconds || !Number.isFinite(deltaSeconds)) return node;
  const walk = (n, ownHere) => {
    if (Array.isArray(n)) { for (const v of n) walk(v, ownHere); return; }
    if (!n || typeof n !== 'object') return;
    const ownBelow = own === 'legacy' ? ownHere && !isOwnMarked(n) : ownHere;
    for (const [k, v] of Object.entries(n)) {
      if (QUEST_OWN_SECOND_KEYS.includes(k)) { if (ownBelow && Number.isFinite(v) && v !== 0) n[k] = v + deltaSeconds; }
      else if (QUEST_WORLD_SECOND_KEYS.includes(k)) { if (world && Number.isFinite(v) && v !== 0) n[k] = v + deltaSeconds; }
      else if (k === 'activeLogMessages' && Array.isArray(v)) {
        if (world) for (const m of v) if (m && Number.isFinite(m.time) && m.time !== 0) m.time += deltaSeconds;
      } else if (v && typeof v === 'object') walk(v, ownBelow);
    }
  };
  walk(node, !!own);
  return node;
}

export function markOwnClock(node, ownSeconds) {
  if (!Number.isFinite(ownSeconds)) return node;
  const walk = (n) => {
    if (Array.isArray(n)) { for (const v of n) walk(v); return; }
    if (!n || typeof n !== 'object') return;
    if ('questName' in n && 'questStartTime' in n && !isOwnMarked(n)) n.ownSecondsAt = ownSeconds;
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v);
  };
  walk(node);
  return node;
}

/**
 * @param {{ quest?: any, classicMinutes?: number, worldMinutes?: number } | null} snap
 */
export function questBlockOnOwnClock(snap) {
  const block = snap?.quest ?? null;
  const own = snap?.classicMinutes, world = snap?.worldMinutes;
  if (!block || typeof block !== 'object' || !Number.isFinite(own) || !Number.isFinite(world)) return block;
  const copy = JSON.parse(JSON.stringify(block));
  shiftQuestStamps(copy, (Math.floor(Number(own)) - Math.floor(Number(world))) * 60, { own: 'legacy' });
  return markOwnClock(copy, Math.floor(Number(own)) * 60);
}

/**
 * @param {any} data
 * @param {number} nowSeconds
 * @param {number} worldSeconds
 */
export function questDataOnThisClock(data, nowSeconds, worldSeconds) {
  if (!data || typeof data !== 'object' || !Number.isFinite(nowSeconds)) return data;
  const now = Math.floor(nowSeconds);
  const copy = JSON.parse(JSON.stringify(data));
  const from = isOwnMarked(copy) ? copy.ownSecondsAt : Math.floor(worldSeconds);
  if (Number.isFinite(from)) shiftQuestStamps(copy, now - from, { own: true });
  copy.ownSecondsAt = now;
  return copy;
}
