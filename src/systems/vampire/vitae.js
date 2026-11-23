// @ts-check
// BUNNYFALL VAMPIRE EXPANSION, PHASE 1: THE AWAKENED CURSE - the blood's law (bloodLaw.js) on a live vampire.
//
// AWAKENING. A vampire is turned as Daggerfall turns one (systems/vampirism.js, DFU's VampirismEffect) and lives by its
// rules - any landed blow feeds, a day unfed and no rest - until their Clan Elder summons them (the quest QLVA01,
// systems/questlines/quests/QLVA01.txt, sent by `elderLetterDue` below a few nights after the turning, and to every
// vampire already standing) and awakens the Beast (`vamp awaken`, systems/vampire/vampireActions.js). From then:
//   - VITAE runs down with the character's own clock and the BEAST rises through its stages (vitaeRound, every magic
//     round, from vampirismMagicRound);
//   - the stage and the blood's RESONANCE ride the curse's own statMods and skillMods, beside its day/night +/-20;
//   - a landed blow on a creature or a foe is a mouthful (FEEDS.wound), never a civilian's; real feeding is the Steal
//     mode's (scenes/vampire/vampireFeed.js);
//   - only a STARVING vampire is refused rest (racialRestBlock), where Daggerfall refused one a day unfed.
//
// EVERYTHING IS ON THE CURSE ENTRY (the activeEffects row), so it rides the save and goes with a cure:
//   awakened  true once the Elder awakened the Beast
//   vitae     0..VITAE_MAX          vitaeAt  the own-clock minute it was last brought up to date
//   blood     { type, quality } | null   the blood held (its quality fades with the days)
//   stageSaid the stage last announced (the Beast's line is said once on the way down)
//   deeds     { clouded, drunk, drained, seen }   counts the Elder's quest reads (`vamp clouded <n>`)
//   elderAt   the own-clock minute the Elder's letter is due (or was sent: elderSent)
//
// The switch is CONTENT.vampireBlood (systems/contentOff.js): off, no letter comes and an awakened vampire lives by
// Daggerfall's rules again (the state stays in the save).

import { contentOn } from '../../mods/contentOff.js';
import { liveVampirism } from '../../afflictions/racialLive.js';
import { MINUTES_PER_DAY } from '../../world/gameDate.js';
import {
  VITAE_MAX, VITAE_AWAKENED, VITAE_DRAIN_PER_DAY, BEAST, beastStageOf, beastStageLine, BEAST_STAT_MODS,
  resonanceTier, RESONANCE_STAT_MODS, RESONANCE_SKILL_MODS, BLOOD_FADE_PER_DAY, vitaeAfterFeed, bloodAfterFeed, FEEDS,
  MIND_CLOUD_COST, beastStageName, archetypeName,
} from './bloodLaw.js';
import { t } from '../../ui/textManager.js';
import { STALE_QUALITY_CAP } from './bloodLaw.js';
import { clanDrainMul, clanFeedMul, clanStaleCap, clanKissCost, clanStageShift, clanSkillMods } from './clanLaw.js';   // PHASE 3: the nine bloodlines
import { VAMPIRE_AWAKENING_QUEST, startNamedRacialQuest, racialQuestLive } from '../../afflictions/racialQuests.js';

/** Days after the turning before the Elder writes (own clock); a vampire already standing hears in ELDER_FIRST_DAYS. */
export const ELDER_DELAY_DAYS = 3;
export const ELDER_FIRST_DAYS = 1;
/** Days the Elder waits before writing again, when the summons lapsed unanswered. */
export const ELDER_RETRY_DAYS = 7;

/** Whether the expansion is switched on. */
export const vampireBloodOn = () => contentOn('vampireBlood');

/** The live curse entry when it is AWAKENED (and the switch on), else null. @param {any} entity */
export function awakenedVampirism(entity) {
  const entry = liveVampirism(entity);
  return entry && entry.awakened && vampireBloodOn() ? entry : null;
}

/** The deeds' counts, minted on first need. @param {any} entry */
function deedsOf(entry) {
  entry.deeds ??= { clouded: 0, drunk: 0, drained: 0, seen: 0 };
  return entry.deeds;
}

/** The Elder's gift: the Beast awakened, with VITAE_AWAKENED Vitae. Answers whether it changed anything.
 *  @param {any} entity @param {number} nowMinutes */
export function awakenVampire(entity, nowMinutes) {
  const entry = liveVampirism(entity);
  if (!entry || entry.awakened) return false;
  entry.awakened = true;
  entry.vitae = VITAE_AWAKENED;
  entry.vitaeAt = nowMinutes;
  entry.blood = null;
  entry.stageSaid = beastStageOf(VITAE_AWAKENED);
  deedsOf(entry);
  return true;
}

/** Bring the Vitae and the blood up to the minute (the drain and the fade over the span since `vitaeAt`).
 *  @param {any} entry @param {number} nowMinutes */
function settle(entry, nowMinutes) {
  const from = Number.isFinite(entry.vitaeAt) ? entry.vitaeAt : nowMinutes;
  const days = Math.max(0, nowMinutes - from) / MINUTES_PER_DAY;
  entry.vitaeAt = Math.max(from, nowMinutes);
  if (!(days > 0)) return;
  entry.vitae = Math.max(0, (Number(entry.vitae) || 0) - days * VITAE_DRAIN_PER_DAY * clanDrainMul(entry.clan));   // PHASE 3: Haarvenu's fever
  if (entry.blood) {
    entry.blood.quality = Math.max(0, entry.blood.quality - days * BLOOD_FADE_PER_DAY);
    if (entry.blood.quality <= 0) entry.blood = null;
  }
}

/** The vampire's Vitae now (0 for one not awakened). @param {any} entity @param {number} nowMinutes */
export function vitaeNow(entity, nowMinutes) {
  const entry = awakenedVampirism(entity);
  if (!entry) return 0;
  settle(entry, nowMinutes);
  return entry.vitae;
}

/** The Beast's stage now (Sated for one not awakened). @param {any} entity @param {number} nowMinutes */
export function beastStageNow(entity, nowMinutes) {
  const entry = awakenedVampirism(entity);
  return entry ? beastStageOf(vitaeNow(entity, nowMinutes)) : BEAST.Sated;
}

/**
 * The magic round's part (vampirismMagicRound, after the day/night mods are written): the drain, the Beast's line when a
 * stage is reached on the way down, and the stage's and the blood's mods added to the curse's own. Also sends the
 * Elder's letter when it is due (elderLetterDue). @param {any} entity @param {number} nowMinutes
 * @param {(line: string) => void} [say]
 */
export function vitaeRound(entity, nowMinutes, say = () => {}) {
  const live = liveVampirism(entity);
  if (!live) return;
  if (!live.awakened) { elderLetterDue(live, nowMinutes); return; }
  const entry = awakenedVampirism(entity);
  if (!entry) return;
  settle(entry, nowMinutes);
  const stage = beastStageOf(entry.vitae);
  if (stage > (entry.stageSaid ?? 0)) { const line = beastStageLine(stage); if (line) say(line); }
  entry.stageSaid = stage;
  const add = (map, mods, n = 1) => { for (const [k, v] of Object.entries(mods)) map[k] = (map[k] ?? 0) + v * n; };
  entry.statMods ??= {};
  entry.skillMods ??= {};
  add(entry.statMods, BEAST_STAT_MODS[Math.min(BEAST.Starving, stage + clanStageShift(entry.clan, entity))] ?? {});   // PHASE 3: Lyrezi tells early, a wounded Vraseth's Beast
  add(entry.skillMods, clanSkillMods(entry.clan));   // PHASE 3: Vraseth's legs
  const tier = entry.blood ? resonanceTier(entry.blood.quality) : 0;
  if (tier > 0) {
    add(entry.statMods, RESONANCE_STAT_MODS[entry.blood.type] ?? {}, tier);
    add(entry.skillMods, RESONANCE_SKILL_MODS[entry.blood.type] ?? {}, tier);
  }
}

/**
 * A feed: the Vitae it gives, the blood it leaves, and the deed counted. `kind` a FEEDS key; `deed` the quest's count to
 * add to ('clouded' | 'drunk' | 'drained' | 'seen' | null). Answers { vitae, stage, blood } after it, or null for a
 * vampire not awakened. @param {any} entity
 * @param {{ kind: keyof typeof FEEDS, type: string, quality: number, fresh?: boolean, now: number, deed?: string|null }} f
 */
export function feedVampire(entity, { kind, type, quality, fresh = true, now, deed = null }) {
  const entry = awakenedVampirism(entity);
  if (!entry) return null;
  settle(entry, now);
  const feed = FEEDS[kind] ?? FEEDS.sip;
  const gain = Math.round(feed.vitae * clanFeedMul(entry.clan, kind, type, quality));   // PHASE 3: the clan's strength and bane
  entry.vitae = vitaeAfterFeed(entry.vitae, gain, { fresh: fresh && feed.relief });
  if (gain > 0 && (kind !== 'wound' || !entry.blood || entry.blood.type === type)) entry.blood = bloodAfterFeed(entry.blood, type, quality, { fresh, staleCap: clanStaleCap(entry.clan, STALE_QUALITY_CAP) });
  if (deed) { const d = deedsOf(entry); d[deed] = (d[deed] ?? 0) + 1; }
  entry.lastTimeFed = now;   // Daggerfall's own stamp, kept true for anything that still reads it
  entry.stageSaid = beastStageOf(entry.vitae);
  return { vitae: entry.vitae, stage: entry.stageSaid, blood: entry.blood };
}

/** The Kiss's price: answers whether the Vitae was there to spend. @param {any} entity @param {number} now */
export function spendMindCloud(entity, now) {
  const entry = awakenedVampirism(entity);
  if (!entry) return false;
  settle(entry, now);
  const cost = clanKissCost(entry.clan, MIND_CLOUD_COST);   // PHASE 3: Montalion's half
  if (entry.vitae < cost) return false;
  entry.vitae -= cost;
  return true;
}

/** PHASE 2: spend `n` Vitae (a thrall bound, a bond renewed): answers whether it was there to spend.
 *  @param {any} entity @param {number} n @param {number} now */
export function spendVitae(entity, n, now) {
  const entry = awakenedVampirism(entity);
  if (!entry) return false;
  settle(entry, now);
  if (entry.vitae < n) return false;
  entry.vitae -= n;
  return true;
}

/** A deed's count (the Elder's quest reads it). @param {any} entity @param {string} deed */
export function deedCount(entity, deed) {
  const entry = liveVampirism(entity);
  return entry?.deeds?.[deed] ?? 0;
}

/**
 * THE ELDER'S LETTER: due ELDER_DELAY_DAYS after the turning (ELDER_FIRST_DAYS for a vampire from before this), sent
 * once (startNamedRacialQuest: never a second copy), and again ELDER_RETRY_DAYS after a summons that lapsed. Answers
 * whether it sent one. @param {any} entry @param {number} nowMinutes
 */
export function elderLetterDue(entry, nowMinutes) {
  if (!vampireBloodOn() || entry.awakened) return false;
  if (!Number.isFinite(entry.elderAt)) {
    const turned = Number.isFinite(entry.turnedAt) ? entry.turnedAt : null;
    entry.elderAt = turned != null ? turned + ELDER_DELAY_DAYS * MINUTES_PER_DAY : nowMinutes + ELDER_FIRST_DAYS * MINUTES_PER_DAY;
  }
  if (nowMinutes < entry.elderAt) return false;
  const live = racialQuestLive(VAMPIRE_AWAKENING_QUEST);
  if (live !== false) return false;   // running, or no machine to ask yet
  if (!startNamedRacialQuest(VAMPIRE_AWAKENING_QUEST)) return false;
  entry.elderAt = nowMinutes + ELDER_RETRY_DAYS * MINUTES_PER_DAY;   // a summons left to lapse is sent again a week on
  return true;
}

/** For the HUD and the character sheet: the awakened vampire's state now, or null.
 *  @param {any} entity @param {number} nowMinutes */
export function vampireStatus(entity, nowMinutes) {
  const entry = awakenedVampirism(entity);
  if (!entry) return null;
  settle(entry, nowMinutes);
  const stage = beastStageOf(entry.vitae);
  return { vitae: Math.round(entry.vitae), max: VITAE_MAX, stage, blood: entry.blood ? { ...entry.blood, tier: resonanceTier(entry.blood.quality) } : null };
}

/**
 * THE STATUS WIDGET'S TILES (ui/enhanced/enhancedHud.js, beside the needs' - ui/hud/hudStatus.js statusTiles): the Beast
 * and the Vitae, amber from Thirsty and red from Ravenous (green while Sated), and the blood's resonance while it has a
 * tier. Each in the needs' chip shape. None for a vampire not awakened. @param {any} entity @param {number} nowMinutes
 */
export function vampireHudChips(entity, nowMinutes) {
  const st = vampireStatus(entity, nowMinutes);
  if (!st) return [];
  const level = st.stage >= BEAST.Ravenous ? 'danger' : st.stage >= BEAST.Thirsty ? 'warn' : 'boon';
  // THE VISUAL PASS: the Vitae and the Beast are the HUD's own bar now (ui/enhanced/enhancedHud.js); a tile for them only
  // where it says more than the bar - a Ravenous or Starving Beast, red
  const out = st.stage >= BEAST.Ravenous ? [{ key: 'vitae', text: t('vampire.hud.beast', '{stage} (Vitae {vitae})', { stage: beastStageName(st.stage), vitae: st.vitae }), level, glyph: 'bleed', foot: String(st.vitae) }] : [];
  if (st.blood?.tier > 0) {
    out.push({ key: 'boon:blood', text: t('vampire.hud.blood', '{type} blood, {quality}%', { type: archetypeName(st.blood.type), quality: Math.round(st.blood.quality) }), level: 'boon', glyph: 'bleed', foot: `T${st.blood.tier}` });
  }
  return out;
}
