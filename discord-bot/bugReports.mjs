import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags,
  PermissionFlagsBits, RESTJSONErrorCodes, SlashCommandBuilder, ThreadAutoArchiveDuration,
} from 'discord.js';

const OPEN = 'bugs:open';
const CLOSE = 'bugs:archive'; // Existing report buttons keep working.
const CONFIRM_DELETE = 'bugs:confirm-delete';
const required = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages
  | PermissionFlagsBits.CreatePublicThreads | PermissionFlagsBits.SendMessagesInThreads
  | PermissionFlagsBits.ManageThreads;
const button = (id, label, style) => new ActionRowBuilder()
  .addComponents(new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style));
const privately = (i, content) => i.reply({ content, flags: MessageFlags.Ephemeral });

export const bugReportCommand = new SlashCommandBuilder()
  .setName('bugreport').setDescription('Set up the Bunnyfall bug report panel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((c) => c.setName('setup').setDescription('Post or move the bug report button')
    .addChannelOption((o) => o.setName('channel').setDescription('Where players can open bug reports')
      .addChannelTypes(ChannelType.GuildText).setRequired(true)));

export function createBugReports(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bug_report_panels (
      guild TEXT PRIMARY KEY, channel TEXT NOT NULL, message TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bug_report_threads (
      id TEXT PRIMARY KEY, reporter TEXT NOT NULL
    );
  `);
  const panelFor = db.prepare('SELECT channel, message FROM bug_report_panels WHERE guild = ?');
  const savePanel = db.prepare(`INSERT INTO bug_report_panels VALUES (?, ?, ?)
    ON CONFLICT(guild) DO UPDATE SET channel = excluded.channel, message = excluded.message`);
  const saveThread = db.prepare('INSERT INTO bug_report_threads VALUES (?, ?)');
  const threadFor = db.prepare('SELECT reporter FROM bug_report_threads WHERE id = ?');
  const deleteThread = db.prepare('DELETE FROM bug_report_threads WHERE id = ?');
  const opening = new Set();

  async function setup(i) {
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return privately(i, 'Manage Server permission is required.');
    }
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = await i.guild.channels.fetch(i.options.getChannel('channel', true).id);
    if (channel?.type !== ChannelType.GuildText || !channel.permissionsFor(i.guild.members.me)?.has(required)) {
      return i.editReply('Choose a text channel where the bot can view the channel, send messages, create public threads, send messages in threads, and manage threads.');
    }
    const message = await channel.send({
      content: '**Report a Bunnyfall bug**\nClick below to open a public report thread with questions to answer.',
      components: [button(OPEN, 'Report a Bug', ButtonStyle.Primary)],
    });
    const old = panelFor.get(i.guildId);
    try {
      savePanel.run(i.guildId, channel.id, message.id);
    } catch (error) {
      await message.delete().catch(() => {});
      throw error;
    }
    if (old) {
      const previous = await i.guild.channels.fetch(old.channel).catch(() => null);
      await previous?.messages?.delete(old.message).catch(() => {});
    }
    return i.editReply(`Bug report panel posted in <#${channel.id}>.`);
  }

  async function open(i) {
    const panel = panelFor.get(i.guildId);
    if (panel?.message !== i.message.id || panel.channel !== i.channelId) {
      return privately(i, 'This bug report button has moved. Use the current report panel.');
    }
    const key = `${i.guildId}:${i.user.id}`;
    if (opening.has(key)) return privately(i, 'Your report thread is already being opened.');
    opening.add(key);
    try {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const thread = await i.channel.threads.create({
        name: `Bug report · ${i.user.username}`,
        type: ChannelType.PublicThread,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: `Bug report opened by Discord user ${i.user.id}`,
      });
      try {
        saveThread.run(thread.id, i.user.id);
        await thread.send({
          content: [
            `<@${i.user.id}>, reply in this thread with as much of this as you can:`,
            '',
            '1. **What happened, and what did you expect to happen?**',
            '2. **How can we reproduce it?** List the steps and say whether it happens every time.',
            '3. **Where and when did it happen?** Include your character name or location if relevant.',
            '4. **What were you playing on?** Include browser or desktop app, operating system, and game version if known.',
            '5. **Any error messages, screenshots, or video?** Attach them here if you have them.',
            '',
            'This thread is public to people who can see the channel. Keep account secrets and personal information out of your report.',
          ].join('\n'),
          allowedMentions: { parse: [], users: [i.user.id] },
          components: [button(CLOSE, 'Close and Delete Report', ButtonStyle.Danger)],
        });
      } catch (error) {
        deleteThread.run(thread.id);
        await thread.delete('Bug report setup did not complete').catch(() => {});
        throw error;
      }
      return await i.editReply(`Your bug report is ready in <#${thread.id}>.`);
    } finally {
      opening.delete(key);
    }
  }

  async function close(i) {
    const thread = i.channel;
    const report = thread?.isThread() && threadFor.get(thread.id);
    if (!report || i.message.author.id !== i.client.user.id) {
      return privately(i, 'This button only works inside a Bunnyfall bug report.');
    }
    if (report.reporter !== i.user.id && !i.memberPermissions?.has(PermissionFlagsBits.ManageThreads)) {
      return privately(i, 'Only the reporter or a moderator can delete this report.');
    }
    if (!i.appPermissions?.has(PermissionFlagsBits.ManageThreads)) {
      return privately(i, 'The bot needs Manage Threads permission to delete this report.');
    }
    if (i.customId === CLOSE) {
      return i.reply({
        content: 'Delete this bug report and all messages in its thread? This is permanent.',
        flags: MessageFlags.Ephemeral,
        components: [button(CONFIRM_DELETE, 'Permanently Delete', ButtonStyle.Danger)],
      });
    }
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await thread.delete(`Bug report closed by Discord user ${i.user.id}`);
    } catch (error) {
      if (error.code !== RESTJSONErrorCodes.UnknownChannel) throw error; // Discord already removed the channel.
    }
    deleteThread.run(thread.id);
    // Discord may remove the interaction's reply along with its thread.
    return i.editReply('Bug report deleted.').catch(() => {});
  }

  return function handle(i) {
    if (i.isChatInputCommand() && i.commandName === 'bugreport') return setup(i);
    if (i.isButton() && i.customId === OPEN) return open(i);
    if (i.isButton() && (i.customId === CLOSE || i.customId === CONFIRM_DELETE)) return close(i);
    return null;
  };
}
