import { survivalOf, feltCtx } from './needs.js';
import { temperatureWord, feltTemperature, temperatureBreakdown } from './temperature.js';
import { installSurvivalRestGate } from './rest.js';
import { survivalRules } from './switch.js';
import { liveVampirism } from '../../afflictions/racialLive.js';
import { raceById } from '../../characters/races.js';

// Held weakly and never on the entity, so none of it reaches a save or the wire.
const LAST_FEED = new WeakMap();

export const ENV_DEFAULTS = Object.freeze({
  climateIndex: 232, month: 0, hour: 12, weather: 'sunny', insideBuilding: false, insideDungeon: false, inSunlight: false,
  falling: null,
  swimming: false, submerged: false, wading: false, transport: false, byFire: false, resting: false, sleeping: null, sheltered: false,
  castle: false,
  lycanthrope: false, beastForm: false, fireResist: 0, frostResist: 0,
});

export function survivalCtx(entity, env = {}) {
  return {
    vampire: !!liveVampirism(entity),
    raceId: entity?.raceId ?? 1,
    raceTemplate: raceById(entity?.raceId ?? 1) ?? {},
    lycanthrope: !!env.lycanthrope, beastForm: !!env.beastForm,
    fireResist: env.fireResist ?? 0, frostResist: env.frostResist ?? 0,
  };
}

export function survivalFeed(entity, env = null, { rolls = null, say = null } = {}) {
  const rules = survivalRules();
  if (!rules || !entity || !env) return null;
  const full = { ...ENV_DEFAULTS, ...env };
  // As in the mod, a swim on the surface wades and only a head under water is submerged; hosts that know say so.
  if (full.swimming && !full.submerged && !Object.hasOwn(env, 'wading')) full.wading = true;
  const deps = { worn: entity.equip?.slots ?? null, ctx: survivalCtx(entity, full), rules };
  LAST_FEED.set(entity, { env: full, ctx: deps.ctx });
  if (rolls) deps.rolls = rolls;
  if (say) deps.say = say;
  return { env: full, deps };
}

export function restGateEnv(entity, env = null) {
  const s = entity?.survival;
  const felt = Number.isFinite(s?.felt) ? s.felt : null;
  return {
    tempWord: felt == null ? 'comfortable' : temperatureWord(felt),
    byFire: !!env?.byFire,
    insideBuilding: !!env?.insideBuilding,
  };
}

// Install once per host build: the seam is a registry.
export function installSurvivalGate(register, entity, env) {
  return installSurvivalRestGate(() => { const e = env?.(); return e ? restGateEnv(entity?.(), e) : null; }, register, { enabled: survivalGateOn });
}
export const survivalGateOn = () => !!survivalRules()?.restGate;

// A torn-down host must take its pair off the seam, or its handler keeps refusing rests elsewhere.
export function uninstallSurvivalGate(pair, unregister) {
  for (const h of pair ?? []) unregister?.(h);
}

export const survivalRecordAt = (entity, now) => survivalOf(entity, now);

export const lastSurvivalFeed = (entity) => (entity && LAST_FEED.get(entity)) ?? null;
export function feltNow(entity, { worn = entity?.equip?.slots ?? null, mods = entity?._mods } = {}) {
  const feed = lastSurvivalFeed(entity);
  if (!feed) return null;
  const s = entity.survival && typeof entity.survival === 'object' ? entity.survival : null;
  return { ...feltTemperature(feed.env, worn, feltCtx(entity, s, feed.ctx, mods)), env: feed.env };
}
export function feltBreakdownNow(entity, opts) {
  const t = feltNow(entity, opts);
  return t ? temperatureBreakdown(t.env, t) : [];
}

