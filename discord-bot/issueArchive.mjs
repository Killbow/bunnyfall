import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';

const snowflake = /^\d{17,20}$/;
const imageSuffix = /\.(?:avif|bmp|gif|jpe?g|png|webp|heic|heif|tiff?|svg)$/i;
const fileName = (name) => String(name ?? 'image').replace(/[^\w.-]/g, '_').slice(-140);
const oneLine = (value) => String(value).replace(/[\r\n]+/g, ' ');

async function downloadImage(attachment, path, fetchImage) {
  const url = new URL(attachment.url);
  if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.host)) {
    throw new Error('Image is outside Discord’s attachment CDN.');
  }
  const response = await fetchImage(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) throw new Error(`Discord image download failed (${response.status}).`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path, { flags: 'wx' }));
}

export function createIssueArchive(root, { fetchImage = globalThis.fetch } = {}) {
  function folder(guild) {
    if (!snowflake.test(guild)) throw new Error('Invalid Discord server ID.');
    return join(root, guild);
  }

  async function tickets(guild) {
    const dir = folder(guild);
    const entries = await readdir(dir, { withFileTypes: true }).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const results = await Promise.all(entries.filter((entry) => entry.isDirectory() && snowflake.test(entry.name))
      .map(async (entry) => JSON.parse(await readFile(join(dir, entry.name, 'ticket.json'), 'utf8'))));
    return results.sort((a, b) => b.closedAt.localeCompare(a.closedAt));
  }

  async function save(guild, thread, { reporter, kind, closedBy = null, starter = null }) {
    if (!snowflake.test(thread.id)) throw new Error('Invalid Discord thread ID.');
    const dir = starter ? join(folder(guild), '.open') : folder(guild);
    const final = join(dir, thread.id);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    // A retry after a successful save can delete the still-locked thread without downloading everything again.
    try { return JSON.parse(await readFile(join(final, 'ticket.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const stage = await mkdtemp(join(dir, '.saving-'));
    try {
      const messages = starter ? [starter] : [];
      let before;
      while (!starter) {
        const batch = await thread.messages.fetch({ limit: 100, before, cache: false });
        if (!batch.size) break;
        const page = [...batch.values()];
        messages.push(...page);
        if (page.length < 100) break;
        before = page.reduce((oldest, msg) => BigInt(msg.id) < BigInt(oldest) ? msg.id : oldest, page[0].id);
      }
      if (!messages.length) throw new Error('Discord returned an empty transcript.');
      messages.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      const lines = [];
      let images = 0;
      for (const msg of messages) {
        lines.push(`[${new Date(msg.createdTimestamp).toISOString()}] ${oneLine(msg.author.tag ?? msg.author.username)} (${msg.author.id})`);
        if (msg.reference?.messageId) lines.push(`Reply to message ${msg.reference.messageId}`);
        if (msg.content) lines.push(msg.content);
        for (const attachment of msg.attachments.values()) {
          const name = fileName(attachment.name);
          const image = attachment.contentType?.startsWith('image/') || imageSuffix.test(name);
          if (!image) {
            lines.push(`Attachment: ${name} (not an image)`);
            continue;
          }
          if (!snowflake.test(attachment.id)) throw new Error('Invalid Discord attachment ID.');
          const relative = `images/${attachment.id}-${name}`;
          if (images === 0) await mkdir(join(stage, 'images'));
          await downloadImage(attachment, join(stage, relative), fetchImage);
          lines.push(`Image: ${relative}`);
          images++;
        }
        lines.push('');
      }
      const record = { id: thread.id, title: oneLine(thread.name), kind, reporter, closedBy,
        openedAt: new Date(thread.createdTimestamp ?? Date.now()).toISOString(),
        closedAt: starter ? null : new Date().toISOString(), messages: messages.length, images };
      const header = [record.title, `Ticket: ${record.id}`, `Type: ${record.kind}`,
        `Reporter: ${reporter}`, `Opened: ${record.openedAt}`,
        ...(record.closedAt ? [`Closed by: ${closedBy}`, `Closed: ${record.closedAt}`] : []), '', ''];
      await writeFile(join(stage, 'transcript.txt'), header.concat(lines).join('\n'), 'utf8');
      await writeFile(join(stage, 'ticket.json'), JSON.stringify(record, null, 2) + '\n', 'utf8');
      await rename(stage, final);
      return record;
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }

  async function zip(guild, results, send) {
    const temp = await mkdtemp(join(tmpdir(), 'bunnyfall-issues-'));
    const path = join(temp, 'bunnyfall-issues.zip');
    try {
      const archive = new ZipFile();
      archive.on('error', (error) => archive.outputStream.destroy(error));
      const output = createWriteStream(path, { flags: 'wx' });
      const complete = pipeline(archive.outputStream, output);
      // Observe failures while input files are being enumerated.
      complete.catch(() => {});
      try {
        for (const ticket of results) {
          if (!snowflake.test(ticket.id)) throw new Error('Invalid archived ticket ID.');
          const source = join(folder(guild), ticket.id);
          const imageFiles = ticket.images ? await readdir(join(source, 'images')) : [];
          for (const file of ['ticket.json', 'transcript.txt', ...imageFiles.map((name) => `images/${name}`)]) {
            archive.addFile(join(source, file), `${ticket.id}/${file}`);
          }
        }
        archive.end();
        await complete;
      } catch (error) {
        archive.outputStream.destroy();
        await complete.catch(() => {});
        throw error;
      }
      return await send(path, (await stat(path)).size);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }

  async function clear(guild) {
    const dir = folder(guild);
    for (const ticket of await tickets(guild)) {
      if (!snowflake.test(ticket.id)) throw new Error('Invalid archived ticket ID.');
      await rm(join(dir, ticket.id), { recursive: true });
    }
  }

  async function removeOpening(guild, id) {
    if (!snowflake.test(id)) throw new Error('Invalid Discord thread ID.');
    await rm(join(folder(guild), '.open', id), { recursive: true, force: true });
  }

  return { save, tickets, zip, clear, removeOpening };
}
