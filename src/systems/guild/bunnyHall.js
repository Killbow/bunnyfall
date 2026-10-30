// @ts-check
// BUNNY-GUILDS (Phase 0b): THE HALL'S CLERK - who in a converted house speaks for its guild, and what they say.
//
// A hall is one of a town's houses (bunnyGuilds.js), and its people are the house's own. The first grown person among
// them stands as the guild's clerk: the hover names them by the office, and a press on them is the guild's (the hall's
// window, once there is one; until then, the clerk's greeting).

import { bunnyGuildOfKey, bunnyGuildOfFaction } from './bunnyGuilds.js';
import { isChildNPCTexture } from '../../characters/staticNpc.js';
import { t } from '../textManager.js';

/**
 * Mark the hall's clerk among its people, in place: the first grown person, so every client in the room picks the same.
 * @param {Array<{ textureArchive?: number, textureRecord?: number, bunnyClerk?: string }>} people
 * @param {string | null | undefined} key the hall's guild key
 * @returns {boolean} whether a clerk stands
 */
export function markBunnyClerk(people, key) {
  if (!bunnyGuildOfKey(key)) return false;
  const clerk = people.find((pn) => !isChildNPCTexture(pn.textureArchive ?? -1, pn.textureRecord ?? -1));
  if (!clerk) return false;
  clerk.bunnyClerk = /** @type {string} */ (key);
  return true;
}

/** What the hover calls the clerk. */
export const bunnyClerkName = (/** @type {string} */ key) => {
  const g = bunnyGuildOfKey(key);
  return g ? t('bguild.clerk', '{guild} Clerk', { guild: g.name }) : null;
};

/** What the clerk says while the guild takes no members yet. */
export function bunnyClerkGreeting(/** @type {string} */ key) {
  const g = bunnyGuildOfKey(key);
  if (!g) return [];
  return [
    t('bguild.greeting.welcome', 'Welcome to the {guild}.', { guild: g.name }),
    t('bguild.greeting.soon', 'Our rolls are not open yet. Come back soon, and we will have work for you.'),
  ];
}

/** The Where-is page's group for the halls. */
export const bunnyHallsCaption = () => t('bguild.whereIs', 'Guild halls');

/**
 * The town's talk directory rows (talkTopics.js buildBuildingDirectory), in place: a row that is a hall is named for its
 * guild and carries `bunnyHall` (its guild key), so the Where-is page asks after it in its own group, as the yards are.
 * @param {Array<{ factionId?: number, name?: string, bunnyHall?: string }>} rows
 */
export function markBunnyHallRows(rows) {
  for (const r of rows) {
    const g = bunnyGuildOfFaction(r.factionId);
    if (g) Object.assign(r, { name: g.name, bunnyHall: g.key });
  }
  return rows;
}
