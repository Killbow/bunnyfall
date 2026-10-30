// @ts-check
// BUNNY-GUILDS (Phase 0b): THE HALL'S CLERK - who in a converted house speaks for its guild, and what they say.
//
// A hall is one of a town's houses (bunnyGuilds.js), and its people are the house's own. The first grown person among
// them stands as the guild's clerk: the hover names them by the office, and a press on them is the guild's (the hall's
// window, once there is one; until then, the clerk's greeting).

import { bunnyGuildOfKey, bunnyGuildOfFaction } from './bunnyGuilds.js';
import { isChildNPCTexture } from '../../characters/staticNpc.js';
import { t } from '../textManager.js';
import { bunnyMembershipOf, bunnyRepOf, joinBunnyGuild, leaveBunnyGuild, reviewBunnyRank, BUNNY_JOIN_REP } from './bunnyMembership.js';

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

/**
 * Phase 0d: THE HALL'S WINDOW, as a choice the clerk offers (ui ChoiceWindow's `{ lines, options }`): who you are to the
 * guild, then join or leave, and goodbye. Opening it is a visit, so a member's rank is reviewed first. `show(view)`
 * puts the window up; each choice that changes the book shows the window again, so the player sees where they stand.
 * The guilds' own services join the options as each guild's phase brings them.
 * @param {string} key @param {any} entity @param {(view: { lines: string[], options: any[] }) => void} show
 */
export function openBunnyHall(key, entity, show) {
  const g = bunnyGuildOfKey(key);
  if (!g) return false;
  const rose = reviewBunnyRank(entity, key);
  const m = bunnyMembershipOf(key);
  const rep = bunnyRepOf(entity, key);
  // the window answering a choice has left its slot by the time the next one is shown (as the lamp's Trade waits a turn)
  const again = () => { Promise.resolve().then(() => openBunnyHall(key, entity, show)).catch(() => {}); };
  const lines = [t('bguild.greeting.welcome', 'Welcome to the {guild}.', { guild: g.name })];
  const options = [];
  if (rose != null) lines.push(t('bguild.hall.promoted', 'You have risen to the rank of {title}.', { title: g.ranks[rose] }));
  if (m) {
    lines.push(t('bguild.hall.rank', 'Your rank: {title} ({rank} of 9).', { title: g.ranks[m.rank], rank: m.rank }),
      t('bguild.hall.rep', 'Your standing with us: {rep}.', { rep }));
    options.push({ code: 'KeyL', label: t('bguild.hall.leave', 'L - Leave the guild'), action: () => { leaveBunnyGuild(key); again(); } });
  } else if (rep >= BUNNY_JOIN_REP) {
    lines.push(t('bguild.hall.invite', 'We are always looking for new members. Will you join us?'));
    options.push({ code: 'KeyJ', label: t('bguild.hall.join', 'J - Join the guild'), action: () => { joinBunnyGuild(entity, key); again(); } });
  } else {
    lines.push(t('bguild.hall.refused', 'Your name is not well spoken of here. Mend your standing with us, then ask again.'));
  }
  options.push({ code: 'KeyG', label: t('bguild.hall.goodbye', 'G - Goodbye'), action: () => {} });
  options.push({ code: 'Escape', label: undefined, action: () => {} });
  show({ lines, options });
  return true;
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
