// Survival needs: one record on `entity.survival`, stepped once per world minute. Counters move the same way in every
// tier; what a minute charges comes from the tier's rules (Hard when none), and drains sit on one 'survival' effect.
import { feltTemperature, temperatureWord, wardrobeCtx, sunlit } from './temperature.js';
import { drinkFrom, findDrink, waterskinName, DRINK_RELIEF, TEMPLATE, isFood, foodStage, FOOD_STAGE, rotFoodDay, rotWeight, ROT_DAY_MINUTES } from './food.js';
import { STAT_KEYS_ORDER, maxFatigue, liveStat, FATIGUE_MULTIPLIER } from '../../characters/statMods.js';
import { HARD_RULES } from './difficulty.js';
// Restated from rest.js, which imports this module.
const STIFF_PENALTY = 5;
import { MINUTES_PER_DAY, dateFromClassicMinutes } from '../../world/gameDate.js';

export const AUTO_EAT_STAGES = Object.freeze(['hungry', 'starving']);

export const NEED = Object.freeze({
  PECKISH_AT: 240, HUNGRY_AT: 720, STARVING_AT: 1440,
  THIRSTY: 50, PARCHED: 80, DEHYDRATED: 100, THIRST_MAX: 150,
  THIRST_HARM: 120,
  SLEEP_TIRED: 4, SLEEP_DROWSY: 8, SLEEP_EXHAUSTED: 12, SLEEP_DEBT_MAX: 24, AWAKE_FREE_HOURS: 16,
  WET_DAMP: 5, WET_WET: 30, WET_SOAKED: 100, WET_DRENCHED: 200, WET_MAX: 300,
  EXPOSURE_AT: 30, DAMAGE_AT: 50,
});
export const THIRST_PER_MINUTE = 100 / 360;
export const DRAIN = Object.freeze({ heatPer20: 6, starving: 4, parched: 6, dehydrated: 12, exhausted: 8, wellFed: 64, bareFeet: 4 });
export const HARM_EVERY_MINUTES = 10;
export const HEALTH_FLOOR = 5;
export const WELL_FED_MINUTES = 60;
export const HEARTY_MEAL_MINUTES = 6 * 60;
export const heartyMealHeld = (s, now) => Number.isFinite(s?.mealUntil) && s.mealUntil > now;
export const heartyMealLeft = (s, now) => (heartyMealHeld(s, now) ? s.mealUntil - now : 0);
export function heartyMeal(s, at) {
  s.thirst = 0;
  s.mealUntil = Math.max(Number.isFinite(s.mealUntil) ? s.mealUntil : 0, at + HEARTY_MEAL_MINUTES);
  return s;
}
export const BOON = Object.freeze({
  fed: Object.freeze({ strength: 5, endurance: 5 }),
  quenched: Object.freeze({ agility: 5, speed: 5 }),
  rested: Object.freeze({ intelligence: 5, willpower: 5 }),
  thriving: Object.freeze({ luck: 5 }),
});
export const BOON_IDS = Object.freeze(['fed', 'quenched', 'rested', 'thriving', 'hearth']);
export const SAID_BOONS = Object.freeze(['fed', 'quenched', 'rested', 'thriving']);
export const HEARTH_FATIGUE = FATIGUE_MULTIPLIER;
export const WELL_RESTED_PER_SLEEP_MINUTE = 1.5;
export const WELL_RESTED_MAX_MINUTES = 12 * 60;
export const MAX_CATCHUP_MINUTES = 2 * MINUTES_PER_DAY;
export const ROAD_MINUTES = 60;
const SLEEP_FLOOR_AT = Object.freeze({ tired: NEED.SLEEP_TIRED, drowsy: NEED.SLEEP_DROWSY, exhausted: NEED.SLEEP_EXHAUSTED });
export const NOTE_EVERY_MINUTES = 5;
export const STAGE_REPEAT_MINUTES = 30;
const heardLately = (s, key, now) => Number.isFinite(s.notes[key]) && now >= s.notes[key] && now - s.notes[key] < STAGE_REPEAT_MINUTES;

export const SURVIVAL_TEXT = Object.freeze({
  peckish: 'Your stomach rumbles...',
  hungry: 'You have not eaten in a long while...',
  starving: 'You are starving...',
  thirsty: 'You are getting thirsty...',
  parched: 'Your mouth is dry. You need water.',
  dehydrated: 'You are dehydrated...',
  drank: 'You drink from your waterskin.',
  drankLow: 'Your waterskin is nearly empty.',
  drained: 'You drain your waterskin.',
  tired: 'You stifle a yawn...',
  drowsy: 'You are drowsy from lack of sleep...',
  exhausted: 'You really need some sleep...',
  wakingEnd: 'The salts wear off, and your weariness comes back all at once.',
  damp: 'You are a bit wet.',
  wet: 'You are quite wet.',
  soaked: 'You are soaking wet.',
  drenched: 'You are completely drenched.',
  warm: 'You are a bit warm...',
  hot: 'You wipe the sweat from your brow...',
  scorching: 'You are getting dizzy from the heat...',
  burning: 'You cannot go on much longer in this heat...',
  chilly: 'You are a bit chilly...',
  cold: 'You shiver from the cold...',
  freezing: 'The cold is seeping into your bones...',
  deadly: 'Your teeth are chattering uncontrollably!',
  cooling: 'You are cooling down.',
  warming: 'You are warming up.',
  dried: 'You have dried off.',
  nakedCold: 'The cold air numbs your bare skin.',
  bareFeetCold: 'Your bare feet are freezing.',
  bareFeetHot: 'Your bare feet are getting burned.',
  sunburn: 'The sun burns your bare skin.',
  armorHot: 'Your armor is starting to heat up.',
  armorCold: 'Your armor is getting cold.',
  rust: (name) => `Your ${name} is getting rusty...`,
  rot: 'Your food is getting a bit ripe...',
  repaid: 'You feel your strength returning.',
  ateRations: 'You eat some rations.',
  emptiedRations: 'You empty your sack of rations.',
  boon: Object.freeze({
    fed: 'You feel well fed.',
    quenched: 'Your thirst is quenched.',
    rested: 'You feel well rested.',
    thriving: 'You are in fine form.',
  }),
});

// The minute step and the pack's live reading both build their context here, so the pack shows what is charged.
export function feltCtx(entity, s, base = null, mods = entity?._mods) {
  return { ...(base ?? {}), wet: s?.wet ?? 0, hasWater: !!findDrink(entity?.items ?? []), ...wardrobeCtx(mods) };
}
export const warmedByFire = (rules, env, felt) => !!((rules ?? HARD_RULES).stamina.fireWarms && env?.byFire && felt < 0);

export function newSurvival(now = 0) {
  return { lastAte: now - 10, thirst: 0, wet: 0, sleepDebt: 0, awakeSince: now, exposure: 0, fed: 0, drunk: 0, rotMinutes: 0, rotDays: 0, stiffUntil: 0, notes: {} };
}
export function survivalOf(entity, now = 0) {
  if (!entity.survival || typeof entity.survival !== 'object') entity.survival = newSurvival(now);
  const s = entity.survival;
  s.notes ??= {};
  // A counter that is not a number (an older build, a hand edit) takes the fresh value, or felt readings go NaN.
  if (![s.lastAte, s.thirst, s.wet, s.sleepDebt, s.awakeSince, s.exposure, s.fed, s.drunk, s.rotMinutes, s.rotDays].every(Number.isFinite)) {
    for (const [k, v] of Object.entries(newSurvival(now))) if (typeof v === 'number' && !Number.isFinite(s[k])) s[k] = v;
  }
  return s;
}

export const hungerMinutes = (s, now) => Math.max(0, now - (s.lastAte ?? now));
export function hungerStage(minutes) {
  if (minutes >= NEED.STARVING_AT) return 'starving';
  if (minutes >= NEED.HUNGRY_AT) return 'hungry';
  if (minutes >= NEED.PECKISH_AT) return 'peckish';
  return 'fed';
}
export const starvingDays = (minutes) => Math.max(0, Math.trunc(minutes / NEED.STARVING_AT));
export function thirstStage(t) {
  if (t >= NEED.DEHYDRATED) return 'dehydrated';
  if (t >= NEED.PARCHED) return 'parched';
  if (t >= NEED.THIRSTY) return 'thirsty';
  return 'fine';
}
export function sleepStage(debt) {
  if (debt >= NEED.SLEEP_EXHAUSTED) return 'exhausted';
  if (debt >= NEED.SLEEP_DROWSY) return 'drowsy';
  if (debt >= NEED.SLEEP_TIRED) return 'tired';
  return 'rested';
}
export function wetStage(w) {
  if (w >= NEED.WET_DRENCHED) return 'drenched';
  if (w >= NEED.WET_SOAKED) return 'soaked';
  if (w >= NEED.WET_WET) return 'wet';
  if (w >= NEED.WET_DAMP) return 'damp';
  return 'dry';
}
export const awakeHours = (s, now) => Math.max(0, now - (s.awakeSince ?? now)) / 60;

export const WAKING_DEBT_HOURS = 2;
export const wakingHeld = (s, now) => Number.isFinite(s?.wakingUntil) && s.wakingUntil > now;
export function landWakingDebt(s, now) {
  if (!Number.isFinite(s?.wakingUntil) || s.wakingUntil <= 0 || now < s.wakingUntil) return false;
  s.wakingUntil = 0;
  s.sleepDebt = Math.min(NEED.SLEEP_DEBT_MAX, (s.sleepDebt ?? 0) + WAKING_DEBT_HOURS);
  return true;
}

export function paySleep(s, sleeping, minutes, now, rules = HARD_RULES) {
  const rate = sleeping === 'rough' ? 0.5 : 1.5;
  const floor = sleeping === 'rough' ? SLEEP_FLOOR_AT[rules.roughSleepFloor] ?? 0 : 0;
  const next = s.sleepDebt - rate * minutes / 60;
  s.sleepDebt = s.sleepDebt >= floor ? Math.max(floor, next) : Math.max(0, next);
  s.awakeSince = now;
  if (rules?.boons && sleeping !== 'rough' && minutes > 0) s.wellRested = Math.min(WELL_RESTED_MAX_MINUTES, (s.wellRested ?? 0) + WELL_RESTED_PER_SLEEP_MINUTE * minutes);
}

export function survivalBoons(s, now, { vampire = false, hearth = false } = {}) {
  const out = [];
  if (!vampire) {
    if (hungerStage(hungerMinutes(s, now)) === 'fed') out.push('fed');
    if (thirstStage(s.thirst ?? 0) === 'fine') out.push('quenched');
    if (s.wellRested > 0 && sleepStage(s.sleepDebt ?? 0) === 'rested') out.push('rested');
    if (out.length === 3) out.push('thriving');
  }
  if (hearth) out.push('hearth');
  return out;
}

export function survivalStatMods(s, temp, now, { endurance = 50, rules = HARD_RULES, vampire = false, beast = false } = {}) {
  const mods = {};
  const sub = (keys, n) => { if (n > 0) for (const k of keys) mods[k] = (mods[k] ?? 0) - n; };
  const ALL = ['strength', 'intelligence', 'willpower', 'agility', 'endurance', 'personality', 'speed'];
  if ((rules ?? HARD_RULES).attributes) {
    const starve = vampire || beast ? 0 : starvingDays(hungerMinutes(s, now));
    if (starve > 0) sub(ALL, Math.min(20, starve * 2));
    if (temp && temp.abs > NEED.EXPOSURE_AT) sub(ALL, Math.trunc(Math.min(s.exposure, temp.abs - NEED.EXPOSURE_AT) / 4));
    if (!vampire && !beast && s.thirst >= NEED.DEHYDRATED) sub(ALL, Math.trunc((s.thirst - 90) / 10));
    const sleep = vampire || wakingHeld(s, now) ? 'rested' : sleepStage(s.sleepDebt);
    if (sleep === 'tired') sub(ALL, 2); else if (sleep === 'drowsy') sub(ALL, 5); else if (sleep === 'exhausted') sub(ALL, 10);
    if (Number.isFinite(s.stiffUntil) && now < s.stiffUntil) sub(['speed', 'agility'], STIFF_PENALTY);
  }
  if ((rules ?? HARD_RULES).boons) for (const id of s.boons ?? []) for (const [k, n] of Object.entries(BOON[id] ?? {})) mods[k] = (mods[k] ?? 0) + n;
  if (s.drunk > endurance / 2) {
    const d = Math.trunc((s.drunk - endurance / 2) / 10);
    sub(['agility', 'intelligence', 'willpower', 'speed'], d);
    mods.personality = (mods.personality ?? 0) + Math.min(5, d + 1);
  }
  return mods;
}

export function applySurvivalMods(entity, mods) {
  const list = entity.activeEffects ??= [];
  let entry = list.find((a) => a?.kind === 'survival');
  const capped = {};
  let any = false;
  for (const k of STAT_KEYS_ORDER) {
    const m = mods[k] ?? 0;
    if (m === 0) continue;
    const perm = entity.stats?.[k] ?? 0;
    // Floor at five of the lower of the permanent stat and the live stat without this entry: a live zero kills.
    const floorAt = Math.min(perm, liveStat(entity, k, 'survival'));
    capped[k] = m < 0 ? -Math.min(-m, Math.max(0, floorAt - 5)) : m;
    if (capped[k] !== 0) any = true;
  }
  if (!any) { if (entry) list.splice(list.indexOf(entry), 1); return null; }
  if (!entry) { entry = { kind: 'survival', statMods: {} }; list.push(entry); }
  entry.statMods = capped;
  return entry;
}

export function settleLoan(s, room) {
  const b = s.borrowed;
  let total = 0;
  for (const k of Object.keys(b)) total += b[k];
  if (total <= room) return;
  for (const k of Object.keys(b)) { b[k] = Math.floor((b[k] * room) / total); if (!(b[k] > 0)) delete b[k]; }
  if (!Object.keys(b).length) delete s.borrowed;
}

function note(s, key, now, say, text, { once = false } = {}) {
  const n = s.notes;
  if (once) { if (n[key] === 'on') return; n[key] = 'on'; say?.(text); return; }
  if (Number.isFinite(n[key]) && now - n[key] < NOTE_EVERY_MINUTES) return;
  n[key] = now;
  say?.(text);
}
const clearNote = (s, key) => { if (s.notes[key] === 'on') delete s.notes[key]; };
const STAGE_SEVERITY = Object.freeze({
  wet: Object.freeze({ damp: 1, wet: 2, soaked: 3, drenched: 4 }),
  hunger: Object.freeze({ peckish: 1, hungry: 2, starving: 3 }),
  thirst: Object.freeze({ thirsty: 1, parched: 2, dehydrated: 3 }),
  sleep: Object.freeze({ tired: 1, drowsy: 2, exhausted: 3 }),
  temp: Object.freeze({ cold: -1, freezing: -2, deadly: -3, warm: 1, hot: 2, scorching: 3 }),
});
const RECOVERY = Object.freeze({
  temp: Object.freeze({ from: Object.freeze({ scorching: 'cooling', freezing: 'warming', deadly: 'warming' }), atDry: false }),
  wet: Object.freeze({ from: Object.freeze({ soaked: 'dried', drenched: 'dried' }), atDry: true }),
});
function recoveryNote(s, family, stage, say, now) {
  const r = RECOVERY[family];
  if (!r) return;
  const key = `${family}:red`;
  if (stage && r.from[stage]) { s.notes[key] = stage; return; }
  const from = s.notes[key];
  if (!from || (r.atDry && stage)) return;
  delete s.notes[key];
  const heard = `${family}@${r.from[from]}`;
  if (heardLately(s, heard, now)) return;
  s.notes[heard] = now;
  say?.(SURVIVAL_TEXT[r.from[from]]);
}
// A stage line is said only when the stage worsens, never on the way back. Replayed minutes leave the notes alone,
// so the minute the player lands in says the net change.
function stageNote(s, family, stage, say, text, replay, now) {
  if (replay) return;
  const was = s.notes[family];
  recoveryNote(s, family, stage, say, now);
  if (!stage) { delete s.notes[family]; return; }
  if (stage === was) return;
  const sev = STAGE_SEVERITY[family], at = sev[stage] ?? 0, before = was ? sev[was] ?? 0 : 0;
  const heard = `${family}@${stage}`;
  if ((Math.sign(at) !== Math.sign(before) || Math.abs(at) > Math.abs(before)) && !heardLately(s, heard, now)) { s.notes[heard] = now; say?.(text); }
  s.notes[family] = stage;
}

/** @param {object} entity @param {number} now @param {object} env @param {object} deps */
export function survivalMinute(entity, now, env = {}, deps = {}) {
  const s = survivalOf(entity, now);
  const { worn = null, sinks = {}, rolls = Math.random, autoDrink = true, autoEat = true, replay = false, landing = false } = deps;
  const rules = deps.rules ?? HARD_RULES;
  const say = sinks.say ?? deps.say ?? null;
  const items = entity.items ?? [];
  const ctx = feltCtx(entity, s, deps.ctx);
  const temp = feltTemperature(env, worn, ctx);
  const resting = !!env.resting;
  const sleeping = env.sleeping ?? null;
  const vampire = !!ctx.vampire;
  const beast = !!ctx.beastForm;
  const step = Number.isFinite(s.lastMinute) ? Math.max(0, now - s.lastMinute) : 0;
  // A body that does not eat or sleep carries those markers forward, so a cure does not land days of need at once.
  if ((vampire || beast) && step > 0 && Number.isFinite(s.lastAte)) s.lastAte += step;
  if (vampire && step > 0 && Number.isFinite(s.awakeSince)) s.awakeSince += step;
  const floorShare = rules.stamina.floor;
  const repays = !!rules.stamina.repaid;
  // With a floor, the budget is read at the minute's first charge so needs in one minute share it.
  let budget = null;
  const tire = (n, need) => {
    if (!(n > 0) || floorShare >= 1) return;
    let d = n;
    if (floorShare > 0) {
      budget ??= Math.max(0, (entity.fatigue ?? 0) - Math.floor(maxFatigue(entity) * floorShare));
      d = Math.min(n, budget);
      if (!(d > 0)) return;
      budget -= d;
    }
    sinks.drainFatigue?.(d);
    if (repays) { const b = (s.borrowed ??= {}); b[need] = (b[need] ?? 0) + d; }
  };
  if (!rules.attributes && s.stiffUntil) s.stiffUntil = 0;
  if (!repays && s.borrowed) { delete s.borrowed; delete s.loanPool; }
  if (!rules.boons && ('boons' in s || 'wellRested' in s)) { delete s.boons; delete s.wellRested; for (const id of BOON_IDS) delete s.notes[`boon:${id}`]; }
  // Settle the loan only after a refill (the pool rose since last minute); a pool whose ceiling fell still owes it.
  if (repays && s.borrowed && !((entity.fatigue ?? 0) <= (s.loanPool ?? -Infinity))) settleLoan(s, Math.max(0, maxFatigue(entity) - (entity.fatigue ?? 0)));

  s.wet = Math.min(NEED.WET_MAX, s.wet + temp.wetGain);
  if (temp.wetGain <= 0) {
    let dry = temp.air > 10 ? Math.trunc(temp.air / 10) : 1;
    if (env.byFire || env.insideBuilding || env.sheltered) dry += 2;
    s.wet = Math.max(0, s.wet - dry);
  }
  const wetNow = wetStage(s.wet);
  stageNote(s, 'wet', wetNow === 'dry' ? null : wetNow, say, SURVIVAL_TEXT[wetNow], replay, now);

  const hearty = heartyMealHeld(s, now);
  if (hearty) { s.lastAte = Math.max(s.lastAte ?? now, now - 10); s.thirst = 0; }
  const hunger = hungerMinutes(s, now);
  const hungerNow = vampire || beast ? 'fed' : hungerStage(hunger);
  let refunded = 0;
  if (hungerNow === 'fed' && !vampire) { s.fed += 1; if (s.fed >= WELL_FED_MINUTES) { s.fed = 0; sinks.restoreFatigue?.(DRAIN.wellFed); refunded = DRAIN.wellFed; } }
  if (AUTO_EAT_STAGES.includes(hungerNow) && autoEat) {
    const sack = items.find((i) => i.templateIndex === TEMPLATE.Rations && isFood(i));
    if (sack) { eatRations(entity, sack, now, say); }
  }
  const hungerAfter = vampire || beast ? 'fed' : hungerStage(hungerMinutes(s, now));
  stageNote(s, 'hunger', hungerAfter === 'fed' ? null : hungerAfter, say, SURVIVAL_TEXT[hungerAfter], replay, now);
  if (hungerAfter === 'starving' && !resting) tire(DRAIN.starving, 'hunger');

  let thirstRed = false;
  if (!vampire && !beast) {
    const rate = hearty ? 0 : THIRST_PER_MINUTE * (1 + Math.max(0, temp.felt - 10) / 10);
    s.thirst = Math.min(NEED.THIRST_MAX, s.thirst + rate);
    if (autoDrink && s.thirst >= NEED.THIRSTY) drinkWater(entity, now, say);
    const thirstNow = thirstStage(s.thirst);
    stageNote(s, 'thirst', thirstNow === 'fine' ? null : thirstNow, say, SURVIVAL_TEXT[thirstNow], replay, now);
    thirstRed = thirstNow === 'parched' || thirstNow === 'dehydrated';
    if (!resting) {
      if (thirstNow === 'parched') tire(DRAIN.parched, 'thirst');
      else if (thirstNow === 'dehydrated') tire(DRAIN.dehydrated, 'thirst');
    }
    if (rules.health && s.thirst >= NEED.THIRST_HARM && !sleeping && !resting && now % HARM_EVERY_MINUTES === 0) {
      // Dehydration may kill, but a replayed minute and a jump's landing wound only to the floor.
      const bite = Math.max(1, Math.trunc((s.thirst - NEED.THIRST_HARM + 10) / 10));
      if (!replay && !landing) sinks.hurt?.(bite);
      else if ((entity.health ?? 0) > HEALTH_FLOOR) sinks.hurt?.(Math.min(bite, (entity.health ?? 0) - HEALTH_FLOOR));
    }
  }

  let sleepRed = false;
  if (!vampire) {
    if (landWakingDebt(s, now)) say?.(SURVIVAL_TEXT.wakingEnd);
    if (sleeping) {
      paySleep(s, sleeping, 1, now, rules);
    } else if (awakeHours(s, now) > NEED.AWAKE_FREE_HOURS) {
      s.sleepDebt = Math.min(NEED.SLEEP_DEBT_MAX, s.sleepDebt + 1 / 60);
    }
    const sleepNow = sleepStage(s.sleepDebt);
    stageNote(s, 'sleep', sleepNow === 'rested' ? null : sleepNow, say, SURVIVAL_TEXT[sleepNow], replay, now);
    sleepRed = sleepNow === 'exhausted';
    if (sleepNow === 'exhausted' && !resting && !wakingHeld(s, now)) tire(DRAIN.exhausted, 'sleep');
  }

  const abs = temp.abs;
  if (abs > NEED.EXPOSURE_AT) s.exposure = Math.min(s.exposure + 1, 600); else s.exposure = Math.max(0, s.exposure - 2);
  const harmTick = now % HARM_EVERY_MINUTES === 0;
  const hurtFloored = (n) => { if ((entity.health ?? 0) > HEALTH_FLOOR) sinks.hurt?.(n); };
  const warmed = warmedByFire(rules, env, temp.felt);
  if (warmed) s.warmed = true; else if (s.warmed) delete s.warmed;
  const tempRed = !warmed && (temp.felt >= rules.stamina.hotFrom || temp.felt <= rules.stamina.coldFrom);
  // A deliberate departure from the mod: a red reading under a roof still charges; the roof only softens it.
  if (!resting || !env.byFire) {
    if (tempRed && (!resting || rules.stamina.duringRest)) tire(DRAIN.heatPer20 * Math.trunc(abs / 20), 'temp');
    if (rules.health && abs > NEED.DAMAGE_AT && !sleeping && harmTick) {
      const bite = Math.max(1, Math.trunc((abs - 40) / 10));
      if (!replay && !landing) sinks.hurt?.(bite);
      else if ((entity.health ?? 0) > HEALTH_FLOOR) sinks.hurt?.(Math.min(bite, (entity.health ?? 0) - HEALTH_FLOOR));
    }
  }
  const word = tempStage(temp.felt);
  stageNote(s, 'temp', word && !(env.insideDungeon && word === 'warm') ? word : null, say, SURVIVAL_TEXT[word], replay, now);

  let naked = false, sun = false, feet0 = false;
  if (!env.insideBuilding && !vampire && !ctx.beastForm && !sleeping && !resting) {
    const chest = worn?.[17] ?? null, chestArmor = worn?.[18] ?? null, legs = worn?.[24] ?? null, legsArmor = worn?.[23] ?? null, feet = worn?.[26] ?? null;
    const bareTop = !chest && !chestArmor && !temp.cloak, bareLegs = !legs && !legsArmor && !temp.cloak;
    if ((bareTop || bareLegs) && temp.natTemp < -10) { naked = true; if (harmTick && rules.health) hurtFloored(1); note(s, 'naked', now, say, SURVIVAL_TEXT.nakedCold, { once: true }); }
    if ((bareTop || bareLegs) && env.inSunlight && temp.natTemp > 10 && env.weather !== 'overcast' && ctx.raceId !== 8 && ctx.raceId !== 4) {
      sun = true;
      if (harmTick && rules.health) hurtFloored(1);
      note(s, 'sun', now, say, SURVIVAL_TEXT.sunburn, { once: true });
    }
    if (!feet && !env.transport && !env.insideDungeon && Math.abs(temp.natTemp) > liveStat(entity, 'endurance') / 2 && !env.swimming && !env.wading) {
      feet0 = true;
      if (rules.stamina.bareFeet) tire(DRAIN.bareFeet, 'feet');
      note(s, 'feet', now, say, temp.natTemp > 0 ? SURVIVAL_TEXT.bareFeetHot : SURVIVAL_TEXT.bareFeetCold, { once: true });
    }
  }
  if (!naked) clearNote(s, 'naked'); if (!sun) clearNote(s, 'sun'); if (!feet0) clearNote(s, 'feet');
  if (temp.metal > 5) note(s, 'armor:hot', now, say, SURVIVAL_TEXT.armorHot, { once: true }); else clearNote(s, 'armor:hot');
  if (temp.metal < -5) note(s, 'armor:cold', now, say, SURVIVAL_TEXT.armorCold, { once: true }); else clearNote(s, 'armor:cold');

  if (rules.rust && !resting && !env.insideBuilding && s.wet > NEED.WET_DAMP && worn && rolls() < 0.05) {
    const metal = [18, 23, 12, 13, 15, 26, 20].map((k) => worn[k]).filter((i) => i && i.group === 'Armor' && ((i.material ?? 0) & 0x0f00) !== 0);
    if (metal.length) {
      const piece = metal[Math.floor(rolls() * metal.length)];
      const loss = Math.max(1, Math.trunc((piece.maxCondition ?? 100) / 100));
      piece.currentCondition = Math.max(0, (piece.currentCondition ?? piece.maxCondition ?? 0) - loss);
      if (piece.currentCondition < (piece.maxCondition ?? 0) / 10) note(s, 'rust', now, say, SURVIVAL_TEXT.rust(piece.name ?? 'armor'));
    }
  }

  s.rotMinutes += rotWeight(temp.air);
  if (s.rotMinutes >= ROT_DAY_MINUTES) {
    s.rotMinutes -= ROT_DAY_MINUTES;
    s.rotDays += 1;
    const spoiled = rotFoodDay(deps.collections ?? [items, entity.wagonItems, entity.otherItems, entity.bagItems], s.rotDays, rolls);
    if (spoiled > 0) note(s, 'rot', now, say, SURVIVAL_TEXT.rot);
  }

  if (s.drunk > 0 && now % 10 === 0) s.drunk = Math.max(0, s.drunk - 1);

  if (repays && s.borrowed) {
    const met = { hunger: hungerAfter !== 'starving', thirst: !thirstRed, sleep: !sleepRed, temp: !tempRed, feet: !feet0 };
    let back = 0;
    for (const k of Object.keys(s.borrowed)) if (met[k]) { back += s.borrowed[k]; delete s.borrowed[k]; }
    if (!Object.keys(s.borrowed).length) delete s.borrowed;
    const give = Math.min(back, Math.max(0, maxFatigue(entity) - (entity.fatigue ?? 0)));
    if (give > 0) { sinks.restoreFatigue?.(give); note(s, 'repaid', now, say, SURVIVAL_TEXT.repaid); }
  }
  if (s.borrowed) s.loanPool = (entity.fatigue ?? 0) - refunded; else if ('loanPool' in s) delete s.loanPool;

  if (rules.boons) {
    if (s.wellRested > 0 && !sleeping) s.wellRested = Math.max(0, s.wellRested - 1);
    if (!(s.wellRested > 0) && 'wellRested' in s) delete s.wellRested;
    const hearth = !!env.byFire && !resting && !sleeping && !replay;
    if (hearth) {
      const give = Math.min(HEARTH_FATIGUE, Math.max(0, maxFatigue(entity) - (entity.fatigue ?? 0)));
      if (give > 0) sinks.restoreFatigue?.(give);
    }
    s.boons = survivalBoons(s, now, { vampire, hearth });
    if (!replay) for (const id of SAID_BOONS) { if (s.boons.includes(id)) note(s, `boon:${id}`, now, say, SURVIVAL_TEXT.boon[id], { once: true }); else clearNote(s, `boon:${id}`); }
  }

  applySurvivalMods(entity, survivalStatMods(s, temp, now, { endurance: liveStat(entity, 'endurance'), rules, vampire, beast }));
  s.lastMinute = now;
  s.felt = temp.felt;
  return temp;
}

export function drinkWater(entity, now, say = null) {
  const s = survivalOf(entity, now);
  const skin = findDrink(entity.items ?? []);
  if (!skin) return false;
  const r = drinkFrom(skin);
  if (!r.ok) return false;
  skin.name = waterskinName(skin);
  s.thirst = Math.max(0, s.thirst - DRINK_RELIEF);
  say?.(r.empty ? SURVIVAL_TEXT.drained : r.low ? SURVIVAL_TEXT.drankLow : SURVIVAL_TEXT.drank);
  return true;
}

export function eatRations(entity, sack, now, say = null) {
  const s = survivalOf(entity, now);
  const items = entity.items ?? [];
  s.lastAte = now - 10;
  say?.(SURVIVAL_TEXT.ateRations);
  if ((sack.stackCount ?? 1) <= 1) { const i = items.indexOf(sack); if (i >= 0) items.splice(i, 1); say?.(SURVIVAL_TEXT.emptiedRations); }
  else sack.stackCount -= 1;
  return true;
}

export function runSurvivalMinutes(entity, from, to, env, deps) {
  let temp = null;
  const end = Math.floor(to);
  const s = survivalOf(entity, end);
  let last = Number.isFinite(s.lastMinute) ? s.lastMinute : Math.floor(from);
  // Start from the record's last paid minute so a rest already paid is not run again; a rewound clock re-anchors.
  if (last > end + MAX_CATCHUP_MINUTES) last = Math.floor(from);
  const start = Math.max(Math.floor(from), last, end - MAX_CATCHUP_MINUTES);
  if (Number.isFinite(s.mealUntil) && s.mealUntil > last && start > last) s.lastAte = Math.max(s.lastAte ?? last, Math.min(s.mealUntil, start) - 11);
  if (s.offFor) delete s.offFor;
  const jump = end - start > 1;
  // Where the sky follows this clock (offline), each jump minute is felt at its own hour and month. A non-rest jump
  // longer than ROAD_MINUTES is felt under a fair sky, since its weather is unknown.
  const sky = deps.skyFollows && jump ? { ...env } : null;
  if (sky && !env.resting && end - start > ROAD_MINUTES) Object.assign(sky, { weather: 'sunny', falling: null, byFire: false, swimming: false, submerged: false, wading: false });
  const sinks = deps.sinks ?? {};
  // Replayed minutes and the landing leave the pool its last point, so no collapse fires inside the replay.
  const drainFloored = (n, a) => sinks.drainFatigue?.(Math.min(n, Math.max(0, (entity.fatigue ?? 0) - FATIGUE_MULTIPLIER)), a);
  const coldTill = Number.isFinite(s.outColdUntil) ? s.outColdUntil : -Infinity;
  // The collapse's hour marked by markOutCold is walked as a rough sleep.
  const cold = coldTill > start ? { ...(sky ?? env), resting: true, sleeping: 'rough' } : null;
  // Replayed lines are gathered and said once, when the walk reaches the landing minute. One deps object is mutated
  // for the whole walk, which can run 2,880 minutes.
  const heard = [];
  const walk = { ...deps, replay: true, sinks: { ...sinks, drainFatigue: drainFloored, say: (t) => { if (!heard.includes(t)) heard.push(t); } } };
  for (let m = start + 1; m <= end; m++) {
    walk.replay = m < end;
    walk.landing = !walk.replay && jump;
    if (!walk.replay) { walk.sinks = jump ? { ...sinks, drainFatigue: drainFloored } : sinks; const say = sinks.say ?? deps.say; for (const t of heard) say?.(t); }
    if (sky) { sky.hour = (((m % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY) / 60; sky.month = dateFromClassicMinutes(m).month; sky.inSunlight = sunlit(sky); }
    let at = sky ?? env;
    if (cold && m <= coldTill) { if (sky) Object.assign(cold, { hour: sky.hour, month: sky.month, inSunlight: sky.inSunlight }); at = cold; }
    temp = survivalMinute(entity, m, at, walk);
  }
  if (end > (s.lastMinute ?? -Infinity)) s.lastMinute = end;
  if (s.outColdUntil <= end) delete s.outColdUntil;
  return temp;
}

export function markOutCold(entity, minutes = 60) {
  const s = entity?.survival;
  // A collapse fires inside a tick whose marker is a minute ahead of the record's last paid minute; use the later.
  const marks = [s?.lastMinute, entity?.lastGameMinutes].filter(Number.isFinite);
  if (!s || typeof s !== 'object' || !marks.length) return false;
  s.outColdUntil = Math.max(Number.isFinite(s.outColdUntil) ? s.outColdUntil : -Infinity, Math.floor(Math.max(...marks)) + minutes);
  return true;
}
// The world tick calls this for each span walked with survival Off: the need markers move forward so needs resume
// where they were, while drunkenness, wetness, and exposure still decay. Past ALIGN_GRACE_MINUTES it starts fresh.
export function pauseSurvival(entity, from, to) {
  const s = entity?.survival;
  if (!s || typeof s !== 'object') return false;
  const span = Math.floor(to) - Math.floor(from);
  if (!(span > 0)) return false;
  if (Number.isFinite(s.lastAte)) s.lastAte += span;
  if (Number.isFinite(s.awakeSince)) s.awakeSince += span;
  if (Number.isFinite(s.mealUntil)) s.mealUntil += span;
  s.lastMinute = Math.floor(to);
  if ('boons' in s || 'wellRested' in s) { delete s.boons; delete s.wellRested; for (const id of BOON_IDS) delete s.notes?.[`boon:${id}`]; }
  if (s.drunk > 0) s.drunk = Math.max(0, s.drunk - (Math.floor(to / 10) - Math.floor(from / 10)));
  if (s.wet > 0) s.wet = Math.max(0, s.wet - span);
  if (s.exposure > 0) s.exposure = Math.max(0, s.exposure - 2 * span);
  s.offFor = (s.offFor ?? 0) + span;
  if (s.offFor > ALIGN_GRACE_MINUTES) { alignSurvival(entity, Math.floor(to), null); delete s.offFor; }
  return true;
}
export function clearSurvivalMods(entity) {
  if (!entity?.activeEffects?.some((a) => a && a.kind === 'survival')) return false;
  applySurvivalMods(entity, {});
  return true;
}

export const ALIGN_GRACE_MINUTES = MINUTES_PER_DAY;
// A save or player arriving from more than a day ago starts fed, watered, and rested instead of paying the absence.
export function alignSurvival(entity, now, lastSeen = null) {
  const s = survivalOf(entity, now);
  if (Number.isFinite(s.mealUntil) && s.mealUntil > now + HEARTY_MEAL_MINUTES) s.mealUntil = now + HEARTY_MEAL_MINUTES;
  const gap = lastSeen == null ? Infinity : now - lastSeen;
  if (gap > ALIGN_GRACE_MINUTES || (s.lastAte ?? now) > now || (s.awakeSince ?? now) > now) {
    Object.assign(s, { lastAte: now - 10, thirst: 0, wet: 0, sleepDebt: 0, awakeSince: now, exposure: 0, drunk: 0, fed: 0, mealUntil: 0, lastMinute: now, notes: boonNotes(s) });
    return true;
  }
  return false;
}

export const boonNotes = (s) => Object.fromEntries((Array.isArray(s?.boons) ? s.boons : []).filter((id) => SAID_BOONS.includes(id)).map((id) => [`boon:${id}`, 'on']));
const TEMP_STAGE = Object.freeze({ scorching: 'scorching', hot: 'hot', warm: 'warm', 'deadly cold': 'deadly', freezing: 'freezing', cold: 'cold' });
export const tempStage = (felt) => TEMP_STAGE[temperatureWord(felt)] ?? null;
// Saves drop the notes, so a load rebuilds them from the record's stages and does not repeat every stage line.
export function savedNotes(s) {
  const notes = boonNotes(s);
  if (!s || typeof s !== 'object') return notes;
  const at = Number.isFinite(s.lastMinute) ? s.lastMinute : null;
  const stages = {
    hunger: at == null || !Number.isFinite(s.lastAte) ? null : hungerStage(hungerMinutes(s, at)),
    thirst: Number.isFinite(s.thirst) ? thirstStage(s.thirst) : null,
    sleep: Number.isFinite(s.sleepDebt) ? sleepStage(s.sleepDebt) : null,
    wet: Number.isFinite(s.wet) ? wetStage(s.wet) : null,
    temp: Number.isFinite(s.felt) ? tempStage(s.felt) : null,
  };
  const QUIET = { hunger: 'fed', thirst: 'fine', sleep: 'rested', wet: 'dry' };
  for (const [family, stage] of Object.entries(stages)) {
    if (!stage || stage === QUIET[family]) continue;
    notes[family] = stage;
    if (RECOVERY[family]?.from[stage]) notes[`${family}:red`] = stage;
  }
  return notes;
}

export function survivalSummary(entity, now, temp = null) {
  const s = survivalOf(entity, now);
  return {
    hunger: hungerStage(hungerMinutes(s, now)), hungerMinutes: hungerMinutes(s, now),
    thirst: thirstStage(s.thirst), thirstValue: s.thirst,
    sleep: sleepStage(s.sleepDebt), sleepDebt: s.sleepDebt, awakeHours: awakeHours(s, now),
    wet: wetStage(s.wet), wetValue: s.wet,
    felt: temp?.felt ?? null, drunk: s.drunk,
    stage: foodStage, FOOD_STAGE,
  };
}
