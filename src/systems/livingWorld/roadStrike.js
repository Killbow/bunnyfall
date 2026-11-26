// @ts-check
import { nearestPerson } from '../../talk/townTalk.js';
import { WEAPON_REACH } from '../../combat/playerWeapon.js';
import { LETHAL_HIT } from '../../combat/bloodDecals.js';
import { tallyCrimeGuildRequirements } from '../../guilds/crimeGuilds.js';
import { playerWeaponHitEntity } from '../../world/worldTick.js';

// A spared swing returns this instead of `false`, which callers read as a miss and pass on to the door behind the
// traveler.
export const ROAD_SPARED = Object.freeze({ spared: true });
export const ROAD_STRUCK = Object.freeze({ struck: true });

/** @param {{ roads: () => any, open: () => boolean, collider: any, cityGuards: any, hitEffects: any, playerEntity: any }} deps */
export function createRoadStrike({ roads, open, collider, cityGuards, hitEffects, playerEntity }) {
  /**
   * @param {number[]} eye
   * @param {number[]} dir
   */
  return function strikeRoad(eye, dir) {
    const layer = roads();
    if (!layer || !open()) return false;
    /** @type {any} */
    const near = nearestPerson(eye, dir, layer.talkSeats());
    if (!near || near.distance > WEAPON_REACH) return false;
    const wall = collider.raycast(eye, dir, near.distance);
    if (Number.isFinite(wall) && wall < near.distance - 1e-3) return false;
    if (cityGuards.playerSparesPerson(near.entry.person)) return ROAD_SPARED;
    if (!layer.slain(near.entry.person)) return false;
    hitEffects.showBloodSplash(0, [eye[0] + dir[0] * near.distance, eye[1] + dir[1] * near.distance, eye[2] + dir[2] * near.distance], null, LETHAL_HIT);
    tallyCrimeGuildRequirements(playerEntity, false, 5);
    playerWeaponHitEntity(playerEntity, { health: 0 }, { isCivilian: true });
    return ROAD_STRUCK;
  };
}
