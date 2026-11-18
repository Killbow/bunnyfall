import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client,
  EmbedBuilder, Events, GatewayIntentBits, MessageFlags, Partials, PermissionFlagsBits, SlashCommandBuilder,
  escapeMarkdown,
} from 'discord.js';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { portraitRenderer } from './portrait.mjs';
import { buildEmbed, changelogDay, cpuPercent, memory, probeRelay } from './panel.mjs';

const { DISCORD_TOKEN, DISCORD_GUILD_ID, BUNNYFALL_URL, BUNNYFALL_DISCORD_KEY, ARENA2_PATH } = process.env;
if (!DISCORD_TOKEN || !DISCORD_GUILD_ID || !BUNNYFALL_URL || BUNNYFALL_DISCORD_KEY?.length < 32 || !BUNNYFALL_DISCORD_KEY) {
  throw new Error('Set DISCORD_TOKEN, DISCORD_GUILD_ID, BUNNYFALL_URL and BUNNYFALL_DISCORD_KEY.');
}
const endpoint = new URL('/v1/integrations/discord', BUNNYFALL_URL);
const render = await portraitRenderer(ARENA2_PATH);
const stateFile = process.env.BUNNYFALL_BOT_DB || './data/lfg.sqlite';
mkdirSync(dirname(stateFile), { recursive: true });
const db = new DatabaseSync(stateFile);
db.exec('CREATE TABLE IF NOT EXISTS lfg (id TEXT PRIMARY KEY, record TEXT NOT NULL)');
const get = db.prepare('SELECT record FROM lfg WHERE id = ?');
// the status panel: ONE row, the channel and message it keeps editing (survives restarts with the rest of data/)
db.exec('CREATE TABLE IF NOT EXISTS status_panel (id INTEGER PRIMARY KEY CHECK (id = 1), channel TEXT, message TEXT, up_since INTEGER, was_up INTEGER)');
const panelRow = () => db.prepare('SELECT * FROM status_panel WHERE id = 1').get() ?? null;
const panelSave = db.prepare('INSERT INTO status_panel (id, channel, message, up_since, was_up) VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET channel = excluded.channel, message = excluded.message, up_since = excluded.up_since, was_up = excluded.was_up');
// the relay's read-only /status door: BUNNYFALL_RELAY_URL, else beside the account service (local :8788 -> :8787) or under /relay
const relayUrl = process.env.BUNNYFALL_RELAY_URL || (() => { const u = new URL(BUNNYFALL_URL); if (u.port === '8788') u.port = '8787'; else u.pathname = `${u.pathname.replace(/\/$/, '')}/relay`; return u.toString(); })();
const STATUS_EVERY_MS = Math.max(15, Number(process.env.STATUS_INTERVAL_S) || 30) * 1000;
const save = db.prepare('INSERT INTO lfg VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record');

const command = (name, description) => new SlashCommandBuilder().setName(name).setDescription(description);
const option = (builder, name, description, max = 80) => builder.addStringOption((o) =>
  o.setName(name).setDescription(description).setMaxLength(max).setRequired(true));
const boards = {
  level: 'Character Level',
  renown: 'Character Renown',
  depths: 'Elite Breach · Depths',
  'descent-alone': 'Elite Breach · Solo Descent',
  'descent-few': 'Elite Breach · Small Group Descent',
  'descent-company': 'Elite Breach · Company Descent',
};
const commands = [
  option(command('player', 'Look up a Bunnyfall character'), 'name', 'Exact character name'),
  command('leaderboard', 'Show the top ten Bunnyfall characters').addStringOption((o) => o
    .setName('board').setDescription('Ranking').setRequired(true)
    .addChoices(...Object.entries(boards).map(([value, name]) => ({ name, value })))),
  command('tavern', 'Manage the two-way Tavern bridge').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((c) => c.setName('setup').setDescription('Connect a channel to Tavern')
      .addChannelOption((o) => o.setName('channel').setDescription('Discord text channel')
        .addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((c) => c.setName('status').setDescription('Show the connected channel'))
    .addSubcommand((c) => c.setName('disable').setDescription('Pause both directions')),
  command('status', 'Bunnyfall server status panel').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((c) => c.setName('setup').setDescription('Post the live status panel in a channel (moves it if one exists)')
      .addChannelOption((o) => o.setName('channel').setDescription('Where to post it')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand((c) => c.setName('stop').setDescription('Stop updating the status panel and delete it')),
  command('closeissue', 'Lock and archive the current forum post').setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads),
  command('link', 'Link the Bunnyfall character you are playing'),
  command('me', 'Show your linked Bunnyfall character'),
  command('unlink', 'Remove your Bunnyfall connection'),
  command('lfg', 'Recruit a group').addSubcommand((c) => option(c.setName('create')
    .setDescription('Post a group listing'), 'activity', 'Dungeon, raid, or other activity')
    .addIntegerOption((o) => o.setName('slots').setDescription('Total players including you')
      .setMinValue(2).setMaxValue(20).setRequired(true))
    .addStringOption((o) => o.setName('start').setDescription('Start in ISO 8601, including a timezone')
      .setMaxLength(35))),
];
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User] });
const mentions = { parse: [] };
const title = (embed, text) => embed.setTitle(text).setColor(0x9458cf);
const copy = {
  'not-found': 'No living character matched that name.',
  ambiguous: 'More than one character has that name.',
  unlinked: 'No linked character is available. Use /link while playing your character.',
};

async function game(action, fields = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${BUNNYFALL_DISCORD_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...fields }),
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  if (!response.ok && !copy[result.error]) throw new Error(`Bunnyfall API: ${response.status}`);
  return result;
}

async function showPlayer(i, action, fields) {
  await i.deferReply();
  const result = await game(action, fields);
  if (result.error) return i.editReply({ content: copy[result.error], allowedMentions: mentions });
  const p = result.profile;
  const embed = title(new EmbedBuilder(), p.name).addFields(
    { name: 'Level', value: String(p.level ?? '—'), inline: true },
    { name: 'Race', value: p.race || '—', inline: true },
    { name: 'Class', value: p.className || '—', inline: true },
  );
  let png = result.png ? Buffer.from(result.png, 'base64') : null;
  if (!png) {
    try { png = await render(p); } catch (error) { console.warn('Standard portrait:', error.message); }
  }
  const files = png ? [new AttachmentBuilder(png, { name: 'paperdoll.png' })] : [];
  if (png) embed.setImage('attachment://paperdoll.png');
  return i.editReply({ embeds: [embed], files, allowedMentions: mentions });
}

async function linkedName(user) {
  try {
    const result = await game('me', { discordId: user.id, art: false });
    return result.profile?.name ?? user.displayName;
  } catch { return user.displayName; }
}

function lfgCard(record, id) {
  const full = record.members.length >= record.slots;
  const state = record.closed ? 'Closed' : full ? 'Full' : 'Open';
  const embed = title(new EmbedBuilder(), record.activity)
    .setDescription(record.start ? `Starts <t:${record.start}:F> (<t:${record.start}:R>)` : 'Start time to be arranged')
    .addFields({ name: `${state} · ${record.members.length}/${record.slots}`,
      value: record.members.map(({ name }, index) => `${index + 1}. ${escapeMarkdown(name.slice(0, 40))}`).join('\n').slice(0, 1024) });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lfg:join:${id}`).setLabel('Join').setStyle(ButtonStyle.Success).setDisabled(record.closed || full),
    new ButtonBuilder().setCustomId(`lfg:leave:${id}`).setLabel('Leave').setStyle(ButtonStyle.Secondary).setDisabled(record.closed),
    new ButtonBuilder().setCustomId(`lfg:close:${id}`).setLabel('Close').setStyle(ButtonStyle.Danger).setDisabled(record.closed),
  );
  return { embeds: [embed], components: [row], allowedMentions: mentions };
}

const privateReply = (i, content) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: mentions });

async function createLfg(i) {
  const raw = i.options.getString('start');
  const start = raw ? Math.floor(Date.parse(raw) / 1000) : null;
  if (raw && (!/(Z|[+-]\d\d:\d\d)$/.test(raw) || !start || start <= Date.now() / 1000)) {
    return privateReply(i, 'Enter a future start time like 2026-12-01T20:00:00+01:00.');
  }
  await i.deferReply();
  const record = {
    owner: i.user.id, activity: i.options.getString('activity', true), slots: i.options.getInteger('slots', true),
    start, closed: false, members: [{ id: i.user.id, name: await linkedName(i.user) }],
  };
  const message = await i.fetchReply();
  save.run(message.id, JSON.stringify(record));
  return i.editReply(lfgCard(record, message.id));
}

async function changeLfg(i, action, id) {
  const row = get.get(id);
  if (!row || i.message.id !== id) return i.followUp({ content: 'This listing is unavailable.', flags: MessageFlags.Ephemeral });
  const record = JSON.parse(row.record);
  const member = record.members.some((m) => m.id === i.user.id);
  const say = (content) => i.followUp({ content, flags: MessageFlags.Ephemeral });
  if (record.closed) return say('This listing is closed.');
  if (action === 'close') {
    if (record.owner !== i.user.id) return say('Only the organizer can close the listing.');
    record.closed = true;
  } else if (action === 'join') {
    if (member) return say('You already joined.');
    if (record.members.length >= record.slots) return say('The group is full.');
    record.members.push({ id: i.user.id, name: await linkedName(i.user) });
  } else if (action === 'leave') {
    if (record.owner === i.user.id) return say('Use Close to end your own listing.');
    if (!member) return say('You have not joined.');
    record.members = record.members.filter((m) => m.id !== i.user.id);
  } else return;
  save.run(id, JSON.stringify(record));
  await i.editReply(lfgCard(record, id));
}

let rosterQueue = Promise.resolve();
async function interaction(i) {
  if (i.guildId !== DISCORD_GUILD_ID) return;
  if (i.isButton() && i.customId.startsWith('lfg:')) {
    const [, action, id] = i.customId.split(':');
    await i.deferUpdate();
    const job = rosterQueue.then(() => changeLfg(i, action, id));
    rosterQueue = job.catch(() => {});
    return job;
  }
  if (!i.isChatInputCommand()) return;
  switch (i.commandName) {
    case 'player': return showPlayer(i, 'player', { name: i.options.getString('name', true) });
    case 'me': return showPlayer(i, 'me', { discordId: i.user.id });
    case 'leaderboard': {
      await i.deferReply();
      const board = i.options.getString('board', true);
      const { entries, season } = await game('board', { board });
      const embed = title(new EmbedBuilder(), boards[board])
        .setDescription(entries.map(({ name, score, rank }, index) =>
          `**${rank ?? index + 1}.** ${escapeMarkdown(name)} · ${score.toLocaleString('en')}`).join('\n') || 'No standings yet.');
      if (season) embed.setFooter({ text: `Season ${season.n}` });
      return i.editReply({ embeds: [embed], allowedMentions: mentions });
    }
    case 'link': {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const { code } = await game('link', { discordId: i.user.id });
      return i.editReply(`In Bunnyfall, enter this in chat on the character you want to link: \`/discordlink ${code}\`\nThe code expires in 10 minutes.`);
    }
    case 'unlink':
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await game('unlink', { discordId: i.user.id });
      return i.editReply('Your Bunnyfall account was unlinked.');
    case 'closeissue': {
      if (!i.memberPermissions?.has(PermissionFlagsBits.ManageThreads)) {
        return privateReply(i, 'Manage Threads permission is required.');
      }
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const thread = i.channel ?? await i.guild.channels.fetch(i.channelId);
      const parent = thread?.isThread() && (thread.parent ?? await i.guild.channels.fetch(thread.parentId));
      if (!parent || parent.type !== ChannelType.GuildForum) {
        return i.editReply('Run /closeissue inside the forum post you want to close.');
      }
      if (!i.appPermissions?.has(PermissionFlagsBits.ManageThreads)) {
        return i.editReply('The bot needs Manage Threads permission in this forum.');
      }
      if (thread.archived && thread.locked) return i.editReply('This post is already locked and archived.');
      await thread.edit({ archived: true, locked: true, reason: `Closed with /closeissue by Discord user ${i.user.id}` });
      return i.editReply('Forum post locked and archived.');
    }
    case 'tavern': {
      if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return privateReply(i, 'Manage Server permission is required.');
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const sub = i.options.getSubcommand();
      if (sub === 'status') {
        const { channel } = await game('status');
        return i.editReply(channel ? `Tavern is connected to <#${channel}>.` : 'Tavern is disabled.');
      }
      const selected = sub === 'setup' ? i.options.getChannel('channel', true) : null;
      const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ReadMessageHistory];
      if (selected && !selected.permissionsFor(i.guild.members.me)?.has(required)) {
        return i.editReply('The bot needs View Channel, Send Messages, Embed Links, Add Reactions, and Read Message History in that channel.');
      }
      await game('setup', { channel: selected?.id ?? null });
      tavernChannel = selected?.id ?? null;
      return i.editReply(selected ? `Tavern is connected to <#${selected.id}> in both directions.` : 'Tavern is disabled in both directions.');
    }
    case 'status': {
      if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return privateReply(i, 'Manage Server permission is required.');
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const old = panelRow();
      if (old?.channel && old.message) await client.channels.fetch(old.channel).then((c) => c?.messages.delete(old.message)).catch(() => {});
      if (i.options.getSubcommand() === 'stop') { panelSave.run(null, null, null, 0); return i.editReply('The status panel is stopped.'); }
      const selected = i.options.getChannel('channel', true);
      const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
      if (!selected.permissionsFor(i.guild.members.me)?.has(required)) return i.editReply('The bot needs View Channel, Send Messages and Embed Links in that channel.');
      panelSave.run(selected.id, null, old?.up_since ?? null, old?.was_up ?? 0);
      await refreshPanel();
      return i.editReply(`The status panel is in <#${selected.id}> and updates every ${STATUS_EVERY_MS / 1000}s.`);
    }
    case 'lfg': return createLfg(i);
  }
}

client.on(Events.InteractionCreate, (i) => {
  void interaction(i).catch(async (error) => {
    console.warn('Interaction:', error.message);
    const content = 'Bunnyfall could not complete that request. Try again shortly.';
    try {
      if (i.isButton() && i.deferred) await i.followUp({ content, flags: MessageFlags.Ephemeral });
      else if (i.deferred) await i.editReply(content);
      else if (i.isRepliable()) await privateReply(i, content);
    } catch { /* expired interaction */ }
  });
});

/** Draw and edit the status panel's one message; a deleted one is posted anew; an unreachable relay shows Offline. Never throws. */
async function refreshPanel() {
  try {
    const row = panelRow();
    if (!row?.channel) return;
    const nowS = Math.floor(Date.now() / 1000);
    const relay = await probeRelay(relayUrl);
    const upSince = relay.up ? (row.was_up ? row.up_since : nowS) : null;   // up time counts from when the bot first saw the server up
    const body = buildEmbed({ relay, cpu: cpuPercent(), mem: memory(), hostUptimeS: os.uptime(), upSinceS: upSince, day: changelogDay(new URL('../CHANGELOG.md', import.meta.url)), nowS, siteUrl: process.env.BUNNYFALL_SITE_URL });
    const payload = { embeds: body.embeds, allowedMentions: mentions };
    const channel = await client.channels.fetch(row.channel).catch(() => null);
    if (!channel?.isSendable() || channel.guildId !== DISCORD_GUILD_ID) return;
    let message = row.message ? await channel.messages.fetch(row.message).catch(() => null) : null;
    if (message) await message.edit(payload); else message = await channel.send(payload);
    panelSave.run(row.channel, message.id, upSince, relay.up ? 1 : 0);
  } catch (error) { console.warn('Status panel:', error.message); }
}

let tavernChannel = null;
client.on(Events.MessageCreate, (message) => {
  if (message.guildId !== DISCORD_GUILD_ID || message.author.bot || message.webhookId
    || message.channelId !== tavernChannel || !message.cleanContent?.trim()) return;
  void game('say', {
    channel: message.channelId, event: message.id, name: message.member?.displayName ?? message.author.displayName,
    text: message.cleanContent, discordId: message.author.id,
  }).catch((error) => console.warn('Tavern incoming:', error.message));
});

client.on(Events.MessageReactionAdd, (reaction, user) => {
  const { message, emoji } = reaction;
  if (user.bot || user.id === client.user?.id || emoji.name !== '🪙'
    || message.guildId !== DISCORD_GUILD_ID || message.channelId !== tavernChannel) return;
  void (async () => {
    if (user.partial && (await user.fetch()).bot) return;
    await game('tip', { discordId: user.id, channel: message.channelId, message: message.id });
  })().catch((error) => console.warn('Tavern tip:', error.message));
});

async function poll() {
  try {
    const { channel, floor, lines, serves = [] } = await game('poll');
    tavernChannel = channel;
    if (!channel || (!lines.length && !serves.length)) return;
    const destination = await client.channels.fetch(channel);
    if (!destination?.isSendable() || destination.guildId !== DISCORD_GUILD_ID) return;
    for (const serve of serves) {
      const embed = title(new EmbedBuilder(), 'A round at the Tavern')
        .setDescription(`**${escapeMarkdown(serve.name)}** served **${escapeMarkdown(serve.patron)}** a **${escapeMarkdown(serve.drink)}**!`)
        .setFooter({ text: 'React with 🪙 to award 5 gold · one tip per Discord account' });
      const message = await destination.send({
        embeds: [embed], allowedMentions: mentions, nonce: `bfserve${serve.id}`, enforceNonce: true,
      });
      await game('served-message', { id: serve.id, channel, message: message.id });
      try { await message.react('🪙'); } catch { console.warn('Tavern needs Add Reactions permission.'); }
    }
    for (const line of lines) {
      await destination.send({
        content: `**${escapeMarkdown(line.name)} [Bunnyfall]**: ${escapeMarkdown(line.text)}`,
        allowedMentions: mentions, flags: MessageFlags.SuppressEmbeds, nonce: `bf${line.id}`, enforceNonce: true,
      });
      await game('ack', { channel, floor, id: line.id });
    }
  } catch (error) {
    console.warn('Tavern outgoing:', error.message);
  } finally {
    setTimeout(poll, 3000);
  }
}

client.once(Events.ClientReady, async () => {
  try {
    const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
    for (const definition of commands) await guild.commands.create(definition.toJSON());
    console.log(`Bunnyfall bot ready in ${guild.name}.`);
    process.send?.('discord-ready');
    void poll();
    setInterval(() => void refreshPanel(), STATUS_EVERY_MS);
  } catch (error) {
    console.error('Discord registration failed:', error.message);
    process.exitCode = 1;
    client.destroy();
  }
});
await client.login(DISCORD_TOKEN);
