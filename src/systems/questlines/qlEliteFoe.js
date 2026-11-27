// @ts-check
import { registerPlayerKillListener } from '../../player/playerKills.js';
import { dungeonTier } from '../../world/dungeonTier.js';
import { noteAct } from './qlActs.js';

export const QL_ELITE_FOE = 'ql11-elite-foe';

// Super dungeon enemies carry both marks too, so the place tier must also be 'elite'.
export const eliteFoeSlainIn = (/** @type {any} */ entity, /** @type {any} */ loc) => !!entity?.eliteFoe && !!entity.elite && dungeonTier(loc) === 'elite';

// Each dungeon built registers this listener again by name, replacing the last, so it reads the dungeon last built.
export function hearEliteFoesIn(/** @type {any} */ loc) {
  registerPlayerKillListener(QL_ELITE_FOE, (/** @type {any} */ entity) => { if (eliteFoeSlainIn(entity, loc)) noteAct('elite-foe-slain'); });
}
