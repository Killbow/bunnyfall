// @ts-check
// Feeding: in Steal mode an awakened vampire feeds on a townsperson (townTalk.js) or on a sleeper through their bed
// (worldModes.js) instead of picking a purse. Blood Sight shows the blood and who could see, then the player picks a
// choice such as the Kiss, Drink, Drain, or Leave. A feed seen by anyone is Assault, or Murder for a death. Each
// person, sleepers included, is fed on once a day (fedToday.js, saved), counted only after a real feed.

import { t } from '../../ui/textManager.js';
import { setCrimeCommitted, CRIMES } from '../../justice/court.js';
import { skillValue, SKILLS } from '../../characters/skills.js';
import { fedToday, markFedToday } from '../../systems/vampire/fedToday.js';
import { awakenedVampirism, feedVampire, spendMindCloud, spendVitae, beastStageNow, vampireStatus } from '../../systems/vampire/vitae.js';
import { noteFirstUse } from '../../ui/tutorials.js';
import { openBloodSight } from '../../ui/vampire/bloodSightCard.js';   // THE VISUAL PASS: the Blood Sight card
import {
  archetypeOfPerson, qualityOfPerson, resonanceWords, resonanceTier, beastStageName, beastStageOf, archetypeName, bloodTag,
  MIND_CLOUD_COST, KISS_SLIP,
} from '../../systems/vampire/bloodLaw.js';
import { captureRefusal, takePrisoner, enthrallSocial, slotRefusal, isSocialThrall, socialPerk, guardHushes, thrallState, takeScouted } from '../../systems/vampire/thralls.js';   // PHASE 2
import { socialRoleOf, mobileOfThrall, ENTHRALL_COST } from '../../systems/vampire/thrallLaw.js';
import { noteBreach, watcherChance } from '../../systems/vampire/masquerade.js';   // PHASE 3: the Masquerade
import { clanKissesAwake, clanKissCost } from '../../systems/vampire/clanLaw.js';   // PHASE 3: the clans' Kiss

/** The chance in a hundred that one drunk from and left (no Kiss) cries for the watch. */
export const REPORT_CHANCE = 35;
/** The chance in a hundred that a sleeper drunk from without the Kiss wakes. */
export const SLEEPER_WAKES = 50;
/** Without a Living World town, anyone this near (m) sees the feeding. */
export const NEAR_WITNESS_M = 6;

/** The vampire whose Blood Sight the hover tags read, set once by the host. */
let _sense = null;
/** @param {any} entity */
export const setBloodSense = (entity) => { _sense = entity; };
/** The blood quality Blood Sight reads in a person, with a servant's scouting. @param {any} person */
const sightQuality = (person) => Math.min(100, qualityOfPerson(person) + thrallState().scouted);
/** The tag under an NPC's name for an awakened vampire, such as "Noble blood, good (72%)", or null for anyone else.
 *  It reads the same person record and quality the feed uses, so the tag matches the Blood Sight card.
 *  @param {any} person */
export function bloodHoverLine(person) {
  if (!person || !_sense || !awakenedVampirism(_sense)) return null;
  return bloodTag(archetypeOfPerson(person), sightQuality(person));
}

/** The rows Blood Sight shows of a victim. */
function sightRows(name, type, quality, seenCount) {
  const rows = [
    t('vampire.feed.lean', 'You lean close to {name}.', { name }),
    t('vampire.feed.sight', 'Blood Sight: {tag}. Resonance: {gift}.', { tag: bloodTag(type, quality), gift: resonanceWords(type) }),
  ];
  if (seenCount > 0) rows.push(t('vampire.feed.seen', 'Careful: {n} could see you.', { n: seenCount }));
  else rows.push(t('vampire.feed.unseen', 'No one is watching.'));
  return rows;
}

/** PHASE 2: a social role's word. */
const roleWord = (role) => (role === 'innkeeper' ? t('thrall.role.innkeeper', 'innkeeper') : role === 'guard' ? t('thrall.role.guard', 'watchman') : t('thrall.role.merchant', 'merchant'));
/** The picker's rows, and the choice each means. PHASE 2: `extra` rows before Leave (take them, enthrall them). */
function choices(canDrain, extra = [], { kiss = true, kissCost = MIND_CLOUD_COST } = {}) {
  const list = [
    ...(kiss ? [{ id: 'kiss', label: t('vampire.feed.kiss', 'The Kiss: drink, and cloud their memory (-{cost} Vitae)', { cost: kissCost }) }] : []),   // PHASE 3: never for a Khulari on one awake
    { id: 'drink', label: t('vampire.feed.drink', 'Drink, and leave them weakened') },
  ];
  if (canDrain) list.push({ id: 'drain', label: t('vampire.feed.drain', 'Drain them dry') });
  list.push(...extra);
  list.push({ id: 'leave', label: t('vampire.feed.leave', 'Leave them be') });
  return list;
}

/** The line after a feed: what was drunk and where the Beast stands. */
function afterRows(fed, lead) {
  const rows = [lead];
  if (fed) {
    const tier = fed.blood ? resonanceTier(fed.blood.quality) : 0;
    rows.push(t('vampire.feed.after', 'Vitae {vitae}. The Beast is {stage}.', { vitae: Math.round(fed.vitae), stage: beastStageName(beastStageOf(fed.vitae)) }));
    if (fed.blood && tier > 0) rows.push(t('vampire.feed.resonance', '{type} resonance, tier {tier}.', { type: archetypeName(fed.blood.type), tier }));
  }
  return rows;
}

/**
 * The shared choice: the feed, its crime, its words. `victim` { name, type, quality, seen } and the arms the place has:
 * `onSeen(kind)` the crime's own consequence ('assault' | 'murder'), `onReported()` a victim who cried out, `onDrain()`
 * the death, null where no death can be had. Answers the boxes to show after the pick.
 */
function resolveChoice(entity, id, victim, /** @type {{ now: number, rolls: () => number, onSeen: (kind: string) => void, onReported: () => void, onDrain?: ((seen: boolean) => void) | null, reportChance: number, onBreach?: (kind: any) => any, onFed?: () => void }} */ { now, rolls, onSeen, onReported, onDrain, reportChance, onBreach = () => {}, onFed = () => {} }) {
  if (id === 'leave') return [];
  const seenThen = onSeen, reportedThen = onReported;
  onSeen = (kind) => { onBreach(kind === 'murder' ? 'murder' : 'seen'); seenThen(kind); };   // PHASE 3: every breach heats the region
  onReported = () => { onBreach('cried'); reportedThen(); };
  const seen = victim.seen > 0;
  const base = { type: victim.type, quality: victim.quality, now };
  if (id === 'kiss') {
    spendMindCloud(entity, now);
    const slip = Math.floor(rolls() * 100) < (KISS_SLIP[beastStageNow(entity, now)] ?? 0);
    const fed = feedVampire(entity, { ...base, kind: 'sip', deed: seen || slip ? 'seen' : 'clouded' });
    if (fed) onFed();
    if (seen) onSeen('assault');
    else if (slip) onReported();
    const lead = slip ? t('vampire.feed.slip', 'The Beast is too loud: the Kiss slips, and they remember.') : t('vampire.feed.kissed', 'You drink, and their memory clouds over.');
    return [{ rows: afterRows(fed, lead) }];
  }
  if (id === 'drink') {
    const fed = feedVampire(entity, { ...base, kind: 'drink', deed: seen ? 'seen' : 'drunk' });
    if (fed) onFed();
    const cries = !seen && Math.floor(rolls() * 100) < reportChance;
    if (seen) onSeen('assault');
    else if (cries) onReported();
    const lead = cries ? t('vampire.feed.cries', 'You drink deep. They stagger away, crying for the watch.') : t('vampire.feed.drunk', 'You drink deep, and leave them pale and confused.');
    return [{ rows: afterRows(fed, lead) }];
  }
  if (id === 'drain' && onDrain) {
    const fed = feedVampire(entity, { ...base, kind: 'drain', deed: seen ? 'seen' : 'drained' });
    if (fed) onFed();
    onDrain(seen);
    if (!seen) onBreach('body');   // PHASE 3: a drained body is found
    if (seen) onSeen('murder');
    return [{ rows: afterRows(fed, t('vampire.feed.drained', 'You drain them dry. The body is cold before it falls.')) }];
  }
  return [];
}

/** The crime's arm, the pickpocket's own: the crime set, the watch called. */
const crimeArm = (entity, onCrime) => (kind) => {
  setCrimeCommitted(entity, kind === 'murder' ? CRIMES.Murder : CRIMES.Assault);
  onCrime?.();
};

/**
 * STEAL MODE ON A TOWNSPERSON (townTalk.js's steal arm). Answers true when the vampire took the activation - an awakened
 * vampire always does (no purse is picked); false lets the pickpocket run.
 * @param {{ entity: any, target: { person: any, pos: number[] }, persons?: { person: any, pos: number[] }[], now: number,
 *   showBox: (box: any) => void, showWindow?: any, say: (line: string) => void, onCrime?: () => void, rolls?: () => number, regionIndex?: number }} o
 */
export function feedOnPerson({ entity, target, persons = [], now, showBox, showWindow = null, say, onCrime, rolls = Math.random, regionIndex = 0 }) {
  if (!awakenedVampirism(entity)) return false;
  const person = target?.person;
  if (!person) return false;
  const id = String(person.living?.id ?? person.interactionId ?? person.nameNPC ?? '');
  if (fedToday(entity, id, now)) { say(t('vampire.feed.already', 'They are still pale from your last visit.')); return true; }
  const town = person.living?.town ?? null;
  const pos = target.pos ?? person.pos;
  // the Living World's street witnesses (a clear line, within its WITNESS_M) - and anyone near among the persons the ray
  // was cast over, which in a room are the room's people (the street's witnesses never stand indoors)
  const near = persons.filter((p) => p.person !== person && Math.hypot(p.pos[0] - pos[0], p.pos[2] - pos[2]) <= NEAR_WITNESS_M);
  const ids = new Set();
  for (const w of town ? town.witnesses(pos, person.living.id) : []) ids.add(String(w.id));
  for (const p of near) ids.add(String(p.person?.living?.id ?? p.person?.nameNPC ?? ids.size));
  const seenBy = [...ids];
  const scouted = thrallState().scouted;   // PHASE 2: a servant's scouting marks richer blood
  const victim = { name: String(person.nameNPC ?? t('vampire.feed.someone', 'them')), type: archetypeOfPerson(person), quality: sightQuality(person), seen: seenBy.length };
  const canDrain = !!(town?.slain && town?.retire);
  // PHASE 2: unseen, a living townsperson may be TAKEN to the Haven (after the Kiss) or ENTHRALLED where they stand
  const res = person.living?.res ?? null;
  const role = socialRoleOf(person);
  const extra = [];
  const clan = awakenedVampirism(entity)?.clan ?? null;
  const kissAwake = clanKissesAwake(clan), kissCost = clanKissCost(clan, MIND_CLOUD_COST);   // PHASE 3: the clan's Kiss
  if (kissAwake && !victim.seen && res && canDrain && !captureRefusal(entity)) extra.push({ id: 'take', label: t('thrall.feed.take', 'Kiss them and take them to your Haven (work in progress, -{cost} Vitae)', { cost: kissCost }) });
  if (!victim.seen && res && role && !slotRefusal(entity) && !isSocialThrall(res.id)) extra.push({ id: 'enthrall', label: t('thrall.feed.enthrall', 'Enthrall them, your {role} in this town (work in progress, -{cost} Vitae)', { role: roleWord(role), cost: ENTHRALL_COST }) });
  const list = choices(canDrain, extra, { kiss: kissAwake, kissCost });
  const onBreach = (kind) => noteBreach(entity, regionIndex, kind, now);   // PHASE 3: the region's Masquerade
  const watch = victim.seen ? 0 : watcherChance(regionIndex, now);
  // PHASE 2: a watchman among the vampire's thralls hushes one witnessed bite a day in their town (never a death)
  const onSeen = (kind) => {
    town?.caught?.(person);
    if (kind === 'assault' && res && guardHushes(res.town, now)) { say(t('thrall.guard.hush', 'Your thrall in the watch looks the other way.')); return; }
    crimeArm(entity, onCrime)(kind);
  };
  present({ showBox, showWindow, entity, now, list,
    view: { name: victim.name, type: victim.type, quality: victim.quality, seen: victim.seen, scouted, wary: watch > 0 },
    rows: [...sightRows(victim.name, victim.type, victim.quality, victim.seen), ...(watch ? [t('masq.feed.wary', 'This region is wary of your kind. There may be eyes you cannot see.')] : [])],
    pick: (i) => {
        const c = list[i];
        const markFed = () => { markFedToday(entity, id, now); if (scouted) takeScouted(); };   // only a feed that happened uses them up
        // PHASE 3: a hidden watcher - a window, a doorway - in a wary region
        const spotted = !!c && c.id !== 'leave' && c.id !== 'enthrall' && watch > 0 && Math.floor(rolls() * 100) < watch;
        if (spotted) victim.seen = 1;
        const lead = spotted ? [{ rows: [t('masq.feed.spotted', 'A shutter bangs. Someone was watching.')] }] : [];
        if (c?.id === 'take') { if (spotted) { onSeen('assault'); onBreach('seen'); return lead; } return takeToHaven(entity, person, victim, now, () => { onBreach('taken'); markFed(); }); }
        if (c?.id === 'enthrall') return enthrallHere(entity, person, role, now, regionIndex);
        return [...lead, ...resolveChoice(entity, c?.id ?? 'leave', victim, {
          now, rolls, onSeen, reportChance: REPORT_CHANCE, onBreach, onFed: markFed,
          onReported: () => { town?.caught?.(person); crimeArm(entity, onCrime)('assault'); },
          onDrain: canDrain ? () => { town.slain(person); town.retire(person); } : null,
        })];
    },
  });
  return true;
}

/**
 * THE VISUAL PASS: the choice shown - the Blood Sight card in the player's skin (ui/vampire/bloodSightCard.js) where the
 * host hands a window slot (`showWindow`), else the quest box's chain as before. `pick(i)` the chosen row's consequence,
 * answering the boxes the chain would show (their rows are the card's words after).
 */
function present({ showBox, showWindow, entity, now, list, view, rows, pick }) {
  noteFirstUse('vampire-feeding');
  if (showWindow) {
    const win = openBloodSight({
      victim: view, choices: list,
      status: () => { const st = vampireStatus(entity, Math.floor(now)); return st ? { vitae: st.vitae, stage: st.stage } : null; },
      onPick: (id) => (pick(list.findIndex((c) => c.id === id)) ?? []).flatMap((b) => b?.rows ?? []),
    });
    if (win) { showWindow(win); return; }
  }
  showBox({ rows, onClick: () => [{ picker: list.map((c) => c.label), onPick: pick, onCancel: () => [] }] });
}

/** PHASE 2: the Kiss, and the townsperson taken to the Haven - gone from their town for good (their household's grief the
 *  Living World's, as a death's). */
function takeToHaven(entity, person, victim, now, onTaken) {
  const town = person.living.town, res = person.living.res;
  const refusal = captureRefusal(entity);
  if (refusal) return [{ rows: [refusal] }];
  if (!spendVitae(entity, clanKissCost(awakenedVampirism(entity)?.clan ?? null, MIND_CLOUD_COST), now)) return [{ rows: [t('vampire.feed.noVitae', 'You have too little Vitae for the Kiss.')] }];
  const p = takePrisoner(entity, { name: victim.name, gender: res.sex, type: victim.type, quality: victim.quality, mobile: mobileOfThrall(victim.type, res.cls), source: 'town', health: 70 });
  if (!p) return [{ rows: [captureRefusal(entity) ?? ''] }];
  onTaken();
  town.slain(person);
  town.retire(person);
  return [{ rows: [t('thrall.taken', 'The Kiss takes them, and they follow you into the dark. {name} waits in your Haven.', { name: p.name })] }];
}
/** PHASE 2: a social thrall bound where they stand. */
function enthrallHere(entity, person, role, now, regionIndex) {
  const res = person.living.res, town = person.living.town;
  const r = enthrallSocial(entity, { id: res.id, name: res.name, role, town: res.town, townName: String(town?.o?.town?.name ?? ''), region: Number.isInteger(town?.o?.town?.region) ? town.o.town.region : regionIndex }, now);
  if (typeof r === 'string') return [{ rows: [r] }];
  return [{ rows: [t('thrall.enthralled', '{name} looks into your eyes, and is yours. Your {role} here, while your blood keeps them.', { name: r.name, role: roleWord(role) })] }];
}

/** Whether a bed here holds a sleeper to feed on now (the bed rows are offered while it does).
 *  @param {any} entity @param {{ key: number, town: any } | null} building */
export function sleeperHere(entity, building) {
  if (!awakenedVampirism(entity) || !building?.town?.sleepersAt) return false;
  return building.town.sleepersAt(building.key).length > 0;
}

/**
 * STEAL MODE ON A BED (worldModes.js's bed rows): the first sleeper of the building not fed on today. The room's waking
 * people are the witnesses - each one a chance to be seen, less the vampire's Stealth. Answers true when it took the
 * activation.
 * @param {{ entity: any, building: { key: number, town: any } | null, now: number, showBox: (box: any) => void, showWindow?: any,
 *   say: (line: string) => void, onCrime?: () => void, rolls?: () => number, regionIndex?: number }} o
 */
export function feedOnSleeper({ entity, building, now, showBox, showWindow = null, say, onCrime, rolls = Math.random, regionIndex = -1 }) {
  if (!awakenedVampirism(entity) || !building?.town?.sleepersAt) return false;
  const { town, key } = building;
  const sleepers = town.sleepersAt(key);
  if (!sleepers.length) return false;
  const fresh = sleepers.filter((r) => !fedToday(entity, r.id, now));
  const res = fresh[0];
  if (!res) { say(t('vampire.feed.allPale', 'Everyone asleep here is already pale.')); return true; }
  if (fresh.length > 1) say(t('vampire.feed.moreAsleep', 'Still asleep in this house: {n}.', { n: fresh.length - 1 }));
  const awake = town.insideAt?.(key, town._now)?.length ?? 0;
  const stealth = skillValue(entity, SKILLS.Stealth) ?? 0;
  const seenChance = Math.min(90, (awake > 0 ? Math.max(5, awake * 20 - Math.floor(stealth / 3)) : 0) + watcherChance(regionIndex, now));   // PHASE 3: a wary region keeps a lamp lit
  const seen = !socialPerk('innkeeper', res.town) && Math.floor(rolls() * 100) < seenChance ? 1 : 0;   // PHASE 2: an innkeeper thrall in this town keeps the house quiet
  const pseudo = { living: { id: res.id, res }, nameNPC: res.name };
  const victim = { name: res.name, type: archetypeOfPerson(pseudo), quality: qualityOfPerson(pseudo), seen };
  const list = choices(true);
  const onSeen = (kind) => { town.wokeBitten?.(res); crimeArm(entity, onCrime)(kind); };
  const rows = [t('vampire.feed.sleeper', '{name} sleeps here.', { name: res.name }), ...sightRows(victim.name, victim.type, victim.quality, 0).slice(1, 2)];
  if (awake > 0) rows.push(t('vampire.feed.awake', 'Others are awake in the building.'));
  present({ showBox, showWindow, entity, now, list, rows,
    view: { name: res.name, type: victim.type, quality: victim.quality, seen: 0, sleeper: true, wary: watcherChance(regionIndex, now) > 0 || awake > 0 },
    pick: (i) => {
        const c = list[i];
        return resolveChoice(entity, c?.id ?? 'leave', victim, {
          now, rolls, onSeen, reportChance: SLEEPER_WAKES, onFed: () => markFedToday(entity, res.id, now), onBreach: (kind) => noteBreach(entity, regionIndex, kind, now),   // PHASE 3
          onReported: () => { town.wokeBitten?.(res); crimeArm(entity, onCrime)('assault'); },
          onDrain: (wasSeen) => { town.slainAsleep?.(res, wasSeen); },
        });
    },
  });
  return true;
}

/**
 * THE BEDS' HOST PART (worldModes.js: the bed rows while a sleeper lies here, and the bed's press first). `building()`
 * the host's current building and its Living World town ({ key, town }, null outside one or in the player's own room).
 * `live()` is asked as the room's targets are drawn, so it is read at most once a REAL second.
 * @param {{ entity: any, building: () => ({ key: number, town: any } | null), mode: () => string, now: () => number,
 *   showBox: (box: any) => void, showWindow?: any, say: (line: string) => void, onCrime?: () => void, region?: () => number }} o
 */
export function createVampireBeds({ entity, building, mode, now, showBox, showWindow = null, say, onCrime, region = () => -1 }) {
  setBloodSense(entity);   // the plaques read this vampire's Blood Sight
  let at = -Infinity, was = false;
  const stamp = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return {
    /** Whether the room's beds are feeding targets now: Steal mode, awakened, and a sleeper here. */
    live() {
      if (mode() !== 'steal' || !awakenedVampirism(entity)) return false;
      const ms = stamp();
      if (ms - at > 1000) { at = ms; was = sleeperHere(entity, building()); }
      return was;
    },
    /** The bed pressed: a feed when it is one (answers whether it took the press). */
    feed() {
      if (mode() !== 'steal') return false;
      return feedOnSleeper({ entity, building: building(), now: Math.floor(now()), showBox, showWindow, say, onCrime, regionIndex: region() });
    },
  };
}
