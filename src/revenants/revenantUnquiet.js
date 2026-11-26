// @ts-check
// Unquiet rules for revenants, all pure except the flight craft, which moves a live enemy.
import { MOBILE_TYPES as M } from '../characters/mobileTypes.js';
import { assignModBundle, isSilencedEffect, entityIsParalyzed } from '../magic/effects.js';
import { DISSOLVE_ARCANE } from '../render/dissolve.js';
import { playerDoor } from '../player/playerDoor.js';
import { t } from '../ui/textManager.js';
import { lessonOf, ADAPT_MAX, ADAPT } from './revenantFeud.js';
import { isClassEnemyId } from '../characters/enemyBasics.js';

export const BLOOD_RANK = 2;
export const SURVIVING_DEEDS = Object.freeze(['fled', 'routed']);
export const BLOOD_DEEDS = Object.freeze(['slew', 'felled']);
export const TEAR_RANK = 2;
export const deedRanks = (deed, blood, { unbroken = false, tears = 0 } = {}) => (deed === 'fled' && unbroken ? (tears | 0) >= TEAR_RANK
  : SURVIVING_DEEDS.includes(deed) || (BLOOD_DEEDS.includes(deed) && (blood | 0) >= BLOOD_RANK));
export const sanitizeBlood = (v) => (Number.isInteger(v) && v >= 0 ? Math.min(BLOOD_RANK - 1, v) : 0);
export const sanitizeTears = (v) => (Number.isInteger(v) && v >= 0 ? Math.min(TEAR_RANK - 1, v) : 0);

export const CRAFT = Object.freeze({
  RANK: 2,
  BOLT_PACE: 2.5,
  BLINK_PACE: 0.5,
  SINK_PACE: 0.05,
  SMOKE_ROUNDS: 2,
  BLINK_DELAY: 0.8,
  BLINK_MS: 600,
  SINK_DELAY: 200,
  SINK_MS: 1400,
});
export const CRAFTS = Object.freeze(['smoke', 'blink', 'sink', 'bolt']);
export const CRAFT_TINT = Object.freeze({ blink: DISSOLVE_ARCANE, sink: Object.freeze([0.5, 0.36, 0.2]) });
const BLINKERS = new Set([M.Mage, M.Sorcerer, M.Healer, M.Battlemage, M.Ghost, M.Wraith, M.Lich, M.AncientLich, M.Nymph, M.OrcShaman,
  M.FireDaedra, M.FrostDaedra, M.Daedroth, M.DaedraSeducer, M.DaedraLord, M.FireAtronach, M.IceAtronach, M.IronAtronach, M.FleshAtronach]);
const SINKERS = new Set([M.SkeletalWarrior, M.Zombie, M.Mummy, M.Vampire, M.VampireAncient, M.Spriggan]);
export function fleeCraftOf(mobileType) {
  if (!Number.isInteger(mobileType)) return 'bolt';
  if (BLINKERS.has(mobileType)) return 'blink';
  if (SINKERS.has(mobileType)) return 'sink';
  if (isClassEnemyId(mobileType) && mobileType !== M.None) return 'smoke';
  return 'bolt';
}
export const revenantCraft = (mobileType, rank) => ((rank | 0) >= CRAFT.RANK ? fleeCraftOf(mobileType) : null);
export const craftPace = (craft, pace) => (craft === 'bolt' ? CRAFT.BOLT_PACE : craft === 'blink' ? CRAFT.BLINK_PACE : craft === 'sink' ? CRAFT.SINK_PACE : pace);

export function beginCraft(f, craft, { now = Date.now() } = {}) {
  const e = f?.entity;
  if (!e || !craft) return;
  e._craft = craft;
  f._craft = { kind: craft, at: now, t: 0, hp: e.health, fired: 0, bundle: null };
  const at = f.ai?.feet ?? null;
  if (craft === 'smoke') {
    try { f._craft.bundle = assignModBundle(e, { name: t('rvn.unq.craft.smoke', 'Smoke'), kind: 'chameleonNormal', rounds: CRAFT.SMOKE_ROUNDS })?.bundleId ?? null; } catch { }
    puff(at);
  } else if (craft === 'sink') {
    f.portalFx = { dir: 'out', at: now, delay: CRAFT.SINK_DELAY, ms: CRAFT.SINK_MS, tint: CRAFT_TINT.sink };
    puff(at);
  }
}
function puff(at) {
  if (!at) return;
  try { playerDoor()?.fx?.('vanish', [at[0], at[1], at[2]]); } catch { }
}
export function craftStep(f, now = Date.now(), dt = null) {
  const c = f?._craft, e = f?.entity;
  if (!c || !e) return null;
  // The craft runs on the pool's clock, so a pool held under a window holds the craft too.
  c.t = Number.isFinite(dt) ? (c.t ?? 0) + Math.max(0, dt) * 1000 : now - c.at;
  if (c.kind === 'sink') {
    if (e.health < c.hp) { f.portalFx = null; c.kind = 'broken'; return 'broken'; }
    if (f.portalFx) f.portalFx.at = now - c.t;
    return c.t >= CRAFT.SINK_DELAY + CRAFT.SINK_MS ? 'gone' : null;
  }
  if (c.kind !== 'blink') return null;
  if (!c.fired) {
    if (c.t < CRAFT.BLINK_DELAY * 1000) return null;
    let held = false;
    try { held = isSilencedEffect(e) || entityIsParalyzed(e); } catch { held = false; }
    if (held) { c.kind = 'run'; return null; }
    c.fired = c.t; c.hp = e.health;
    f.portalFx = { dir: 'out', at: now, delay: 0, ms: CRAFT.BLINK_MS, tint: CRAFT_TINT.blink };
    puff(f.ai?.feet ?? null);
    return null;
  }
  if (e.health < c.hp) { f.portalFx = null; c.kind = 'run'; return null; }
  if (f.portalFx) f.portalFx.at = now - (c.t - c.fired);
  return c.t - c.fired >= CRAFT.BLINK_MS ? 'gone' : null;
}

// A last stand, a kneel, or a tear-away mid-flight ends the craft, lifts its smoke, and drops its dissolve, or the
// enemy would stay hidden or half sunk.
export function endCraft(f) {
  if (!f?._craft) return;
  const id = f._craft.bundle, e = f.entity;
  if (id != null && Array.isArray(e?.activeEffects)) e.activeEffects = e.activeEffects.filter((a) => a?.bundleId !== id);
  f._craft = null;
  if (f.portalFx?.dir === 'out') f.portalFx = null;
}

export const WOUND = Object.freeze({ MAX: 3, RESIST: -15, HEAL_DAYS: 5 });
export const healsOn = (woundDay, day) => { const n = day - woundDay; return Number.isInteger(woundDay) && woundDay >= 0 && n > 0 && n % WOUND.HEAL_DAYS === 0; };
export const daysToHeal = (woundDay, day, wounds) => (Array.isArray(wounds) && wounds.length && Number.isInteger(woundDay) && woundDay >= 0 ? WOUND.HEAL_DAYS - (Math.max(0, day - woundDay) % WOUND.HEAL_DAYS) : 0);
export const WOUNDS = Object.freeze({
  bled: Object.freeze({ from: Object.freeze(['blade']), health: 0.9 }),
  cracked: Object.freeze({ from: Object.freeze(['blunt', 'h2h']), poise: 0.7 }),
  maimed: Object.freeze({ from: Object.freeze(['axe']), blows: 0.9 }),
  lamed: Object.freeze({ from: Object.freeze(['arrow']), speed: -15 }),
  burned: Object.freeze({ from: Object.freeze(['fire']), resist: 'fire' }),
  frostbitten: Object.freeze({ from: Object.freeze(['frost']), resist: 'frost' }),
  stormstruck: Object.freeze({ from: Object.freeze(['shock']), resist: 'shock' }),
  blighted: Object.freeze({ from: Object.freeze(['poison']), resist: 'poison' }),
  hexed: Object.freeze({ from: Object.freeze(['magic']), resist: 'magic' }),
});
const WOUND_KEYS = Object.freeze(Object.keys(WOUNDS));
export const isWound = (v) => typeof v === 'string' && WOUND_KEYS.includes(v);
export const woundOf = (cls) => WOUND_KEYS.find((k) => WOUNDS[k].from.includes(cls)) ?? null;
export const withWound = (wounds, w) => (isWound(w) ? [...(Array.isArray(wounds) ? wounds : []).filter((x) => x !== w), w].slice(-WOUND.MAX) : [...(Array.isArray(wounds) ? wounds : [])]);
export const sanitizeWounds = (v) => (Array.isArray(v) ? [...new Set(v.filter(isWound))].slice(-WOUND.MAX) : []);
export function woundEffects(wounds) {
  let health = 1, blows = 1, poise = 1, speed = 0;
  /** @type {Record<string, number>} */
  const resist = {};
  for (const w of sanitizeWounds(wounds)) {
    const d = WOUNDS[w];
    if (d.health) health *= d.health;
    if (d.blows) blows *= d.blows;
    if (d.poise) poise *= d.poise;
    if (d.speed) speed += d.speed;
    if (d.resist) resist[d.resist] = (resist[d.resist] ?? 0) + WOUND.RESIST;
  }
  return Object.freeze({ health, blows, poise, speed, resist: Object.freeze(resist) });
}
export function woundedEdge(edge, wounds) {
  const w = woundEffects(wounds);
  if (w.poise === 1 && !Object.keys(w.resist).length) return edge;
  /** @type {Record<string, number>} */
  const resist = { ...(edge?.resist ?? {}) };
  for (const [el, n] of Object.entries(w.resist)) resist[el] = (resist[el] ?? 0) + n;
  return Object.freeze({ ...(edge ?? {}), poise: (edge?.poise ?? 1) * w.poise, resist: Object.freeze(resist) });
}

export const AMBITIONS = Object.freeze(['vengeance', 'mastery', 'plunder']);
const AMBITION_OF = Object.freeze({
  brutal: 'vengeance', zealous: 'vengeance', unhinged: 'vengeance',
  honourable: 'mastery', arrogant: 'mastery', cold: 'mastery',
  witty: 'plunder', humorous: 'plunder', craven: 'plunder', weary: 'plunder',
});
// Derived from the personality, never stored.
export const ambitionOf = (personality) => AMBITION_OF[personality] ?? 'vengeance';
export const AMBITION = Object.freeze({
  VENGEANCE_DUE: Object.freeze([1440, 2880]),
  VENGEANCE_RETURN: 0.55,
  FESTER_DAYS: 2,
  FESTER_EVERY: 2,
  PLUNDER_PER_DAY: 0.25,
  PLUNDER_MOST: 3,
});
export const masteryFestersOn = (dueDay, day) => { const past = day - dueDay - AMBITION.FESTER_DAYS; return past >= 0 && past % AMBITION.FESTER_EVERY === 0; };
export const plunderGold = (daysPast) => Math.min(AMBITION.PLUNDER_MOST, 1 + AMBITION.PLUNDER_PER_DAY * Math.max(0, Math.floor(Number(daysPast) || 0)));

export const DREAD = Object.freeze({ HEALTH: 1.5, STANDS: 2, SECOND_STAND: 0.25, GOLD: 3, MAX: 1 });
export const mayAscend = (r, max, dreads = 0) => !!r && !r.dread && (r.rank | 0) >= max && !!r.lair && (dreads | 0) < DREAD.MAX;
export const hoardOf = (dread, plunder = 1) => Math.max(dread ? DREAD.GOLD : 1, Number.isFinite(plunder) && plunder > 0 ? plunder : 1);
export const dreadStandHealth = (n, first) => (n >= 2 ? DREAD.SECOND_STAND : first);

// Training fills a free lesson slot and never trades one away. It never teaches an element's resistance, because the
// record keeps no career and a learned resistance must not stack on one from the career.
export function trainLesson(r) {
  if (!r || ambitionOf(r.personality) !== 'mastery') return null;
  const learned = Array.isArray(r.learned) ? r.learned : [];
  if (learned.length >= Math.min(r.rank | 0, ADAPT_MAX)) return null;
  const count = new Map(), last = new Map();
  (Array.isArray(r.scars) ? r.scars : []).forEach((s, i) => { if (s?.k) { count.set(s.k, (count.get(s.k) ?? 0) + 1); last.set(s.k, i); } });
  const kinds = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || last.get(b) - last.get(a));
  return lessonOf(kinds.filter((k) => k !== 'routed' && k !== 'night'), [...learned, ...Object.keys(ADAPT.RESIST_OF)], r.mobileType, null);
}
// Each word has its own key, because a word put into a sentence of another language takes that language's form.
export function trainedHow(a) {
  switch (a) {
    case 'mailed': return t('rvn.unq.how.mailed', 'blade');
    case 'braced': return t('rvn.unq.how.braced', 'hammer');
    case 'hewnHard': return t('rvn.unq.how.hewnHard', 'axe');
    case 'unflinching': return t('rvn.unq.how.unflinching', 'fists');
    case 'arrowWise': return t('rvn.unq.how.arrowWise', 'arrows');
    case 'fireproof': return t('rvn.unq.how.fireproof', 'fire');
    case 'rimebound': return t('rvn.unq.how.rimebound', 'frost');
    case 'grounded': return t('rvn.unq.how.grounded', 'lightning');
    case 'venomBlooded': return t('rvn.unq.how.venomBlooded', 'poison');
    case 'spellScarred': return t('rvn.unq.how.spellScarred', 'magic');
    case 'silverScarred': return t('rvn.unq.how.silverScarred', 'silver');
    case 'steadfast': return t('rvn.unq.how.steadfast', 'heavy blows');
    case 'patient': return t('rvn.unq.how.patient', 'footwork');
    case 'watchful': return t('rvn.unq.how.watchful', 'tricks from behind');
    case 'relentless': return t('rvn.unq.how.relentless', 'running');
    case 'nightStalker': return t('rvn.unq.how.nightStalker', 'night raids');
    default: return null;
  }
}

// Distance is the longer side in map pixels, and the earlier listed wins a tie. The result has the shape that
// sanitizeLair in revenantFeud.js reads.
export function nearestLair(px, py, dungeons) {
  if (!Number.isInteger(px) || !Number.isInteger(py)) return null;
  let best = null, bestD = Infinity;
  for (const d of Array.isArray(dungeons) ? dungeons : []) {
    if (!d || !Number.isInteger(d.px) || !Number.isInteger(d.py) || typeof d.name !== 'string' || !d.name) continue;
    const dist = Math.max(Math.abs(d.px - px), Math.abs(d.py - py));
    if (dist < bestD) { best = d; bestD = dist; }
  }
  return best ? { px: best.px, py: best.py, name: best.name.slice(0, 80), region: Number.isInteger(best.region) ? best.region : -1 } : null;
}

export const HUNT = Object.freeze({ MINUTES: 720, HEALTH: 0.6 });
export const trailWarm = (r, now) => !!r && !r.dread && Number.isFinite(r.trail) && r.trail > 0 && r.trail > now;
export const trailHours = (r, now) => (trailWarm(r, now) ? Math.ceil(Math.min(HUNT.MINUTES, r.trail - now) / 60) : 0);
export const sanitizeTrail = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function craftWords(craft) {
  switch (craft) {
    case 'smoke': return { name: t('rvn.unq.craft.smoke', 'Smoke'), effect: t('rvn.unq.craft.smokeDo', 'it throws down smoke and vanishes as it runs, but a blow can still find it') };
    case 'blink': return { name: t('rvn.unq.craft.blink', 'Blink'), effect: t('rvn.unq.craft.blinkDo', 'it tears open a rift and is gone. Silence it, hold it, or strike it as it fades') };
    case 'sink': return { name: t('rvn.unq.craft.sink', 'Sink'), effect: t('rvn.unq.craft.sinkDo', 'it sinks into the earth. Strike it before it is under, and it rises, cornered, and runs no more') };
    case 'bolt': return { name: t('rvn.unq.craft.bolt', 'Bolt'), effect: t('rvn.unq.craft.boltDo', 'it runs faster than anything you have chased. Bring it down from range, and break its will before the killing blow') };
    default: return null;
  }
}
export function craftFleeWords(craft, given) {
  switch (craft) {
    case 'smoke': return t('rvn.unq.flee.smoke', '{given} throws down smoke and is lost to sight!', { given });
    case 'blink': return t('rvn.unq.flee.blink', '{given} tears open a rift. Strike it before it is through!', { given });
    case 'sink': return t('rvn.unq.flee.sink', '{given} sinks into the earth. Strike it before it is under!', { given });
    case 'bolt': return t('rvn.unq.flee.bolt', '{given} bolts!', { given });
    default: return null;
  }
}
export function woundWords(w) {
  switch (w) {
    case 'bled': return { name: t('rvn.unq.wound.bled', 'Bled'), effect: t('rvn.unq.wound.bledDo', 'a wound that will not close, so it has less health') };
    case 'cracked': return { name: t('rvn.unq.wound.cracked', 'Cracked'), effect: t('rvn.unq.wound.crackedDo', 'cracked bones, so it staggers more easily') };
    case 'maimed': return { name: t('rvn.unq.wound.maimed', 'Maimed'), effect: t('rvn.unq.wound.maimedDo', 'a maimed hand, so its blows are lighter') };
    case 'lamed': return { name: t('rvn.unq.wound.lamed', 'Lamed'), effect: t('rvn.unq.wound.lamedDo', 'a lamed leg, so it runs slower') };
    case 'burned': return { name: t('rvn.unq.wound.burned', 'Burned'), effect: t('rvn.unq.wound.burnedDo', 'fire bites it deeper') };
    case 'frostbitten': return { name: t('rvn.unq.wound.frostbitten', 'Frostbitten'), effect: t('rvn.unq.wound.frostbittenDo', 'frost bites it deeper') };
    case 'stormstruck': return { name: t('rvn.unq.wound.stormstruck', 'Stormstruck'), effect: t('rvn.unq.wound.stormstruckDo', 'shock bites it deeper') };
    case 'blighted': return { name: t('rvn.unq.wound.blighted', 'Blighted'), effect: t('rvn.unq.wound.blightedDo', 'poison bites it deeper') };
    case 'hexed': return { name: t('rvn.unq.wound.hexed', 'Hexed'), effect: t('rvn.unq.wound.hexedDo', 'magic bites it deeper') };
    default: return null;
  }
}
export function ambitionWords(a) {
  switch (a) {
    case 'vengeance': return { name: t('rvn.unq.amb.vengeance', 'Vengeance'), effect: t('rvn.unq.amb.vengeanceDo', 'it comes for you sooner, and more often') };
    case 'mastery': return { name: t('rvn.unq.amb.mastery', 'Mastery'), effect: t('rvn.unq.amb.masteryDo', 'it trains while it waits, and grows bolder every 2 days instead of 3') };
    case 'plunder': return { name: t('rvn.unq.amb.plunder', 'Plunder'), effect: t('rvn.unq.amb.plunderDo', 'it raids the roads while it waits, and grows richer the longer you leave it') };
    default: return null;
  }
}
export const trainedWords = (given, how) => t('rvn.unq.trained', '{given} has been training. It has learned to answer your {how}.', { given, how });
export const healWords = (days) => t('rvn.unq.page.heals', 'The oldest heals in {days, plural, one {# day} other {# days}} unless you find it first.', { days });
export const trailWords = (lair) => t('rvn.unq.trail', 'Its trail leads to {lair}, where it has gone to ground to recover. Catch it before it is whole again.', { lair });
export function omenWords(a, given) {
  switch (a) {
    case 'mastery': return t('rvn.unq.omen.mastery', 'Word reaches you that {given} is ready to face you again.', { given });
    case 'plunder': return t('rvn.unq.omen.plunder', 'Travelers speak of {given} on the roads again. It is coming for you.', { given });
    default: return t('rvn.unq.omen.vengeance', 'You feel eyes on your back. {given} is hunting you again.', { given });
  }
}
export function ambitionRumor(a) {
  switch (a) {
    case 'vengeance': return t('rvn.unq.rumor.vengeance', 'Word is it asks after you by name.');
    case 'mastery': return t('rvn.unq.rumor.mastery', 'Word is it trains day and night for the day it meets you again.');
    case 'plunder': return t('rvn.unq.rumor.plunder', 'Word is it has been raiding the roads.');
    default: return '';
  }
}
