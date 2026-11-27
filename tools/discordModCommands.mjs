// Registers the bot commands with Discord. With --setup it also points the application at the service and checks
// the bot permissions in the moderator channel. The token comes from the environment and is never printed.
// Run: DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... node tools/discordModCommands.mjs [--print].
// --setup reads DISCORD_BOT_TOKEN, DISCORD_MOD_CHANNEL, DISCORD_PUBLIC_KEY, and DISCORD_INTERACTIONS_URL.

import { isMain } from './lib/isMain.mjs';
import { DISCORD_USER_AGENT, MOD_CHANNEL_NEEDS } from '../server-account/src/discord.js';
import { DISCORD_COMMANDS, MOD_COMMAND } from '../server-account/src/discordCommands.js';

export { DISCORD_COMMANDS, MOD_COMMAND };

const DISCORD_API = 'https://discord.com/api/v10';
export const SETUP_TRIES = 4;
// Discord's PING can reach a Worker instance the deploy has not replaced yet, so the URL is offered more than once.
export const SETUP_RETRY_MS = 10_000;
const SNOWFLAKE_RE = /^\d{5,25}$/;
const ADMINISTRATOR = 1n << 3n;
const ALL = (1n << 64n) - 1n;

/**
 * @param {{ guildId: string, roles: { id: string, permissions: string }[], memberRoles: string[], userId: string, overwrites: { id: string, type: number, allow: string, deny: string }[] }} a
 * @returns {bigint}
 */
export function channelPermissions({ guildId, roles, memberRoles, userId, overwrites }) {
  const of = new Map(roles.map((r) => [r.id, BigInt(r.permissions ?? 0)]));
  let p = of.get(guildId) ?? 0n;
  for (const id of memberRoles) p |= of.get(id) ?? 0n;
  if ((p & ADMINISTRATOR) === ADMINISTRATOR) return ALL;
  const apply = (allow, deny) => { p &= ~deny; p |= allow; };
  const everyone = overwrites.find((o) => o.id === guildId);
  if (everyone) apply(BigInt(everyone.allow), BigInt(everyone.deny));
  let allow = 0n, deny = 0n;
  for (const o of overwrites) if (o.type === 0 && o.id !== guildId && memberRoles.includes(o.id)) { allow |= BigInt(o.allow); deny |= BigInt(o.deny); }
  apply(allow, deny);
  const own = overwrites.find((o) => o.type === 1 && o.id === userId);
  if (own) apply(BigInt(own.allow), BigInt(own.deny));
  return p;
}

export async function discordSetup({ token, channel, publicKey, url, commands = DISCORD_COMMANDS, fetchFn = (u, i) => globalThis.fetch(u, i), wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!token) throw new Error('no bot token');
  if (!SNOWFLAKE_RE.test(channel ?? '')) throw new Error(`DISCORD_MOD_CHANNEL is not a channel id: "${channel ?? ''}"`);
  if (!/^[0-9a-f]{64}$/i.test(publicKey ?? '')) throw new Error('DISCORD_PUBLIC_KEY is not a 64-character hex key');
  if (!/^https:\/\/[^\s/]+\/v1\/discord\/interactions$/.test(url ?? '')) throw new Error(`not the service's interactions door: "${url ?? ''}"`);
  const call = async (what, path, method = 'GET', body) => {
    const res = await fetchFn(`${DISCORD_API}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bot ${token}`, 'user-agent': DISCORD_USER_AGENT },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    if (!res.ok) return { error: `${what}: Discord said ${res.status}: ${text.slice(0, 300)}`, status: res.status };
    return { json: text ? JSON.parse(text) : null };
  };
  const got = (r) => { if (r.error) throw new Error(r.error); return r.json; };
  const app = got(await call('reading the application', '/applications/@me'));
  if (!SNOWFLAKE_RE.test(app?.id ?? '')) throw new Error('reading the application: Discord named no application id');
  if (!SNOWFLAKE_RE.test(app?.bot?.id ?? '')) throw new Error('reading the application: it has no bot user - add one in the Developer Portal');
  if (String(app.verify_key ?? '').toLowerCase() !== publicKey.toLowerCase()) {
    throw new Error(`DISCORD_PUBLIC_KEY is not this application's public key - set it to ${app.verify_key} in server-account/wrangler.toml`);
  }
  const read = await call('reading the moderators\' channel (is the bot in the server, with View Channel there?)', `/channels/${channel}`);
  if (read.status === 404) throw new Error(`reading the moderators' channel: Discord knows no channel ${channel} (404) - DISCORD_MOD_CHANNEL is likely a server's, a user's or the application's id; with Developer Mode on (User Settings, Advanced), right-click the channel itself and Copy Channel ID`);
  const chan = got(read);
  if (!SNOWFLAKE_RE.test(chan?.guild_id ?? '')) throw new Error('the moderators\' channel is in no server - DISCORD_MOD_CHANNEL must name a server\'s channel');
  let pointed = false;
  if (app.interactions_endpoint_url !== url) {
    for (let n = 1; ; n++) {
      const r = await call('setting the Interactions Endpoint URL', '/applications/@me', 'PATCH', { interactions_endpoint_url: url });
      if (!r.error) break;
      if (n >= SETUP_TRIES) throw new Error(r.error);
      await wait(SETUP_RETRY_MS);
    }
    pointed = true;
  }
  got(await call('registering the commands', `/applications/${app.id}/guilds/${chan.guild_id}/commands`, 'PUT', commands));
  const roles = got(await call('reading the server\'s roles', `/guilds/${chan.guild_id}/roles`));
  const member = got(await call('reading the bot\'s roles in the server', `/guilds/${chan.guild_id}/members/${app.bot.id}`));
  const have = channelPermissions({ guildId: chan.guild_id, roles: roles ?? [], memberRoles: member?.roles ?? [], userId: app.bot.id, overwrites: chan.permission_overwrites ?? [] });
  const missing = MOD_CHANNEL_NEEDS.filter(([, bit]) => (have & bit) !== bit).map(([name]) => name);
  return { app: app.id, guild: chan.guild_id, pointed, commands: commands.map((c) => c.name), missing };
}

/**
 * @param {{ app: string, guild: string, pointed: boolean, commands: string[], missing: string[] }} done
 * @param {string} url
 */
export function setupReport(done, url) {
  const lines = [
    `- the Interactions Endpoint URL: \`${url}\` (${done.pointed ? 'set now' : 'already set'})`,
    `- the commands: ${done.commands.map((n) => `/${n}`).join(', ')}, written in server ${done.guild} for application ${done.app}`,
  ];
  if (!done.missing.length) return { lines: [...lines, '- the bot\'s permissions in the moderators\' channel: everything the cards need'], error: null };
  return { lines, error: `the bot lacks ${done.missing.join(', ')} in the moderators' channel - give its role ${done.missing.length === 1 ? 'that permission' : 'those permissions'} there (the channel's settings, Permissions), or no case card can be posted` };
}

async function main() {
  if (process.argv.includes('--print')) { console.log(JSON.stringify(DISCORD_COMMANDS, null, 2)); return; }
  if (process.argv.includes('--setup')) {
    const { DISCORD_BOT_TOKEN: token, DISCORD_MOD_CHANNEL: channel, DISCORD_PUBLIC_KEY: publicKey, DISCORD_INTERACTIONS_URL: url } = process.env;
    try {
      const report = setupReport(await discordSetup({ token, channel, publicKey, url }), url);
      console.log(report.lines.join('\n'));
      if (report.error) { console.error(report.error); process.exit(1); }
    } catch (e) {
      console.error(String(e?.message ?? e));
      process.exit(1);
    }
    return;
  }
  const { DISCORD_APP_ID: app, DISCORD_BOT_TOKEN: token, DISCORD_GUILD_ID: guild } = process.env;
  if (!/^\d{5,25}$/.test(app ?? '') || !/^\d{5,25}$/.test(guild ?? '') || !token) {
    console.error('Set DISCORD_APP_ID, DISCORD_GUILD_ID and DISCORD_BOT_TOKEN (see the header).');
    process.exit(2);
  }
  const res = await fetch(`https://discord.com/api/v10/applications/${app}/guilds/${guild}/commands`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bot ${token}`, 'user-agent': DISCORD_USER_AGENT },
    body: JSON.stringify(DISCORD_COMMANDS),
  });
  const text = await res.text();
  if (!res.ok) { console.error(`Discord said ${res.status}: ${text}`); process.exit(1); }
  console.log(`${DISCORD_COMMANDS.map((c) => `/${c.name}`).join(', ')} registered in guild ${guild}.`);
}

if (isMain(import.meta.url)) await main();
