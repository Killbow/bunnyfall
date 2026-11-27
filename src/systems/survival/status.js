import { survivalOf, hungerStage, thirstStage, sleepStage, wetStage, hungerMinutes, NEED, BOON, warmedByFire, wakingHeld, heartyMealLeft } from './needs.js';
import { t } from '../../ui/textManager.js';
import { STAT_KEYS_ORDER } from '../../characters/statMods.js';
import { temperatureWord, signedDegrees } from './temperature.js';
import { isStiff } from './rest.js';
import { SURVIVAL_RULES, SURVIVAL_DEFAULT } from './difficulty.js';

export const HUD_NEED_WORDS = Object.freeze({
  hunger: Object.freeze({ peckish: 'Peckish', hungry: 'Hungry', starving: 'Starving' }),
  thirst: Object.freeze({ thirsty: 'Thirsty', parched: 'Parched', dehydrated: 'Dehydrated' }),
  sleep: Object.freeze({ tired: 'Tired', drowsy: 'Drowsy', exhausted: 'Exhausted' }),
  wet: Object.freeze({ damp: 'Damp', wet: 'Wet', soaked: 'Soaked', drenched: 'Drenched' }),
  temp: Object.freeze({ warm: 'Warm', hot: 'Hot', scorching: 'Scorching', cold: 'Cold', freezing: 'Freezing', 'deadly cold': 'Deadly cold' }),
});
// 'danger' marks exactly the stages the live tier charges for each minute in needs.js; 'warn' is felt only.
// Drenched stays 'warn' in every tier because its cost comes through the felt temperature.
export function needLevel(key, stage, { rules = null, felt = 0, warmed = false, held = false } = {}) {
  const r = rules ?? SURVIVAL_RULES[SURVIVAL_DEFAULT];
  const tires = r.stamina.floor < 1, takes = !!r.attributes;
  if (key === 'hunger') return tires && stage === 'starving' ? 'danger' : 'warn';
  if (key === 'thirst') return tires && (stage === 'parched' || stage === 'dehydrated') ? 'danger' : 'warn';
  if (key === 'sleep') return !held && (takes || (tires && stage === 'exhausted')) ? 'danger' : 'warn';
  if (key === 'temp') return tires && !warmed && (felt >= r.stamina.hotFrom || felt <= r.stamina.coldFrom) ? 'danger' : 'warn';
  if (key === 'stiff') return takes ? 'danger' : 'warn';
  return 'warn';
}
export const LEVEL_WORDS = Object.freeze({ danger: 'it costs you', warn: 'no cost to you yet' });
export const levelSaid = (word, level) => (Object.hasOwn(LEVEL_WORDS, level) ? `${word} - ${LEVEL_WORDS[level]}` : word);
export const HEARTY_MEAL_CHIP = 'meal';
export const heartyMealWord = () => t('survival.boon.meal', 'Well Fed');
export const HEARTY_MEAL_GLYPH = 'hunger';
export const HUD_BOON_WORDS = Object.freeze({
  fed: Object.freeze(['Well fed', 'hunger']), quenched: Object.freeze(['Quenched', 'thirst']), rested: Object.freeze(['Well rested', 'sleep']),
  thriving: Object.freeze(['Thriving', 'thriving']), hearth: Object.freeze(['Hearth', 'hearth']),
});
const tierOf = (s, rules) => rules ?? (Array.isArray(s.boons) ? SURVIVAL_RULES.boons : SURVIVAL_RULES.casual);
const warmedBy = (s, word) => !!s.warmed && (word === 'cold' || word === 'freezing' || word === 'deadly cold');

const COLD_WORDS = Object.freeze(['cold', 'freezing', 'deadly cold']);
const NEED_LADDERS = Object.freeze({
  hunger: Object.keys(HUD_NEED_WORDS.hunger), thirst: Object.keys(HUD_NEED_WORDS.thirst), sleep: Object.keys(HUD_NEED_WORDS.sleep), wet: Object.keys(HUD_NEED_WORDS.wet),
  warm: Object.keys(HUD_NEED_WORDS.temp).filter((w) => !COLD_WORDS.includes(w)), cold: COLD_WORDS,
});
const needLadder = (key, stage) => (key === 'temp' ? (NEED_LADDERS.cold.includes(stage) ? NEED_LADDERS.cold : NEED_LADDERS.warm) : NEED_LADDERS[key]);

export function survivalHudChips(entity, now, { vampire = false, endurance = 50, rules = null, live = null } = {}) {
  if (!entity?.survival) return [];
  const s = survivalOf(entity, now);
  const tier = tierOf(s, rules);
  const out = [];
  const push = (key, table, stage, at = {}) => {
    const text = table[stage];
    if (!text) return;
    const ladder = needLadder(key, stage);
    out.push({ key, text, level: needLevel(key, stage, { rules: tier, ...at }), tier: ladder.indexOf(stage) + 1, of: ladder.length });
  };
  if (!vampire) push('hunger', HUD_NEED_WORDS.hunger, hungerStage(hungerMinutes(s, now)));
  if (!vampire) push('thirst', HUD_NEED_WORDS.thirst, thirstStage(s.thirst));
  if (!vampire) push('sleep', HUD_NEED_WORDS.sleep, sleepStage(s.sleepDebt), { held: wakingHeld(s, now) });
  push('wet', HUD_NEED_WORDS.wet, wetStage(s.wet));
  const felt = live ? live.felt : s.felt;
  if (Number.isFinite(felt)) {
    const word = temperatureWord(felt);
    push('temp', HUD_NEED_WORDS.temp, word, { felt, warmed: live ? warmedByFire(tier, live.env, felt) : warmedBy(s, word) });
  }
  if (isStiff(s, now)) out.push({ key: 'stiff', text: 'Stiff', level: needLevel('stiff', 'stiff', { rules: tier }) });
  const meal = vampire ? 0 : heartyMealLeft(s, now);
  const mealChip = meal > 0 ? { key: `boon:${HEARTY_MEAL_CHIP}`, text: heartyMealWord(), level: 'boon', glyph: HEARTY_MEAL_GLYPH, foot: `${Math.ceil(meal / 60)}h` } : null;
  const drunk = s.drunk > endurance / 2 ? { key: 'drunk', text: s.drunk > endurance - 10 ? 'Very drunk' : 'Drunk', level: s.drunk > endurance - 10 ? 'danger' : 'warn', tier: s.drunk > endurance - 10 ? 2 : 1, of: 2 } : null;
  // In a rewarding tier the drunk chip goes before the boons, so a full strip never folds it away first.
  if (tier.boons) {
    if (drunk) out.push(drunk);
    if (mealChip) out.push(mealChip);
    for (const id of Array.isArray(s.boons) ? s.boons : []) {
      const w = HUD_BOON_WORDS[id];
      if (!w || (mealChip && id === 'fed')) continue;
      const chip = { key: `boon:${id}`, text: w[0], level: 'boon', glyph: w[1] };
      if (id === 'rested' && s.wellRested > 0) chip.foot = `${Math.ceil(s.wellRested / 60)}h`;
      out.push(chip);
    }
  } else {
    if (drunk) out.push(drunk);
    if (mealChip) out.push(mealChip);
  }
  return out;
}

export const TEMP_SCALE = Object.freeze({ min: -60, max: 60 });
export function temperatureReadout(entity, felt = entity?.survival?.felt, { rules = null, env = null } = {}) {
  if (!Number.isFinite(felt)) return null;
  const s = entity?.survival && typeof entity.survival === 'object' ? entity.survival : {};
  const tier = tierOf(s, rules);
  const word = temperatureWord(felt);
  const label = HUD_NEED_WORDS.temp[word] ?? null;
  const warmed = env ? warmedByFire(tier, env, felt) : warmedBy(s, word);
  const level = label ? needLevel('temp', word, { rules: tier, felt, warmed }) : 'ok';
  const at = Math.min(1, Math.max(0, (felt - TEMP_SCALE.min) / (TEMP_SCALE.max - TEMP_SCALE.min)));
  return { felt, text: signedDegrees(felt), word, label: label ?? 'Comfortable', level, side: COLD_WORDS.includes(word) ? 'cold' : label ? 'hot' : 'mild', warmed, at };
}

export function boonEffect(id) {
  if (id === 'hearth') return 'regain stamina beside a lit fire';
  return BOON[id] ? STAT_KEYS_ORDER.filter((k) => BOON[id][k]).map((k) => `+${BOON[id][k]} ${k[0].toUpperCase()}${k.slice(1)}`).join(', ') : '';
}
export function restedLeft(s) {
  const h = Math.ceil(Math.max(0, s?.wellRested ?? 0) / 60);
  return h > 0 ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '';
}

export const STATUS_TEXT = Object.freeze({
  hunger: Object.freeze({
    fed: 'You are well fed.', peckish: 'You could eat.', hungry: 'You could do with a decent meal.', starving: 'You are starving.',
  }),
  thirst: Object.freeze({ fine: 'You are not thirsty.', thirsty: 'You are thirsty.', parched: 'You are parched.', dehydrated: 'You are dehydrated.' }),
  sleep: Object.freeze({ rested: 'You are well rested.', tired: 'You are tired.', drowsy: 'You are drowsy.', exhausted: 'You are exhausted.' }),
  notTired: 'You are not tired.',
  wet: Object.freeze({ dry: null, damp: 'Your clothes are damp.', wet: 'Your clothes are wet.', soaked: 'You are soaked through.', drenched: 'You are drenched.' }),
  temp: (word) => (word === 'comfortable' ? 'You are comfortable.' : `You feel ${word}.`),
  // No degree sign: the classic fonts that draw this box have none.
  felt: (felt) => `Felt temperature: ${signedDegrees(felt).replace('\u00b0', '')} (comfortable from -10 to +10).`,
  warmedByFire: 'The fire keeps the cold at bay.',
  stiff: 'You are stiff and sore from a hard night.',
  drunk: 'You are drunk.', veryDrunk: 'You are very drunk.',
  vampire: 'You have no need for food or sleep.',
  invigorated: 'You are invigorated from your last meal.',
  boon: (id) => {
    if (id === 'hearth') return 'The fire\'s warmth restores your stamina.';
    const w = HUD_BOON_WORDS[id]?.[0];
    if (!w || !BOON[id]) return null;
    return `${w}: ${boonEffect(id)}.`;
  },
  restedFor: (s) => (restedLeft(s) ? `Rested for another ${restedLeft(s)}.` : null),
});
// The classic message box sizes to its widest line and never wraps, so every needs line stays within this.
export const STATUS_LINE_MAX = 53;

export function survivalStatusLines(entity, now, { vampire = false, endurance = 50, rules = null } = {}) {
  const s = survivalOf(entity, now);
  const kept = !!tierOf(s, rules).boons;
  const boons = kept && Array.isArray(s.boons) ? s.boons : [];
  const lines = [];
  if (vampire) lines.push(STATUS_TEXT.vampire);
  else {
    const hunger = hungerStage(hungerMinutes(s, now));
    lines.push(hunger === 'fed' && hungerMinutes(s, now) < NEED.PECKISH_AT / 2 ? STATUS_TEXT.invigorated : STATUS_TEXT.hunger[hunger]);
    lines.push(STATUS_TEXT.thirst[thirstStage(s.thirst)]);
    const sleep = sleepStage(s.sleepDebt);
    lines.push(sleep === 'rested' && kept && !boons.includes('rested') ? STATUS_TEXT.notTired : STATUS_TEXT.sleep[sleep]);
  }
  const wet = STATUS_TEXT.wet[wetStage(s.wet)];
  if (wet) lines.push(wet);
  if (Number.isFinite(s.felt)) { const word = temperatureWord(s.felt); lines.push(warmedBy(s, word) ? STATUS_TEXT.warmedByFire : STATUS_TEXT.temp(word), STATUS_TEXT.felt(s.felt)); }
  if (isStiff(s, now)) lines.push(STATUS_TEXT.stiff);
  if (s.drunk > endurance / 2) lines.push(s.drunk > endurance - 10 ? STATUS_TEXT.veryDrunk : STATUS_TEXT.drunk);
  for (const id of boons) lines.push(STATUS_TEXT.boon(id), id === 'rested' ? STATUS_TEXT.restedFor(s) : null);
  return lines.filter(Boolean);
}
export const survivalStatusRows = (entity, now, opts) => survivalStatusLines(entity, now, opts).map((text) => ({ text, center: true }));
