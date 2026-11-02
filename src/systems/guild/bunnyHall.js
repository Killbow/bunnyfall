// @ts-check
// BUNNY-GUILDS (Phase 0b): THE HALL'S CLERK - who in a converted house speaks for its guild, and what they say.
//
// A hall is one of a town's houses (bunnyGuilds.js), and its people are the house's own. The first grown person among
// them stands as the guild's clerk: the hover names them by the office, and a press on them is the guild's (the hall's
// window, once there is one; until then, the clerk's greeting).

import { bunnyGuildOfKey, bunnyGuildOfFaction } from './bunnyGuilds.js';
import { isChildNPCTexture } from '../../characters/staticNpc.js';
import { t } from '../textManager.js';
import { bunnyMembershipOf, bunnyRepOf, joinBunnyGuild, leaveBunnyGuild, reviewBunnyRank, bunnyJoinRep, BUNNY_RANK_CEILING } from './bunnyMembership.js';
import { RANK_REQ_REPUTATION } from './guildFactions.js';

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

/** BUNNY-GUILDS (polish): the commoner a hall gives its clerk when the house stood none - ARENA2's mediumCommonPeople,
 *  a grown man (record 0, not in staticNpc.js's child set). */
const CLERK_FLAT = Object.freeze({ archive: 182, record: 0 });

/**
 * A hall is never without its clerk. The house's own people may be none, children alone, or hidden by the house's hours
 * (characters/interiorPeople.js: a house's people keep their hours); the guild's office does not. Marks the first grown
 * person as the clerk (markBunnyClerk), or stands a commoner for it beside the first person or at the first spot the
 * room gives, and keeps the clerk on the floor at every hour. Said in place; `spots` are feet points in the room's frame.
 * @param {Array<any>} people @param {string | null | undefined} key @param {Array<[number, number, number]>} [spots]
 * @returns {any | null} the clerk, or null where the room has nowhere to put one
 */
export function ensureBunnyClerk(people, key, spots = []) {
  if (!bunnyGuildOfKey(key)) return null;
  markBunnyClerk(people, key);
  let clerk = people.find((pn) => pn.bunnyClerk === key) ?? null;
  if (!clerk) {
    const base = people[0] ?? null;
    const at = base ? [base.x + 0.8, base.y, base.z] : spots[0] ?? null;
    if (!at) return null;
    clerk = {
      ...(base ?? {}), x: at[0], y: at[1], z: at[2], textureArchive: CLERK_FLAT.archive, textureRecord: CLERK_FLAT.record,
      drawArchive: undefined, drawRecord: undefined, factionID: 0, flags: 0, questBehaviour: null, bunnyClerk: /** @type {string} */ (key),
    };
    people.push(clerk);
  }
  clerk.active = true;   // the office keeps its hours: a house's people go home at night, the guild's clerk does not
  return clerk;
}

/** What the hover calls the clerk. */
export const bunnyClerkName = (/** @type {string} */ key) => {
  const g = bunnyGuildOfKey(key);
  return g ? t('bguild.clerk', '{guild} Clerk', { guild: g.name }) : null;
};

/**
 * Phase 0d: THE HALL'S WINDOW, as a choice the clerk offers (ui ChoiceWindow's `{ lines, options }`): who you are to the
 * guild, the guild's own services (Phases 1 and 2: `services`, systems/guild/bunnyServices.js), then join or leave, and
 * goodbye. Opening it is a visit, so a member's rank is reviewed first. `show(view)` puts the window up; a choice that
 * changes something shows the window again with its word on top (`note`), so the player sees where they stand.
 * @param {string} key @param {any} entity @param {(view: { lines: string[], options: any[] }) => void} show
 * @param {((key: string, ctx: { member: { rank: number } | null, again: (note?: string) => void }) => any[]) | null} [services]
 * @param {string | null} [note]
 */
export function openBunnyHall(key, entity, show, services = null, note = null) {
  const g = bunnyGuildOfKey(key);
  if (!g) return false;
  const rose = reviewBunnyRank(entity, key);
  const m = bunnyMembershipOf(key);
  const rep = bunnyRepOf(entity, key);
  // the window answering a choice has left its slot by the time the next one is shown (as the lamp's Trade waits a turn)
  const again = (/** @type {string | undefined} */ said) => { Promise.resolve().then(() => openBunnyHall(key, entity, show, services, said ?? null)).catch(() => {}); };
  const lines = note ? [note, ''] : [];
  lines.push(t('bguild.greeting.welcome', 'Welcome to the {guild}.', { guild: g.name }));
  const options = [...(services?.(key, { member: m, again }) ?? [])];
  // POLISH: a promotion is said in the guild's own words, ahead of everything else the clerk has to say
  if (rose != null) lines.unshift(t('bguild.hall.promoted', 'You have risen to the rank of {title}.', { title: g.ranks[rose] }), t('bguild.hall.promotedWord', 'The {guild} is proud to call you one of its own.', { guild: g.name }), '');
  if (m) {
    lines.push(t('bguild.hall.rank', 'Your rank: {title} ({rank} of 9).', { title: g.ranks[m.rank], rank: m.rank }),
      t('bguild.hall.rep', 'Your standing with us: {rep}.', { rep }));
    // POLISH: and what the next rank asks, as a vanilla guild's clerk tells it
    if (m.rank < BUNNY_RANK_CEILING) {
      lines.push(t('bguild.hall.next', 'The next rank, {title}, asks a standing of {need}.', { title: g.ranks[m.rank + 1], need: RANK_REQ_REPUTATION[m.rank + 1] }));
    } else {
      lines.push(t('bguild.hall.top', 'You have gone as far as a visit can take you. The ranks above are a chapter\'s to give.'));
    }
    // POLISH: leaving is asked twice, and the guild takes its leave of you kindly
    options.push({ code: 'KeyL', label: t('bguild.hall.leave', 'L - Leave the guild'), action: () => {
      Promise.resolve().then(() => show({
        lines: [t('bguild.hall.leaveAsk', 'Are you sure you wish to leave the {guild}? You will keep your standing, but lose your rank.', { guild: g.name })],
        options: [
          { code: 'KeyY', label: t('bguild.hall.leaveYes', 'Y - Leave the guild'), action: () => { leaveBunnyGuild(key); again(t('bguild.hall.left', 'You have left the {guild}. The door is open to you, should you return.', { guild: g.name })); } },
          { code: 'KeyN', label: t('bguild.hall.leaveNo', 'N - Stay'), action: () => again() },
          { code: 'Escape', label: undefined, action: () => again() },
        ],
      })).catch(() => {});
    } });
  } else if (rep >= bunnyJoinRep(key)) {
    lines.push(t('bguild.hall.invite', 'We are always looking for new members. Will you join us?'));
    options.push({ code: 'KeyJ', label: t('bguild.hall.join', 'J - Join the guild'), action: () => {
      joinBunnyGuild(entity, key);
      const joined = bunnyMembershipOf(key);
      again(t('bguild.hall.joined', 'Welcome to the {guild}, {title}. Your name is written in our book.', { guild: g.name, title: g.ranks[joined?.rank ?? 0] }));
    } });
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
