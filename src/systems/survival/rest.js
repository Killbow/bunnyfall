import { survivalOf } from './needs.js';
import { HARD_RULES } from './difficulty.js';

export const REST_KIND = Object.freeze({ Bed: 'bed', Camp: 'camp', Rough: 'rough' });
export const REST_COST = Object.freeze({
  bed: Object.freeze({ recovery: 1, encounters: 1, stiffHours: 0 }),
  camp: Object.freeze({ recovery: 1, encounters: 1, stiffHours: 0 }),
  rough: HARD_RULES.roughRest,
});
export const STIFF_HOURS = 4;
export const STIFF_PENALTY = 5;
export const REST_TEXT_SURVIVAL = Object.freeze({
  stiff: 'You rise stiff and sore from the hard ground.',
  sleptPoorly: 'You slept poorly on the bare ground.',
  tooCold: 'It is too cold to sleep here. Find a fire or shelter.',
  tooHot: 'It is too hot to sleep here.',
});

export function restKind({ bed = false, houseOwned = false, ship = false, byFire = false } = {}) {
  if (bed || houseOwned || ship) return REST_KIND.Bed;
  if (byFire) return REST_KIND.Camp;
  return REST_KIND.Rough;
}
export const restCost = (kind, rules = HARD_RULES) =>
  (kind === REST_KIND.Bed || kind === REST_KIND.Camp ? REST_COST[kind] : (rules ?? HARD_RULES).roughRest);

// `carry` holds each hour's truncated remainder; pass the same object every hour or a slow rough rest never heals.
export function restHour(entity, kind, tick, carry = { health: 0, fatigue: 0, magicka: 0 }, rules = HARD_RULES) {
  const c = restCost(kind, rules);
  const h0 = entity.health ?? 0, f0 = entity.fatigue ?? 0, m0 = entity.magicka ?? 0;
  const healed = !!tick();
  if (c.recovery >= 1) return healed;
  const h1 = entity.health ?? 0, f1 = entity.fatigue ?? 0, m1 = entity.magicka ?? 0;
  const rawH = (h1 - h0) * c.recovery + carry.health;
  const rawF = (f1 - f0) * c.recovery + carry.fatigue;
  const rawM = (m1 - m0) * c.recovery + carry.magicka;
  const gainH = Math.trunc(rawH), gainF = Math.trunc(rawF), gainM = Math.trunc(rawM);
  carry.health = rawH - gainH; carry.fatigue = rawF - gainF; carry.magicka = rawM - gainM;
  entity.health = h0 + gainH;
  entity.fatigue = f0 + gainF;
  entity.magicka = m0 + gainM;
  return healed && entity.health === h1 && entity.fatigue === f1 && entity.magicka === m1;
}

export function stiffen(entity, now, kind = REST_KIND.Rough, rules = HARD_RULES) {
  const hours = restCost(kind, rules).stiffHours;
  if (!(hours > 0)) return false;
  const s = survivalOf(entity, now);
  s.stiffUntil = Math.max(s.stiffUntil ?? 0, now + hours * 60);
  return true;
}
export const isStiff = (s, now) => Number.isFinite(s?.stiffUntil) && now < s.stiffUntil;

export function restBlock({ tempWord = 'comfortable', byFire = false, insideBuilding = false } = {}) {
  if ((tempWord === 'freezing' || tempWord === 'deadly cold') && !byFire && !insideBuilding) return REST_TEXT_SURVIVAL.tooCold;
  if (tempWord === 'scorching') return REST_TEXT_SURVIVAL.tooHot;
  return null;
}
export function installSurvivalRestGate(readEnv, register, { enabled = () => true } = {}) {
  const block = () => {
    // A null env means this host does not own the current mode, so it never blocks the rest.
    const e = readEnv?.();
    if (!e || !enabled()) return null;
    return restBlock(e);
  };
  const cold = () => block() === REST_TEXT_SURVIVAL.tooCold;
  const hot = () => block() === REST_TEXT_SURVIVAL.tooHot;
  // The rest seam takes one message per handler, so the cold and heat blocks register separately.
  register(cold, REST_TEXT_SURVIVAL.tooCold);
  register(hot, REST_TEXT_SURVIVAL.tooHot);
  return [cold, hot];
}
