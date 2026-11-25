import { join } from 'node:path';
import { createIssueArchive } from './issueArchive.mjs';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags,
  PermissionFlagsBits, RESTJSONErrorCodes, SlashCommandBuilder, ThreadAutoArchiveDuration,
} from 'discord.js';

const OPEN = 'bugs:open';
const SUGGEST = 'bugs:suggest';
const CONFIRM_CLEAR = 'issues:clear';
const kinds = {
  bug: { title: 'Bug report', questions: [
    'What happened, and what did you expect to happen?',
    'How can we reproduce it? List the steps and say whether it happens every time.',
    'Where and when did it happen? Include your character name or location if relevant.',
    'What were you playing on? Include browser or desktop app, operating system, and game version if known.',
    'Any error messages, screenshots, or video? Attach them here if you have them.',
  ] },
  suggestion: { title: 'Feature suggestion', questions: [
    'What feature or change would you like to see?',
    'What problem would it solve, or what would it make more fun?',
    'How should it work in the game? Give an example if you can.',
    'Who would use it and when?',
    'Are there alternatives, trade-offs, or images that help explain your idea?',
  ] },
};
const CLOSE = 'bugs:archive'; // Existing report buttons keep working.
const CONFIRM_DELETE = 'bugs:confirm-delete';
const required = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages
  | PermissionFlagsBits.CreatePublicThreads | PermissionFlagsBits.SendMessagesInThreads
  | PermissionFlagsBits.ReadMessageHistory | PermissionFlagsBits.ManageThreads;
const button = (id, label, style) => new ActionRowBuilder()
  .addComponents(new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style));
const privately = (i, content) => i.reply({ content, flags: MessageFlags.Ephemeral });

export const bugReportCommand = new SlashCommandBuilder()
  .setName('bugreport').setDescription('Set up the Bunnyfall bug report panel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((c) => c.setName('setup').setDescription('Post or move the bug report button')
    .addChannelOption((o) => o.setName('channel').setDescription('Where players can open bug reports')
      .addChannelTypes(ChannelType.GuildText).setRequired(true)));

export const issueCommand = new SlashCommandBuilder()
  .setName('issue').setDescription('Manage Bunnyfall tickets')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads)
  .addSubcommand((c) => c.setName('report').setDescription('List open and archived bug reports and suggestions'))
  .addSubcommand((c) => c.setName('export').setDescription('Download open and archived tickets as a ZIP'))
  .addSubcommand((c) => c.setName('clear').setDescription('Permanently clear saved ticket files'));

export function createBugReports(db, dataDir, { archive = createIssueArchive(join(dataDir, 'issue-exports')) } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bug_report_panels (
      guild TEXT PRIMARY KEY, channel TEXT NOT NULL, message TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bug_report_threads (
      id TEXT PRIMARY KEY, reporter TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'bug'
    );
  `);
  if (!db.prepare('PRAGMA table_info(bug_report_threads)').all().some((column) => column.name === 'kind')) {
    db.exec("ALTER TABLE bug_report_threads ADD COLUMN kind TEXT NOT NULL DEFAULT 'bug'");
  }
  const panelFor = db.prepare('SELECT channel, message FROM bug_report_panels WHERE guild = ?');
  const savePanel = db.prepare(`INSERT INTO bug_report_panels VALUES (?, ?, ?)
    ON CONFLICT(guild) DO UPDATE SET channel = excluded.channel, message = excluded.message`);
  const saveThread = db.prepare('INSERT INTO bug_report_threads (id, reporter, kind) VALUES (?, ?, ?)');
  const threadFor = db.prepare('SELECT reporter, kind FROM bug_report_threads WHERE id = ?');
  const openThreads = db.prepare('SELECT id, reporter, kind FROM bug_report_threads ORDER BY id DESC');
  const deleteThread = db.prepare('DELETE FROM bug_report_threads WHERE id = ?');
  const opening = new Set();
  const closing = new Set();
  let archiveQueue = Promise.resolve();
  function withArchive(action) {
    const next = archiveQueue.then(action);
    archiveQueue = next.catch(() => {});
    return next;
  }
  const canModerate = (i) => i.memberPermissions?.has(PermissionFlagsBits.ManageThreads);
  const canClear = (i) => i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

  const panelPayload = () => ({
    content: '**Bunnyfall reports and suggestions**\nChoose an option to open a public thread with questions to answer.',
    components: [button(OPEN, 'Report a Bug', ButtonStyle.Primary)
      .addComponents(new ButtonBuilder().setCustomId(SUGGEST).setLabel('Suggest a Feature').setStyle(ButtonStyle.Secondary))],
  });

  async function refreshPanel(guild) {
    const saved = panelFor.get(guild.id);
    if (!saved) return;
    const channel = await guild.channels.fetch(saved.channel);
    if (channel?.type !== ChannelType.GuildText) return;
    const message = await channel.messages.fetch(saved.message);
    await message.edit(panelPayload());
  }
  async function setup(i) {
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return privately(i, 'Manage Server permission is required.');
    }
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = await i.guild.channels.fetch(i.options.getChannel('channel', true).id);
    if (channel?.type !== ChannelType.GuildText || !channel.permissionsFor(i.guild.members.me)?.has(required)) {
      return i.editReply('Choose a text channel where the bot can view the channel, send messages, create public threads, send messages in threads, read message history, and manage threads.');
    }
    const message = await channel.send(panelPayload());
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
    const kind = i.customId === SUGGEST ? 'suggestion' : 'bug';
    const { title, questions } = kinds[kind];
    const panel = panelFor.get(i.guildId);
    if (panel?.message !== i.message.id || panel.channel !== i.channelId) {
      return privately(i, 'This ticket button has moved. Use the current panel.');
    }
    const key = `${i.guildId}:${i.user.id}`;
    if (opening.has(key)) return privately(i, 'Your ticket thread is already being opened.');
    opening.add(key);
    try {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const thread = await i.channel.threads.create({
        name: `${title} · ${i.user.username}`,
        type: ChannelType.PublicThread,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: `${title} opened by Discord user ${i.user.id}`,
      });
      let starter;
      try {
        saveThread.run(thread.id, i.user.id, kind);
        starter = await thread.send({
          content: [
            `<@${i.user.id}>, reply in this thread with as much of this as you can:`,
            '',
            ...questions.map((question, index) => `${index + 1}. ${question}`),
            '',
            'This thread is public to people who can see the channel. The bot saves the opening questions now and the full conversation and attached images when the ticket closes. Keep account secrets and personal information out of the thread.',
          ].join('\n'),
          allowedMentions: { parse: [], users: [i.user.id] },
          components: [button(CLOSE, 'Close Ticket', ButtonStyle.Danger)],
        });
      } catch (error) {
        deleteThread.run(thread.id);
        await thread.delete('Ticket setup did not complete').catch(() => {});
        throw error;
      }
      try {
        await withArchive(() => archive.save(i.guildId, thread, { reporter: i.user.id, kind, starter }));
      } catch (error) {
        console.warn('Ticket opening snapshot:', error.message);
        return await i.editReply(`Your ticket is ready in <#${thread.id}>. The opening snapshot could not be saved. The bot will try again when the ticket closes.`);
      }
      return await i.editReply(`Your ticket is ready in <#${thread.id}>.`);
    } finally {
      opening.delete(key);
    }
  }

  async function close(i) {
    const thread = i.channel;
    const report = thread?.isThread() && threadFor.get(thread.id);
    if (!report || i.message.author.id !== i.client.user.id) {
      return privately(i, 'This button only works inside a Bunnyfall ticket.');
    }
    if (report.reporter !== i.user.id && !canModerate(i)) {
      return privately(i, 'Only the reporter or a moderator can close this ticket.');
    }
    if (!i.appPermissions?.has(PermissionFlagsBits.ManageThreads | PermissionFlagsBits.ReadMessageHistory)) {
      return privately(i, 'The bot needs Manage Threads and Read Message History to save and close this ticket.');
    }
    if (i.customId === CLOSE) {
      return i.reply({
        content: 'Close this ticket? The bot will save the transcript and attached images, then delete the Discord thread.',
        flags: MessageFlags.Ephemeral,
        components: [button(CONFIRM_DELETE, 'Save and Delete Thread', ButtonStyle.Danger)],
      });
    }
    if (closing.has(thread.id)) return privately(i, 'This ticket is already closing.');
    closing.add(thread.id);
    try {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      return await withArchive(async () => {
        const previous = { archived: thread.archived, locked: thread.locked };
        if (!previous.archived || !previous.locked) await thread.edit({ archived: true, locked: true });
        try {
          await archive.save(i.guildId, thread, { ...report, closedBy: i.user.id });
        } catch (error) {
          console.warn('Ticket archive:', error.message);
          await thread.edit(previous).catch(() => {});
          return i.editReply('The transcript or images could not be saved. The thread was kept. Try closing it again.');
        }
        try {
          await thread.delete(`Ticket archived by Discord user ${i.user.id}`);
        } catch (error) {
          if (error.code !== RESTJSONErrorCodes.UnknownChannel) {
            console.warn('Ticket delete:', error.message);
            return i.editReply('The ticket was saved, but Discord could not delete the thread. Try closing it again.');
          }
        }
        deleteThread.run(thread.id);
        await archive.removeOpening(i.guildId, thread.id).catch((error) => console.warn('Ticket snapshot cleanup:', error.message));
        return i.editReply('Ticket saved and Discord thread deleted.').catch(() => {});
      });
    } finally {
      closing.delete(thread.id);
    }
  }

  async function issues(i) {
    const command = i.isButton() ? 'clear' : i.options.getSubcommand();
    if (command === 'clear') {
      if (!canClear(i)) return privately(i, 'Manage Server permission is required to clear saved tickets.');
      if (!i.isButton()) return i.reply({
        content: 'Permanently delete all saved transcripts and images for this server?',
        flags: MessageFlags.Ephemeral,
        components: [button(CONFIRM_CLEAR, 'Clear Saved Tickets', ButtonStyle.Danger)],
      });
      if (i.message.author.id !== i.client.user.id) return privately(i, 'Run /issue clear to clear the archive.');
      await i.deferUpdate();
      return withArchive(async () => {
        await archive.clear(i.guildId);
        return i.editReply({ content: 'All saved tickets for this server have been cleared.', components: [] });
      });
    }
    if (!canModerate(i)) return privately(i, 'Manage Threads permission is required to access saved tickets.');
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    return withArchive(async () => {
      const tracked = openThreads.all();
      const member = tracked.length ? await i.guild.members.fetch(i.user.id) : null;
      const open = [];
      const permissions = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory;
      for (const ticket of tracked) {
        const thread = await i.guild.channels.fetch(ticket.id).catch((error) => {
          if ([RESTJSONErrorCodes.UnknownChannel, RESTJSONErrorCodes.MissingAccess].includes(error.code)) return null;
          throw error;
        });
        if (!thread?.isThread() || !thread.permissionsFor(member)?.has(permissions)
          || !thread.permissionsFor(i.guild.members.me)?.has(permissions)) continue;
        open.push({ ...ticket, thread });
      }
      const openIds = new Set(open.map(({ id }) => id));
      const tickets = (await archive.tickets(i.guildId)).filter(({ id }) => !openIds.has(id));
      const count = open.length + tickets.length;
      if (!count) return i.editReply('There are no accessible open or archived tickets.');
      const summary = `${open.length} open, ${tickets.length} archived`;
      if (command === 'export') {
        return archive.zip(i.guildId, tickets, (attachment, size) =>
          size > (i.attachmentSizeLimit ?? 10 * 1024 * 1024)
            ? i.editReply('The ZIP is larger than Discord’s upload limit. The archived tickets are still in the bot’s issue-exports folder.')
            : i.editReply({ content: `Exported ${count} ticket(s) (${summary}).`, files: [{ attachment, name: 'bunnyfall-issues.zip' }] }), open);
      }
      const report = [`Tickets: ${count} (${summary})`, '',
        ...open.map(({ kind, id, thread }) =>
          `OPEN | ${kinds[kind]?.title ?? 'Ticket'} | ${thread.name} | ID ${id}`),
        ...tickets.map((ticket) =>
          `ARCHIVED | ${ticket.closedAt} | ${kinds[ticket.kind]?.title ?? 'Ticket'} | ${ticket.title} | ID ${ticket.id} | ${ticket.messages} messages, ${ticket.images} images`),
      ].join('\n');
      return i.editReply({ content: `Tickets: ${count} (${summary}). See the attached report for the full list.`,
        files: [{ attachment: Buffer.from(report), name: 'bunnyfall-issue-report.txt' }] });
    });
  }

  function handle(i) {
    if (i.isChatInputCommand() && i.commandName === 'bugreport') return setup(i);
    if (i.isChatInputCommand() && i.commandName === 'issue') return issues(i);
    if (i.isButton() && i.customId === CONFIRM_CLEAR) return issues(i);
    if (i.isButton() && (i.customId === OPEN || i.customId === SUGGEST)) return open(i);
    if (i.isButton() && (i.customId === CLOSE || i.customId === CONFIRM_DELETE)) return close(i);
    return null;
  }
  return { handle, refreshPanel };
}
