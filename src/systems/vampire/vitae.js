// @ts-check
// The awakened curse's state lives on the curse entry (awakened, vitae, vitaeAt, blood, stageSaid, deeds, elderAt),
// so it is saved with the character and ends with a cure. With the switch off the state stays in the save, unused.

import { contentOn } from '../../mods/contentOff.js';
import { liveVampirism } from '../../afflictions/racialLive.js';
import { MINUTES_PER_DAY } from '../../world/gameDate.js';
import {
  VITAE_MAX, VITAE_AWAKENED, VITAE_DRAIN_PER_DAY, BEAST, beastStageOf, beastStageLine, BEAST_STAT_MODS,
  resonanceTier, RESONANCE_STAT_MODS, RESONANCE_SKILL_MODS, BLOOD_FADE_PER_DAY, vitaeAfterFeed, bloodAfterFeed, FEEDS,
  MIND_CLOUD_COST, beastStageName, TRAVEL_DRAIN_MUL, TRAVEL_DRAIN_FLOOR, bloodTag,
} from './bloodLaw.js';
import { skippedMinutesIn } from '../../world/skippedTime.js';
import { t } from '../../ui/textManager.js';
import { STALE_QUALITY_CAP } from './bloodLaw.js';
import { BANE_FLOOR, clanDrainMul, clanFeedMul, clanStaleCap, clanKissCost, clanStageShift, clanSkillMods } from './clanLaw.js';
import { noteFirstUse } from '../../ui/tutorials.js';
import { VAMPIRE_AWAKENING_QUEST, startNamedRacialQuest, racialQuestLive } from '../../afflictions/racialQuests.js';

export const ELDER_DELAY_DAYS = 3;
export const ELDER_FIRST_DAYS = 1;
export const ELDER_RETRY_DAYS = 7;

export const vampireBloodOn = () => contentOn('vampireBlood');

/** @param {any} entity */
export function awakenedVampirism(entity) {
  const entry = liveVampirism(entity);
  return entry && entry.awakened && vampireBloodOn() ? entry : null;
}

/** @param {any} entry */
function deedsOf(entry) {
  entry.deeds ??= { clouded: 0, drunk: 0, drained: 0, seen: 0 };
  return entry.deeds;
}

/** @param {any} entity @param {number} nowMinutes */
export function awakenVampire(entity, nowMinutes) {
  const entry = liveVampirism(entity);
  if (!entry || entry.awakened) return false;
  entry.awakened = true;
  entry.vitae = VITAE_AWAKENED;
  entry.vitaeAt = nowMinutes;
  entry.blood = null;
  entry.stageSaid = beastStageOf(VITAE_AWAKENED);
  deedsOf(entry);
  noteFirstUse('vampire-awakened');
  noteFirstUse('vampire-blood');
  noteFirstUse('vampire-gift');
  noteFirstUse('vampire-court');
  return true;
}

/** @param {any} entry @param {number} nowMinutes */
function settle(entry, nowMinutes) {
  const from = Number.isFinite(entry.vitaeAt) ? entry.vitaeAt : nowMinutes;
  const days = Math.max(0, nowMinutes - from) / MINUTES_PER_DAY;
  entry.vitaeAt = Math.max(from, nowMinutes);
  if (!(days > 0)) return;
  // Skipped time drains at a quarter of the rate and never past the Hungry floor; time played drains in full.
  const skipped = Math.min(days, skippedMinutesIn(from, nowMinutes) / MINUTES_PER_DAY), full = days - skipped;
  const rate = VITAE_DRAIN_PER_DAY * clanDrainMul(entry.clan);
  const before = Number(entry.vitae) || 0;
  let v = Math.max(0, before - full * rate);
  if (skipped > 0) v = Math.max(Math.min(v, TRAVEL_DRAIN_FLOOR), v - skipped * rate * TRAVEL_DRAIN_MUL);
  entry.vitae = v;
  if (entry.blood) {
    entry.blood.quality = Math.max(0, entry.blood.quality - days * BLOOD_FADE_PER_DAY);
    if (entry.blood.quality <= 0) entry.blood = null;
  }
}

/** @param {any} entity @param {number} nowMinutes */
export function vitaeNow(entity, nowMinutes) {
  const entry = awakenedVampirism(entity);
  if (!entry) return 0;
  settle(entry, nowMinutes);
  return entry.vitae;
}

/** @param {any} entity @param {number} nowMinutes */
export function beastStageNow(entity, nowMinutes) {
  const entry = awakenedVampirism(entity);
  return entry ? beastStageOf(vitaeNow(entity, nowMinutes)) : BEAST.Sated;
}

// Runs in the curse's magic round after its day and night mods are written, so these mods add to them.
/**
 * @param {any} entity
 * @param {number} nowMinutes
 * @param {(line: string) => void} [say]
 */
export function vitaeRound(entity, nowMinutes, say = () => {}) {
  const live = liveVampirism(entity);
  if (!live) return;
  if (!live.awakened) { if (vampireBloodOn()) noteFirstUse('vampire-bitten'); elderLetterDue(live, nowMinutes); return; }
  const entry = awakenedVampirism(entity);
  if (!entry) return;
  settle(entry, nowMinutes);
  const stage = beastStageOf(entry.vitae);
  if (stage > (entry.stageSaid ?? 0)) { const line = beastStageLine(stage); if (line) say(line); }
  entry.stageSaid = stage;
  const add = (map, mods, n = 1) => { for (const [k, v] of Object.entries(mods)) map[k] = (map[k] ?? 0) + v * n; };
  entry.statMods ??= {};
  entry.skillMods ??= {};
  add(entry.statMods, BEAST_STAT_MODS[Math.min(BEAST.Starving, stage + clanStageShift(entry.clan, entity))] ?? {});
  add(entry.skillMods, clanSkillMods(entry.clan));
  const tier = entry.blood ? resonanceTier(entry.blood.quality) : 0;
  if (tier > 0) {
    add(entry.statMods, RESONANCE_STAT_MODS[entry.blood.type] ?? {}, tier);
    add(entry.skillMods, RESONANCE_SKILL_MODS[entry.blood.type] ?? {}, tier);
  }
}

/**
 * @param {any} entity
 * @param {{ kind: keyof typeof FEEDS, type: string, quality: number, fresh?: boolean, now: number, deed?: string|null }} f
 */
export function feedVampire(entity, { kind, type, quality, fresh = true, now, deed = null }) {
  const entry = awakenedVampirism(entity);
  if (!entry) return null;
  settle(entry, now);
  const feed = FEEDS[kind] ?? FEEDS.sip;
  const mul = clanFeedMul(entry.clan, kind, type, quality);
  let gain = Math.round(feed.vitae * mul);
  // A bane leaves a feed of 10 or more Vitae at least BANE_FLOOR of it, unless the bane gives nothing.
  if (mul > 0 && mul < BANE_FLOOR && feed.vitae >= 10) gain = Math.max(gain, Math.ceil(feed.vitae * BANE_FLOOR));
  entry.vitae = vitaeAfterFeed(entry.vitae, gain, { fresh: fresh && feed.relief });
  if (gain > 0 && (kind !== 'wound' || !entry.blood || entry.blood.type === type)) entry.blood = bloodAfterFeed(entry.blood, type, quality, { fresh, staleCap: clanStaleCap(entry.clan, STALE_QUALITY_CAP) });
  if (deed) { const d = deedsOf(entry); d[deed] = (d[deed] ?? 0) + 1; }
  // The classic curse's feeding stamp, kept true for anything that still reads it.
  entry.lastTimeFed = now;
  entry.stageSaid = beastStageOf(entry.vitae);
  return { vitae: entry.vitae, stage: entry.stageSaid, blood: entry.blood };
}

/** @param {any} entity @param {number} now */
export function spendMindCloud(entity, now) {
  const entry = awakenedVampirism(entity);
  if (!entry) return false;
  settle(entry, now);
  // A vampire short of Vitae still gives the Kiss on what is left.
  const cost = clanKissCost(entry.clan, MIND_CLOUD_COST);
  entry.vitae = Math.max(0, entry.vitae - cost);
  return true;
}

/** @param {any} entity @param {number} n @param {number} now */
export function spendVitae(entity, n, now) {
  const entry = awakenedVampirism(entity);
  if (!entry) return false;
  settle(entry, now);
  if (entry.vitae < n) return false;
  entry.vitae -= n;
  return true;
}

/** @param {any} entity @param {string} deed */
export function deedCount(entity, deed) {
  const entry = liveVampirism(entity);
  return entry?.deeds?.[deed] ?? 0;
}

/**
 * @param {any} entry
 * @param {number} nowMinutes
 */
export function elderLetterDue(entry, nowMinutes) {
  if (!vampireBloodOn() || entry.awakened) return false;
  if (!Number.isFinite(entry.elderAt)) {
    const turned = Number.isFinite(entry.turnedAt) ? entry.turnedAt : null;
    entry.elderAt = turned != null ? turned + ELDER_DELAY_DAYS * MINUTES_PER_DAY : nowMinutes + ELDER_FIRST_DAYS * MINUTES_PER_DAY;
  }
  if (nowMinutes < entry.elderAt) return false;
  const live = racialQuestLive(VAMPIRE_AWAKENING_QUEST);
  // `true` is a quest already running and `null` is no quest host yet; only `false` sends the letter.
  if (live !== false) return false;
  if (!startNamedRacialQuest(VAMPIRE_AWAKENING_QUEST)) return false;
  entry.elderAt = nowMinutes + ELDER_RETRY_DAYS * MINUTES_PER_DAY;
  return true;
}

/** @param {any} entity @param {number} nowMinutes */
export function vampireStatus(entity, nowMinutes) {
  const entry = awakenedVampirism(entity);
  if (!entry) return null;
  settle(entry, nowMinutes);
  const stage = beastStageOf(entry.vitae);
  return { vitae: Math.round(entry.vitae), max: VITAE_MAX, stage, blood: entry.blood ? { ...entry.blood, tier: resonanceTier(entry.blood.quality) } : null };
}

/**
 * @param {any} entity
 * @param {number} nowMinutes
 */
export function vampireHudChips(entity, nowMinutes) {
  const st = vampireStatus(entity, nowMinutes);
  if (!st) return [];
  const level = st.stage >= BEAST.Ravenous ? 'danger' : st.stage >= BEAST.Thirsty ? 'warn' : 'boon';
  const out = st.stage >= BEAST.Ravenous ? [{ key: 'vitae', text: t('vampire.hud.beast', '{stage} (Vitae {vitae})', { stage: beastStageName(st.stage), vitae: st.vitae }), level, glyph: 'bleed', foot: String(st.vitae) }] : [];
  if (st.blood?.tier > 0) {
    out.push({ key: 'boon:blood', text: t('vampire.hud.blood', '{tag}, tier {tier} of 4', { tag: bloodTag(st.blood.type, st.blood.quality), tier: st.blood.tier }), level: 'boon', glyph: 'bleed', foot: `T${st.blood.tier}` });
  }
  return out;
}
