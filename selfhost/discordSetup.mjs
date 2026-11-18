import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function savePrivate(file, value) {
  const temp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, value, { mode: 0o600, flag: 'wx' });
    renameSync(temp, file);
  } finally {
    rmSync(temp, { force: true });
  }
}

export function discordIntegrationKey(dir) {
  if (process.env.BUNNYFALL_DISCORD_KEY) return process.env.BUNNYFALL_DISCORD_KEY;
  const file = join(dir, 'discord-integration.key');
  if (!existsSync(file)) savePrivate(file, randomBytes(32).toString('hex'));
  return readFileSync(file, 'utf8').trim();
}

export function manageDiscord({ dir, root, accountBase, key }) {
  const file = join(dir, 'discord-bot.json');
  const cwd = join(root, 'discord-bot');
  const entry = join(cwd, 'bot.mjs');
  let config = null;
  try { config = JSON.parse(readFileSync(file, 'utf8')); } catch { /* no saved setup */ }
  let child = null;
  let status = config ? 'offline' : 'unconfigured';
  let generation = 0;
  let closed = false;

  function restart() {
    generation++;
    if (child) {
      child.kill();
      return;
    }
    if (closed || !config) {
      status = 'unconfigured';
      return;
    }
    if (!existsSync(join(cwd, 'node_modules', 'discord.js'))) {
      status = 'dependencies-missing';
      return;
    }
    status = 'starting';
    const started = generation;
    const arena = process.env.ARENA2_PATH || join(dir, 'arena2');
    const worker = fork(entry, [], {
      cwd,
      execArgv: [],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: {
        DISCORD_TOKEN: config.token, DISCORD_GUILD_ID: config.guildId, BUNNYFALL_URL: accountBase,
        BUNNYFALL_DISCORD_KEY: key, BUNNYFALL_BOT_DB: join(dir, 'discord-lfg.sqlite'),
        ...(existsSync(arena) ? { ARENA2_PATH: arena } : {}),
      },
    });
    child = worker;
    worker.on('message', (message) => {
      if (message === 'discord-ready' && started === generation) status = 'online';
    });
    worker.on('error', () => { status = 'offline'; });
    worker.on('close', () => {
      child = null;
      if (started !== generation) restart();
      else status = 'offline';
    });
  }

  restart();
  return {
    status: () => ({ status, guildId: config?.guildId ?? null }),
    configure(body) {
      if (body?.disable === true) {
        rmSync(file, { force: true });
        config = null;
      } else {
        const guildId = typeof body?.guildId === 'string' ? body.guildId.trim() : '';
        const token = typeof body?.token === 'string' ? body.token.trim() : '';
        if (!/^\d{17,20}$/.test(guildId) || !/^[\w.-]{30,256}$/.test(token)) return false;
        const next = { guildId, token };
        savePrivate(file, JSON.stringify(next));
        config = next;
      }
      status = config ? 'starting' : 'unconfigured';
      restart();
      return true;
    },
    close() { closed = true; restart(); },
  };
}
