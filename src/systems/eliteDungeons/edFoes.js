// @ts-check
// The enemy swap seeds from the dungeon's id, so every client in a room builds the same enemies.
import { wildHallFoes } from '../../world/wildDungeons.js';
import { SIFRIT_ID } from '../sifrit/sifritLaw.js';
import { makeSifrit } from '../sifrit/sifritFight.js';
import { ED_FOE_RING, ED_FOE_HEALTH_MULT, ED_FOE_DAMAGE_MULT, ED_SIFRIT_HEALTH_MULT, ED_SIFRIT_DAMAGE_MULT } from '../../net/eliteDungeonLaw.js';

export const isEliteDungeon = (/** @type {any} */ dfLocation) => !!dfLocation?.eliteDungeon?.key;

export function edLayoutFoes(/** @type {any} */ dfLocation, /** @type {any[]} */ list) {
  if (!isEliteDungeon(dfLocation) || !Array.isArray(list)) return;
  const seed = (dfLocation.dungeon?.recordElement?.header?.locationId ?? dfLocation.mapTableData?.mapId ?? 0) >>> 0;
  const swapped = wildHallFoes(list, ED_FOE_RING, seed);
  for (let i = 0; i < swapped.length; i++) list[i] = swapped[i] && !swapped[i].allied ? { ...swapped[i], edFoe: true } : swapped[i];
}

/**
 * @param {any} dfLocation
 * @param {any} entity
 * @param {any} e
 * @param {{ puppet?: boolean }} [o]
 */
export function edFoeStood(dfLocation, entity, e, { puppet = false } = {}) {
  if (!entity || !e) return;
  if (e.mobileType === SIFRIT_ID) {
    makeSifrit(entity, { own: !puppet });
    if (isEliteDungeon(dfLocation) && !entity.edSifrit) {
      entity.edSifrit = true;
      if (!puppet) {
        entity.maxHealth = Math.max(1, Math.round((entity.maxHealth || 1) * ED_SIFRIT_HEALTH_MULT));
        entity.health = entity.maxHealth;
      }
      entity.damageScale = (Number.isFinite(entity.damageScale) && entity.damageScale > 0 ? entity.damageScale : 1) * ED_SIFRIT_DAMAGE_MULT;
    }
    return;
  }
  if (!isEliteDungeon(dfLocation) || e.allied || entity.edFoe) return;
  entity.edFoe = true;
  if (!puppet) {
    entity.maxHealth = Math.max(1, Math.round((entity.maxHealth || 1) * ED_FOE_HEALTH_MULT));
    entity.health = entity.maxHealth;
    entity.healthMult = (entity.healthMult ?? 1) * ED_FOE_HEALTH_MULT;
  }
  entity.damageScale = (Number.isFinite(entity.damageScale) && entity.damageScale > 0 ? entity.damageScale : 1) * ED_FOE_DAMAGE_MULT;
}
