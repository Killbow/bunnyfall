import { ABILITIES, PHYSICAL_SKILLS } from './registry.js';
import { utilityProfile } from './utilityProfiles.js';
import { racialKey } from './racialProfiles.js';
import { pageHas, pageParam } from '../../platform/pageQuery.js';
import { isOnlinePage } from '../../platform/onlineLane.js';

export const COMBAT_PREVIEW_PRESET = 'combat-preview';
export const abilitiesEnabled = () => !isOnlinePage()
  && (pageHas('abilities') || pageParam('test') === COMBAT_PREVIEW_PRESET);

const VERSION = 1;
const loads = new WeakMap();
export const abilityLoad = (entity) => loads.get(entity) ?? 0;
const MAX_LEARNED = 512;
const ID = /^(?:weapon|combination|racial|utility)(?:\.[a-z0-9-]+){2,5}$|^utility\.[a-z0-9-]+$/;

function trainedFor(entity, ability) {
  if (ability.category === 'utility') return !!utilityProfile(ability.id)
    && PHYSICAL_SKILLS.some(id => Number.isFinite(entity?.skills?.[id]) && entity.skills[id] >= ability.rank);
  if (ability.race) return racialKey(entity) === ability.race;
  return ability.skills.every(id => Number.isFinite(entity?.skills?.[id]) && entity.skills[id] >= ability.rank);
}

function savedIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, MAX_LEARNED).filter(id => id !== 'utility.skyward-ascent' && typeof id === 'string' && id.length <= 128 && ID.test(id)))];
}

export function restoreAbilityProgress(entity, block, enabled = abilitiesEnabled()) {
  loads.set(entity, abilityLoad(entity) + 1);
  if (block?.version === VERSION) entity.combatAbilities = { version: VERSION, learned: savedIds(block.learned) };
  else delete entity.combatAbilities;
  if (enabled) syncAbilityUnlocks(entity);
}

export function syncAbilityUnlocks(entity) {
  if (!entity) return [];
  const block = entity.combatAbilities;
  const learned = new Set(block?.learned ?? []);
  const added = [];
  for (const ability of ABILITIES) {
    if (learned.has(ability.id) || !trainedFor(entity, ability)) continue;
    learned.add(ability.id);
    added.push(ability.id);
  }
  if (added.length) entity.combatAbilities = { version: VERSION, learned: [...learned].slice(-MAX_LEARNED) };
  return added;
}

export function saveAbilityProgress(entity) {
  if (abilitiesEnabled()) syncAbilityUnlocks(entity);
  const block = entity?.combatAbilities;
  return block?.version === VERSION ? { version: VERSION, learned: savedIds(block.learned) } : null;
}

export const learnedAbility = (entity, id) => entity?.combatAbilities?.learned.includes(id) === true;
