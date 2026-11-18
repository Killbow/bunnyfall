// @ts-check
// BUNNYFALL (2026-11-18, daily elite dungeons - net/eliteDungeonLaw.js): AN ELITE DUNGEON'S FOES, at its build. The
// dungeon's layout foes become Cromwark's (the reach's high tiers, ED_FOE_RING's pool - systems/wild/wildDungeons.js
// wildHallFoes, a pure pick by the dungeon's id, so every client builds the same series) and stand ED_FOE_HEALTH_MULT and
// ED_FOE_DAMAGE_MULT over what the dungeon makes them; SIFRIT, stood in one, is the Forbidden One boosted (ED_SIFRIT_*).
// Two calls the dungeon host makes (scenes/dungeonContext.js): `edLayoutFoes` over its layout's list, `edFoeStood` on each
// foe it builds. Not a DFU member.
import { wildHallFoes } from '../wild/wildDungeons.js';
import { SIFRIT_ID } from '../sifrit/sifritLaw.js';
import { makeSifrit } from '../sifrit/sifritFight.js';
import { ED_FOE_RING, ED_FOE_HEALTH_MULT, ED_FOE_DAMAGE_MULT, ED_SIFRIT_HEALTH_MULT, ED_SIFRIT_DAMAGE_MULT } from '../../net/eliteDungeonLaw.js';

/** Is this dungeon (its build's DFLocation) an elite dungeon of the day's? (worldModes marks it: `eliteDungeon`, the book's entry.) */
export const isEliteDungeon = (/** @type {any} */ dfLocation) => !!dfLocation?.eliteDungeon?.key;

/** The layout's foes made Cromwark's, in place (`list` the dungeon's collectDungeonEnemies list). */
export function edLayoutFoes(/** @type {any} */ dfLocation, /** @type {any[]} */ list) {
  if (!isEliteDungeon(dfLocation) || !Array.isArray(list)) return;
  const seed = (dfLocation.dungeon?.recordElement?.header?.locationId ?? dfLocation.mapTableData?.mapId ?? 0) >>> 0;
  const swapped = wildHallFoes(list, ED_FOE_RING, seed);
  for (let i = 0; i < swapped.length; i++) list[i] = swapped[i] && !swapped[i].allied ? { ...swapped[i], edFoe: true } : swapped[i];
}

/**
 * A foe built in the dungeon: Sifrit (made hers - the dungeon host does not otherwise know her - and in an elite dungeon
 * boosted), or one of the series (its strength, its mark). `e` the build's record, `puppet` another client's foe.
 * @param {any} dfLocation @param {any} entity @param {any} e @param {{ puppet?: boolean }} [o]
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
