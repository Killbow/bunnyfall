// @ts-check
// BUNNY-GUILDS (2026-11-02, the owner: "move to the guild hall interior" - the new guilds "look too much like houses"):
// A HALL'S INSIDE. A converted house is a house room; what makes it a hall is the guild's arms on the wall behind its
// clerk, as the crown's throne room hangs the holder's (systems/crownHall.js). The two banners are measured the same way
// - the nearest wall round the clerk, the cloth under the ceiling - in the room's own collider, so every client hangs
// them in the same place. A room with no wall in reach, or no clerk, hangs none (the room is as it was).
// Pure: the room's people and its collider's ray are arguments; the host draws the list on the street's banner cloth.
import { crownHallPlan } from '../systems/crownHall.js';
import { heraldryOf } from '../net/heraldryLaw.js';
import { bunnyHallArms, bunnyGuildOfKey } from '../systems/guild/bunnyGuilds.js';
import { bannerKeyOf } from './hallBanners.js';

/** The banners of the hall `key` (a guild key) in the room whose `people` and collider `ray(origin, dir, max)` are given:
 *  `[{ top, right, out, key, heraldry, phase }]`, or `[]`.
 *  @param {any[]} people @param {string | null | undefined} key @param {(o: number[], d: number[], max: number) => number} ray */
export function bunnyHallInterior(people, key, ray) {
  const guild = key ? bunnyGuildOfKey(key) : null;
  const clerk = guild ? (people ?? []).find((pn) => pn?.bunnyClerk === key) : null;
  const heraldry = guild ? heraldryOf(bunnyHallArms(guild.factionId)) : null;
  if (!clerk || !heraldry) return [];
  const plan = crownHallPlan(clerk, ray);
  return (plan?.banners ?? []).map((b, i) => ({ ...b, key: bannerKeyOf(heraldry), heraldry, phase: i * 1.7 }));
}
