// @ts-check

import { SKILLS, MAGIC_SKILLS, SKILL_NAMES } from './skills.js';
import { masterSkillsActive, isMasteredSkill, masteredSkills, masterableCount } from './masterSkills.js';
import { t } from '../ui/textManager.js';

const { Destruction: DES, Restoration: RES, Illusion: ILL, Alteration: ALT, Thaumaturgy: THA, Mysticism: MYS } = SKILLS;

const FIRE = 0, SHOCK = 3, MAGIC = 4;
const SELF = 0, AT_RANGE = 2;

const d = (durationBase, durationMod, durationPerLevel) => ({ durationBase, durationMod, durationPerLevel });
const c = (chanceBase, chanceMod, chancePerLevel) => ({ chanceBase, chanceMod, chancePerLevel });
const m = (magnitudeBaseLow, magnitudeBaseHigh, magnitudeLevelBase, magnitudeLevelHigh, magnitudePerLevel) =>
  ({ magnitudeBaseLow, magnitudeBaseHigh, magnitudeLevelBase, magnitudeLevelHigh, magnitudePerLevel });
const slot = (type, subType, ...parts) => Object.freeze({ type, subType, settings: Object.freeze(Object.assign({}, ...parts)) });
const DAMAGE_HEALTH = (...p) => slot(4, 0, ...p);
const HEAL_HEALTH = (...p) => slot(10, 8, ...p);

// Persisted in bought spells: the band never moves (-46101..-46115).
export const SIGNATURE_INDEX_BASE = -46100;

export const SPEC_RESET_GOLD = 200000;

export const PATH_NUMBERS = Object.freeze({
  spellsteel: Object.freeze({ pct: 15 }),
  slipAway: Object.freeze({ below: 1 / 3, rounds: 5, recover: 120 }),
  betweenMoments: Object.freeze({ pct: 20 }),
  steadfast: Object.freeze({ pct: 1 }),
  attunedWards: Object.freeze({ pct: 20 }),
  unseenStrike: Object.freeze({ pct: 25 }),
  sunder: Object.freeze({ points: 10 }),
  sanguine: Object.freeze({ perMissing: 2, most: 25 }),
  conflux: Object.freeze({ pct: 3, stacks: 5, seconds: 10 }),
  foresight: Object.freeze({ oneIn: 8 }),
  dawnsWard: Object.freeze({ pct: 20 }),
  glamour: Object.freeze({ personality: 10, etiquette: 15, streetwise: 15 }),
  deathsDue: Object.freeze({ health: 5, magicka: 5 }),
  soulWell: Object.freeze({ magicka: 10, trapped: 20 }),
  absolution: Object.freeze({ below: 0.3, heal: 25, recover: 180 }),
  aegisBolt: Object.freeze({ times: 2, most: 20, rounds: 8 }),
  fleetingHold: Object.freeze({ rounds: 6 }),
  riftLance: Object.freeze({ metres: 4, share: 1 / 3 }),
  livingAegis: Object.freeze({ seconds: 30, lighter: 20 }),
  prismaticWard: Object.freeze({ seconds: 30, chance: 40 }),
  shadowBolt: Object.freeze({ rounds: 3 }),
  unravel: Object.freeze({ back: 1 / 3 }),
  bloodBoil: Object.freeze({ below: 0.3 }),
  chainLightning: Object.freeze({ metres: 8, foes: 2, share: 1 / 2 }),
  psychicLance: Object.freeze({ seconds: 12, points: 20 }),
  dawnbolt: Object.freeze({ heal: 1 / 5, burn: 1 / 2 }),
  siphonLife: Object.freeze({ share: 1 / 2 }),
  soulLance: Object.freeze({ share: 1 / 4 }),
  sanctify: Object.freeze({ chance: 30, rounds: 6 }),
});
const N = PATH_NUMBERS;
const pc = (x) => Math.round(x * 100);

const AEGIS_BOLT = 'Aegis Bolt';
const FLEETING_HOLD = 'Fleeting Hold';
const RIFT_LANCE = 'Rift Lance';
const LIVING_AEGIS = 'Living Aegis';
const PRISMATIC_WARD = 'Prismatic Ward';
const SHADOW_BOLT = 'Shadow Bolt';
const UNRAVEL = 'Unravel';
const BLOOD_BOIL = 'Blood Boil';
const CHAIN_LIGHTNING = 'Chain Lightning';
const PSYCHIC_LANCE = 'Psychic Lance';
const DAWNBOLT = 'Dawnbolt';
const BEGUILE = 'Beguile';
const SIPHON_LIFE = 'Siphon Life';
const SOUL_LANCE = 'Soul Lance';
const SANCTIFY = 'Sanctify';

const WORDS = Object.freeze({
  battlemage: () => ({
    name: t('schools.battlemage.name', 'Battlemage'),
    spell: t('schools.battlemage.spell', AEGIS_BOLT),
    passiveName: t('schools.battlemage.passive', 'Spellsteel'),
    passive: t('schools.battlemage.passiveText', 'While your Shield holds, your damage spells deal {pct}% more damage.', { pct: N.spellsteel.pct }),
    rider: t('schools.battlemage.rider', 'Gives you a Shield worth {times} times the damage dealt (up to {most}% of your health) for {rounds} rounds.', { times: N.aegisBolt.times, most: N.aegisBolt.most, rounds: N.aegisBolt.rounds }),
  }),
  trickster: () => ({
    name: t('schools.trickster.name', 'Trickster'),
    spell: t('schools.trickster.spell', FLEETING_HOLD),
    passiveName: t('schools.trickster.passive', 'Slip Away'),
    passive: t('schools.trickster.passiveText', 'When damage drops you below {pct}% health, you turn invisible for {rounds} rounds. This can happen once every {minutes} minutes.', { pct: pc(N.slipAway.below), rounds: N.slipAway.rounds, minutes: N.slipAway.recover / 60 }),
    rider: t('schools.trickster.rider', 'If it takes hold, you gain Chameleon for {rounds} rounds.', { rounds: N.fleetingHold.rounds }),
  }),
  riftwalker: () => ({
    name: t('schools.riftwalker.name', 'Riftwalker'),
    spell: t('schools.riftwalker.spell', RIFT_LANCE),
    passiveName: t('schools.riftwalker.passive', 'Between Moments'),
    passive: t('schools.riftwalker.passiveText', 'You cast spells {pct}% faster.', { pct: N.betweenMoments.pct }),
    rider: t('schools.riftwalker.rider', 'Other enemies within {metres} meters of the target take {pct}% of the damage.', { metres: N.riftLance.metres, pct: pc(N.riftLance.share) }),
  }),
  warden: () => ({
    name: t('schools.warden.name', 'Warden'),
    spell: t('schools.warden.spell', LIVING_AEGIS),
    passiveName: t('schools.warden.passive', 'Steadfast'),
    passive: t('schools.warden.passiveText', 'While your Shield holds, you regain {pct}% of your health each round.', { pct: N.steadfast.pct }),
    rider: t('schools.warden.rider', 'For {seconds} seconds, enemy blows deal {pct}% less damage to you.', { seconds: N.livingAegis.seconds, pct: N.livingAegis.lighter }),
  }),
  wardwright: () => ({
    name: t('schools.wardwright.name', 'Wardwright'),
    spell: t('schools.wardwright.spell', PRISMATIC_WARD),
    passiveName: t('schools.wardwright.passive', 'Attuned Wards'),
    passive: t('schools.wardwright.passiveText', 'Your Alteration and Thaumaturgy spells cost {pct}% less magicka.', { pct: N.attunedWards.pct }),
    rider: t('schools.wardwright.rider', 'For {seconds} seconds, each Destruction spell that hits you has a {pct}% chance to be absorbed, if you have room for the magicka.', { seconds: N.prismaticWard.seconds, pct: N.prismaticWard.chance }),
  }),
  shadowcaster: () => ({
    name: t('schools.shadowcaster.name', 'Shadowcaster'),
    spell: t('schools.shadowcaster.spell', SHADOW_BOLT),
    passiveName: t('schools.shadowcaster.passive', 'Unseen Strike'),
    passive: t('schools.shadowcaster.passiveText', 'While you have Invisibility, Chameleon or Shadow, your damage spells deal {pct}% more damage.', { pct: N.unseenStrike.pct }),
    rider: t('schools.shadowcaster.rider', 'On a hit, you gain Shadow for {rounds} rounds.', { rounds: N.shadowBolt.rounds }),
  }),
  spellbreaker: () => ({
    name: t('schools.spellbreaker.name', 'Spellbreaker'),
    spell: t('schools.spellbreaker.spell', UNRAVEL),
    passiveName: t('schools.spellbreaker.passive', 'Sunder'),
    passive: t('schools.spellbreaker.passiveText', 'Enemies\' saving throws against your damage spells are {points} lower.', { points: N.sunder.points }),
    rider: t('schools.spellbreaker.rider', 'On a hit, refunds {pct}% of its magicka cost.', { pct: pc(N.unravel.back) }),
  }),
  bloodmage: () => ({
    name: t('schools.bloodmage.name', 'Bloodmage'),
    spell: t('schools.bloodmage.spell', BLOOD_BOIL),
    passiveName: t('schools.bloodmage.passive', 'Sanguine Tide'),
    passive: t('schools.bloodmage.passiveText', 'Your damage spells deal 1% more damage for every {per}% of health you are missing, up to {most}%.', { per: N.sanguine.perMissing, most: N.sanguine.most }),
    rider: t('schools.bloodmage.rider', 'If the target is below {pct}% health after the hit, it takes the same damage again.', { pct: pc(N.bloodBoil.below) }),
  }),
  elementalist: () => ({
    name: t('schools.elementalist.name', 'Elementalist'),
    spell: t('schools.elementalist.spell', CHAIN_LIGHTNING),
    passiveName: t('schools.elementalist.passive', 'Conflux'),
    passive: t('schools.elementalist.passiveText', 'Each of your damage spells that hits adds {pct}% to your spell damage for {seconds} seconds, building up to {stacks} times.', { seconds: N.conflux.seconds, pct: N.conflux.pct, stacks: N.conflux.stacks }),
    rider: t('schools.elementalist.rider', 'Jumps to up to {foes} other enemies within {metres} meters, dealing {pct}% of the damage.', { foes: N.chainLightning.foes, metres: N.chainLightning.metres, pct: pc(N.chainLightning.share) }),
  }),
  seer: () => ({
    name: t('schools.seer.name', 'Seer'),
    spell: t('schools.seer.spell', PSYCHIC_LANCE),
    passiveName: t('schools.seer.passive', 'Foresight'),
    passive: t('schools.seer.passiveText', 'One enemy blow in {n} misses you.', { n: N.foresight.oneIn }),
    rider: t('schools.seer.rider', 'For {seconds} seconds, the target\'s saving throws against your damage spells are {points} lower.', { seconds: N.psychicLance.seconds, points: N.psychicLance.points }),
  }),
  lightbringer: () => ({
    name: t('schools.lightbringer.name', 'Lightbringer'),
    spell: t('schools.lightbringer.spell', DAWNBOLT),
    passiveName: t('schools.lightbringer.passive', 'Dawn\'s Ward'),
    passive: t('schools.lightbringer.passiveText', 'Your damage spells deal {pct}% more damage to undead and daedra.', { pct: N.dawnsWard.pct }),
    rider: t('schools.lightbringer.rider', 'Heals you for {heal}% of the damage dealt. Undead and daedra take an extra {burn}% of the damage.', { heal: pc(N.dawnbolt.heal), burn: pc(N.dawnbolt.burn) }),
  }),
  enchanter: () => ({
    name: t('schools.enchanter.name', 'Enchanter'),
    spell: t('schools.enchanter.spell', BEGUILE),
    passiveName: t('schools.enchanter.passive', 'Glamour'),
    passive: t('schools.enchanter.passiveText', '+{personality} Personality, +{etiquette} Etiquette and +{streetwise} Streetwise.', { personality: N.glamour.personality, etiquette: N.glamour.etiquette, streetwise: N.glamour.streetwise }),
    rider: t('schools.enchanter.rider', 'If it calms the target, its magicka cost is refunded.'),
  }),
  necromancer: () => ({
    name: t('schools.necromancer.name', 'Necromancer'),
    spell: t('schools.necromancer.spell', SIPHON_LIFE),
    passiveName: t('schools.necromancer.passive', 'Death\'s Due'),
    passive: t('schools.necromancer.passiveText', 'Each kill restores {health}% of your health and {magicka}% of your magicka.', { health: N.deathsDue.health, magicka: N.deathsDue.magicka }),
    rider: t('schools.necromancer.rider', 'Heals you for {pct}% of the damage dealt.', { pct: pc(N.siphonLife.share) }),
  }),
  soulbinder: () => ({
    name: t('schools.soulbinder.name', 'Soulbinder'),
    spell: t('schools.soulbinder.spell', SOUL_LANCE),
    passiveName: t('schools.soulbinder.passive', 'Soul Well'),
    passive: t('schools.soulbinder.passiveText', 'Each kill restores {pct}% of your magicka ({trapped}% if your Soul Trap was on the target).', { pct: N.soulWell.magicka, trapped: N.soulWell.trapped }),
    rider: t('schools.soulbinder.rider', 'Restores magicka equal to {pct}% of the damage dealt.', { pct: pc(N.soulLance.share) }),
  }),
  hierophant: () => ({
    name: t('schools.hierophant.name', 'Hierophant'),
    spell: t('schools.hierophant.spell', SANCTIFY),
    passiveName: t('schools.hierophant.passive', 'Absolution'),
    passive: t('schools.hierophant.passiveText', 'When damage drops you below {below}% health, you heal {pct}% of your health. This can happen once every {minutes} minutes.', { below: pc(N.absolution.below), pct: N.absolution.heal, minutes: N.absolution.recover / 60 }),
    rider: t('schools.hierophant.rider', 'Gives you {pct}% Spell Resistance for {rounds} rounds.', { pct: N.sanctify.chance, rounds: N.sanctify.rounds }),
  }),
});
const SPELL_EN = Object.freeze({ battlemage: AEGIS_BOLT, trickster: FLEETING_HOLD, riftwalker: RIFT_LANCE, warden: LIVING_AEGIS, wardwright: PRISMATIC_WARD, shadowcaster: SHADOW_BOLT, spellbreaker: UNRAVEL, bloodmage: BLOOD_BOIL, elementalist: CHAIN_LIGHTNING, seer: PSYCHIC_LANCE, lightbringer: DAWNBOLT, enchanter: BEGUILE, necromancer: SIPHON_LIFE, soulbinder: SOUL_LANCE, hierophant: SANCTIFY });
export const pathWords = (id) => WORDS[id]?.() ?? null;

/** @type {Array<[string, number[], [number, number, number, number, ReadonlyArray<any>]]>} */
const PATH_ROWS = [
  ['battlemage', [ALT, DES], [1, 23, SHOCK, AT_RANGE, [DAMAGE_HEALTH(m(10, 18, 2, 3, 1))]]],
  ['trickster', [ALT, ILL], [2, 30, MAGIC, AT_RANGE, [slot(0, 255, d(2, 1, 4), c(35, 2, 2))]]],
  ['riftwalker', [ALT, MYS], [3, 47, MAGIC, AT_RANGE, [DAMAGE_HEALTH(m(8, 16, 2, 3, 1))]]],
  ['warden', [ALT, RES], [4, 36, MAGIC, SELF, [slot(35, 255, d(8, 1, 2), m(10, 20, 2, 3, 1)), HEAL_HEALTH(m(8, 14, 1, 2, 1))]]],
  ['wardwright', [ALT, THA], [5, 12, MAGIC, SELF, [slot(8, 0, d(10, 2, 2), c(25, 2, 2)), slot(8, 1, d(10, 2, 2), c(25, 2, 2)), slot(8, 3, d(10, 2, 2), c(25, 2, 2))]]],
  ['shadowcaster', [DES, ILL], [6, 52, MAGIC, AT_RANGE, [DAMAGE_HEALTH(m(8, 16, 2, 3, 1))]]],
  ['spellbreaker', [DES, MYS], [7, 41, MAGIC, AT_RANGE, [DAMAGE_HEALTH(m(8, 14, 2, 3, 1)), slot(19, 255, d(3, 1, 4), c(30, 2, 2))]]],
  ['bloodmage', [DES, RES], [8, 3, FIRE, AT_RANGE, [DAMAGE_HEALTH(m(10, 18, 2, 3, 1))]]],
  ['elementalist', [DES, THA], [9, 25, SHOCK, AT_RANGE, [DAMAGE_HEALTH(m(10, 18, 2, 3, 1))]]],
  ['seer', [ILL, MYS], [10, 44, MAGIC, AT_RANGE, [DAMAGE_HEALTH(m(8, 14, 2, 3, 1))]]],
  ['lightbringer', [ILL, RES], [11, 18, MAGIC, AT_RANGE, [DAMAGE_HEALTH(m(8, 16, 2, 3, 1))]]],
  ['enchanter', [ILL, THA], [12, 33, MAGIC, AT_RANGE, [slot(33, 2, c(30, 2, 2)), slot(34, 255, c(30, 2, 2))]]],
  ['necromancer', [RES, MYS], [13, 57, MAGIC, AT_RANGE, [DAMAGE_HEALTH(m(8, 16, 2, 3, 1))]]],
  ['soulbinder', [MYS, THA], [14, 62, MAGIC, AT_RANGE, [slot(12, 255, d(6, 1, 2), c(40, 2, 2)), DAMAGE_HEALTH(m(6, 12, 2, 3, 1))]]],
  ['hierophant', [RES, THA], [15, 9, MAGIC, SELF, [HEAL_HEALTH(m(12, 20, 2, 4, 1)), slot(3, 1, c(100, 1, 20)), slot(3, 0, c(100, 1, 20))]]],
];
export const PATHS = Object.freeze(PATH_ROWS.map(([id, schools, [n, icon, element, rangeType, slots]]) => Object.freeze({
  id, schools: Object.freeze([...schools]),
  spell: Object.freeze({ get name() { return pathWords(id).spell; }, nameEn: SPELL_EN[id], index: SIGNATURE_INDEX_BASE - n, icon, element, rangeType, slots: Object.freeze([...slots]) }),
  get name() { return pathWords(id).name; },
  get passive() { const w = pathWords(id); return { name: w.passiveName, text: w.passive }; },
  get rider() { return pathWords(id).rider; },
})));

export const PATH_BY_ID = Object.freeze(Object.fromEntries(PATHS.map((p) => [p.id, p])));
export const isPathId = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(PATH_BY_ID, id);
const pairKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
const PATH_BY_PAIR = new Map(PATHS.map((p) => [pairKey(p.schools[0], p.schools[1]), p]));
export const pathOfPair = (a, b) => (a !== b ? PATH_BY_PAIR.get(pairKey(a, b)) ?? null : null);
export const pathOfSignatureIndex = (index) => PATHS.find((p) => p.spell.index === index) ?? null;
export const isSignatureSpell = (sp) => !!sp && isPathId(sp.path) && sp.index === PATH_BY_ID[sp.path].spell.index;

const schoolsOf = (p) => ({ a: SKILL_NAMES[p.schools[0]], b: SKILL_NAMES[p.schools[1]] });
export const pathSchoolsText = (p) => t('schools.choice.schools', '{a} and {b}', schoolsOf(p));
export const pathPossible = (entity) => masterableCount(entity, MAGIC_SKILLS) >= 2;

/** @returns {number[]} */
export const masteredSchools = (entity) => MAGIC_SKILLS.filter((id) => masteredSkills(entity).includes(id));
export const pathOf = (entity) => (isPathId(entity?.arcanePath) ? PATH_BY_ID[entity.arcanePath] : null);

export function pathChoices(entity) {
  if (!entity || pathOf(entity) || !masterSkillsActive(entity)) return [];
  const have = masteredSchools(entity);
  return PATHS.filter((p) => have.includes(p.schools[0]) && have.includes(p.schools[1]));
}

export function pathRefusal(entity, id) {
  if (!isPathId(id)) return t('schools.refuse.none', 'No such specialization.');
  if (pathOf(entity)) return t('schools.refuse.already', 'Your specialization is already chosen: {name}.', { name: pathOf(entity).name });
  if (!masterSkillsActive(entity)) return t('schools.refuse.off', 'Master Skills is off.');
  const p = PATH_BY_ID[id];
  if (!p.schools.every((s) => isMasteredSkill(entity, s))) return t('schools.refuse.schools', 'Master {a} and {b} first.', schoolsOf(p));
  return null;
}

export function choosePath(entity, id) {
  const why = pathRefusal(entity, id);
  if (why) return { ok: false, text: why };
  entity.arcanePath = id;
  const p = PATH_BY_ID[id];
  return { ok: true, text: t('schools.chosen', 'Specialization chosen: {name}.', { name: p.name }) };
}

export const PATH_DECLINED_TEXT = 'You can choose a specialization later in your skill screen.';
export const pathDeclinedText = () => t('schools.declined', PATH_DECLINED_TEXT);
export const PATH_DECLINED_GROWTH_TEXT = 'You can choose a specialization later on the Growth tab of the pause menu.';
export const pathDeclinedGrowthText = () => t('schools.declinedGrowth', PATH_DECLINED_GROWTH_TEXT);

export const nextPathChoice = (entity) => (entity?.pathPrompted ? null : pathChoices(entity)[0] ?? null);

export const pathPowerRows = (p) => [
  t('schools.row.passive', '{name}: {text}', { name: p.passive.name, text: p.passive.text }),
  t('schools.row.spell', '{spell} (signature spell): {text}', { spell: p.spell.name, text: p.rider }),
];

export function pathChoiceRows(entity, id, { others = true } = {}) {
  const p = PATH_BY_ID[id];
  if (!p) return [];
  const more = others ? pathChoices(entity).length - 1 : 0;
  return [
    t('schools.choice.title', 'Specialize as {name}?', { name: p.name }),
    pathSchoolsText(p),
    '',
    ...pathPowerRows(p),
    '',
    t('schools.choice.reset', 'Resetting it later costs {gold, number} gold.', { gold: SPEC_RESET_GOLD }),
    ...(more > 0 ? [t('schools.choice.others', '{n, plural, one {# other specialization is open to you.} other {# other specializations are open to you.}}', { n: more })] : []),
  ];
}

export function pathsOpenRows(open, { growth = false } = {}) {
  return [
    t('schools.open.title', 'Specialization'),
    '',
    t('schools.open.count', '{n, plural, one {# specialization is open to you:} other {# specializations are open to you:}}', { n: open.length }),
    open.map((p) => p.name).join(', '),
    '',
    growth ? t('schools.open.whereGrowth', 'See them all and choose one on the Growth tab of the pause menu.')
      : t('schools.open.where', 'Choose one in your skill screen.'),
    t('schools.choice.reset', 'Resetting it later costs {gold, number} gold.', { gold: SPEC_RESET_GOLD }),
  ];
}

export function pathAboutRows(p) {
  if (!p) return [];
  return [t('schools.about.title', '{name}: {a} and {b}', { name: p.name, ...schoolsOf(p) }), '', ...pathPowerRows(p)];
}

export function pathAwake(entity) {
  return entity?._mentor ? null : pathHeld(entity);
}
export function pathHeld(entity) {
  if (!entity?.isPlayer || entity.peer) return null;
  const p = pathOf(entity);
  if (!p || !masterSkillsActive(entity) || !p.schools.every((s) => isMasteredSkill(entity, s))) return null;
  return p;
}

export function pathCastSchool(entity, spell, school) {
  if (!spell || !isSignatureSpell(spell)) return school;
  const p = pathHeld(entity);
  if (!p || p.id !== spell.path) return school;
  if (p.schools.includes(school)) return school;
  const [a, b] = p.schools;
  const v = (id) => (Array.isArray(entity.skills) && Number.isFinite(entity.skills[id]) ? entity.skills[id] : 0);
  return v(b) > v(a) ? b : a;
}

export function pathFindings(save) {
  const out = [];
  if (!save || typeof save !== 'object') return out;
  const raw = save.arcanePath;
  if (raw == null) return out;
  if (!isPathId(raw)) return [{ code: 'path', at: 'id' }];
  const mastered = Array.isArray(save.masteredSkills) ? save.masteredSkills : [];
  if (!PATH_BY_ID[raw].schools.every((s) => mastered.includes(s))) out.push({ code: 'path', at: 'schools' });
  return out;
}

export function pathWitnessed(spells, masteredSkills) {
  const ids = new Set((Array.isArray(spells) ? spells : []).filter(isSignatureSpell).map((sp) => sp.path));
  if (ids.size !== 1) return null;
  const id = [...ids][0];
  const mastered = Array.isArray(masteredSkills) ? masteredSkills : [];
  return PATH_BY_ID[id].schools.every((s) => mastered.includes(s)) ? id : null;
}
