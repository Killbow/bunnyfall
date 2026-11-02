// @ts-check
// BUNNYFALL GUILD-LEAVE (Phase 1, the owner: "Add a deliberate, in-world way to leave a guild"): Daggerfall's own guilds,
// temples and knightly orders had no door out. A member could only be expelled, so the only way to leave was to let the
// standing fall, and a long trip that wore it down did the leaving for them. The hall's service NPC now asks, twice, and
// lets them go. The standing is kept, as Bunnyfall's own guilds keep it (bunnyHall.js): only the rank and the membership go,
// so a member who comes back joins again at rank 0 on the standing they had. Nothing is sent after a leaver: the squad a
// mod sends is for an expulsion (guilds.js setGuildExpelledHook), and a leave is not one.

import { t } from '../textManager.js';
import { leaveGuild, membershipOf } from './guilds.js';

/** The hall row's label, on both skins. */
export const LEAVE_ROW = 'Leave Guild';
/** Its key: Q, which no guild service button uses (dialogShortcuts.js). */
export const LEAVE_KEY = 'KeyQ';

/**
 * The leave's question, as a Yes/No box the popup stacks; null for a stranger (the row is a member's alone).
 * `memberships` is the character's own book (never a seat's view of it), `name` the guild's name as the player reads it.
 * @param {any} memberships @param {any} guild @param {string} name
 */
export function leaveGuildBox(memberships, guild, name) {
  if (!guild || !membershipOf(memberships, guild)) return null;
  const row = (/** @type {string} */ text) => ({ text, center: true });
  return {
    rows: [
      row(t('guild.leave.ask1', 'Are you sure you wish to leave {guild}?', { guild: name })),
      row(t('guild.leave.ask2', 'You keep your standing, but lose your rank and our services.')),
    ],
    buttons: 'YesNo',
    closesWindow: false,
    onYes: () => {
      leaveGuild(memberships, guild);
      return {
        rows: [row(t('guild.leave.done', 'You have left {guild}. Our door is open, should you return.', { guild: name }))],
        closesWindow: true,
      };
    },
  };
}
