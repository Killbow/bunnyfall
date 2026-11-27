// @ts-check
// Restores a vampirism or lycanthropy curse that an old save lost, based on the curse's tagged spells.
// Only a cure removes those spells, so tagged spells with no live curse mean the curse was lost.

import { LYCANTHROPY_TYPES, VAMPIRE_CLANS, liveInfection } from './infection.js';
import { createLycanthropyCurse, liveLycanthropy, LYCANTHROPY_SPELL_TAG, VAMPIRE_SPELL_TAG } from './lycanthropy.js';
import { createVampirismCurse, liveVampirism, VAMPIRE_CLAN_SPELLS } from './vampirism.js';

// No clan spell list shares a spell with another clan or the base three, so at most one clan can match.
export function inferVampireClan(indexes) {
  const have = new Set(indexes);
  for (const [clan, ids] of Object.entries(VAMPIRE_CLAN_SPELLS)) if (ids.length && ids.every((id) => have.has(id))) return Number(clan);
  return VAMPIRE_CLANS.Anthotis;
}

/**
 * @param {any} entity
 * @param {{ now?: number, lycanthropyType?: number }} [o]
 * @returns {'vampirism'|'lycanthropy'|null}
 */
export function repairLostCurses(entity, { now = 0, lycanthropyType = LYCANTHROPY_TYPES.Werewolf } = {}) {
  if (!entity) return null;
  if (liveLycanthropy(entity) || liveVampirism(entity)) return null;
  if (entity.racialOverride || entity.racialOverridePending || liveInfection(entity)) return null;
  const spells = Array.isArray(entity.spells) ? entity.spells : [];
  const vampire = spells.filter((s) => s?.tag === VAMPIRE_SPELL_TAG);
  if (vampire.length) {
    const clan = inferVampireClan(vampire.map((s) => s.index));
    if (!createVampirismCurse(entity, clan, { now, restore: true })) return null;
    console.info(`[curse-repair] CURSE-REPAIR1: vampirism given back (clan ${clan}) - its spells outlived the curse the round clock pruned`);
    return 'vampirism';
  }
  if (spells.some((s) => s?.tag === LYCANTHROPY_SPELL_TAG)) {
    if (!createLycanthropyCurse(entity, lycanthropyType, { now, restore: true })) return null;
    console.info(`[curse-repair] CURSE-REPAIR1: lycanthropy given back (strain ${lycanthropyType}, assumed - both strains grant spell 92)`);
    return 'lycanthropy';
  }
  return null;
}
