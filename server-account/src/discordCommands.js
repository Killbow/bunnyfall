// @ts-check

export const MOD_COMMAND = Object.freeze({
  name: 'mod',
  description: 'Bunnyfall moderation',
  type: 1,
  // Manage Messages only hides the command; the service still checks moderator rights on every use.
  default_member_permissions: String(1 << 13),
  contexts: [0],
  options: [
    { type: 1, name: 'lookup', description: 'An account\'s standing: mutes, bans, strikes and the next step', options: [{ type: 3, name: 'player', description: 'Name or account id', required: true }] },
    { type: 1, name: 'mute', description: 'Mute a player (the next step on the ladder unless minutes are given)', options: [
      { type: 3, name: 'player', description: 'Name or account id', required: true },
      { type: 4, name: 'minutes', description: 'Minutes, 1 to 10080', required: false, min_value: 1, max_value: 10080 },
      { type: 3, name: 'reason', description: 'Why - kept in the record', required: false, max_length: 200 },
    ] },
    { type: 1, name: 'unmute', description: 'Lift a mute', options: [{ type: 3, name: 'player', description: 'Name or account id', required: true }] },
    { type: 1, name: 'ban', description: 'Ban a player (30 days unless days are given; 0 for good)', options: [
      { type: 3, name: 'player', description: 'Name or account id', required: true },
      { type: 4, name: 'days', description: 'Days, 1 to 365, or 0 for good', required: false, min_value: 0, max_value: 365 },
      { type: 3, name: 'reason', description: 'Why - the banned player is shown it', required: false, max_length: 200 },
    ] },
    { type: 1, name: 'unban', description: 'Lift a ban', options: [{ type: 3, name: 'player', description: 'Name or account id', required: true }] },
  ],
});

// Each deploy overwrites the server's whole command list with this one, so a command added by hand is removed.
export const DISCORD_COMMANDS = Object.freeze([MOD_COMMAND]);

/** @param {string} name @returns {string[]} */
export const subcommandsOf = (name) => (DISCORD_COMMANDS.find((c) => c.name === name)?.options ?? []).filter((o) => o.type === 1).map((o) => o.name);

/** @param {string} name */
export const usageOf = (name) => {
  const subs = subcommandsOf(name);
  return subs.length > 1 ? `Use /${name} ${subs.slice(0, -1).join(', ')} or ${subs.at(-1)}.` : `Use /${name}${subs.length ? ` ${subs[0]}` : ''}.`;
};
