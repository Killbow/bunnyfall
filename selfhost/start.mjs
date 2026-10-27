#!/usr/bin/env node
// BUNNYFALL: runs the relay and the account service on this machine, no Cloudflare account needed.
// Uses wrangler's local runtime (workerd + miniflare). Everything persists under DATA (default ./data).
//   node selfhost/start.mjs            listen on 127.0.0.1 (Windows test)
//   BIND=0.0.0.0 node selfhost/start.mjs   listen on all interfaces (Docker)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startUpdater } from './updater.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const DATA = resolve(process.env.BUNNYFALL_DATA || join(root, 'data'));
const BIND = process.env.BIND || '127.0.0.1';
const RELAY_PORT = process.env.RELAY_PORT || '8787';
const ACCOUNT_PORT = process.env.ACCOUNT_PORT || '8788';
const UPDATER_PORT = process.env.UPDATER_PORT || '8789';
const UPDATES = resolve(process.env.BUNNYFALL_UPDATES || join(root, 'updates'));
const wrangler = join(root, 'server', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const relayToml = join(here, 'relay.toml');
const accountToml = join(here, 'accounts.toml');

if (!existsSync(wrangler)) {
  console.error('wrangler is missing: run "npm ci" inside the server folder first.');
  process.exit(1);
}
mkdirSync(DATA, { recursive: true });

// Two Ed25519 pairs, minted once and kept in DATA/keys.json. Losing them only costs every player one reconnect.
async function mintPair() {
  const { subtle } = globalThis.crypto;
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  return {
    priv: Buffer.from(await subtle.exportKey('pkcs8', kp.privateKey)).toString('base64'),
    pub: Buffer.from(await subtle.exportKey('raw', kp.publicKey)).toString('base64url'),
  };
}
const keyFile = join(DATA, 'keys.json');
if (!existsSync(keyFile)) {
  const keys = { identity: await mintPair(), gate: await mintPair() };
  writeFileSync(keyFile, JSON.stringify(keys, null, 2), { mode: 0o600 });
  console.log(`[bunnyfall] minted new signing keys in ${keyFile}`);
}
const keys = JSON.parse(readFileSync(keyFile, 'utf8'));
const relayVars = join(DATA, 'relay.vars');
const accountVars = join(DATA, 'accounts.vars');
writeFileSync(relayVars, `IDENTITY_PUBLIC_KEY=${keys.identity.pub}\nGATE_SIGNING_KEY=${keys.gate.priv}\n`, { mode: 0o600 });
writeFileSync(accountVars, `IDENTITY_PRIVATE_KEY=${keys.identity.priv}\nIDENTITY_PUBLIC_KEY=${keys.identity.pub}\nGATE_PUBLIC_KEY=${keys.gate.pub}\n`, { mode: 0o600 });

const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };

// The account database: every migration not yet applied, applied now.
console.log('[bunnyfall] applying database migrations');
const mig = spawnSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', DATA, '-c', accountToml], { stdio: 'inherit', env });
if (mig.status !== 0) { console.error('[bunnyfall] migrations failed'); process.exit(mig.status || 1); }

const children = [];
function run(name, args) {
  const child = spawn(process.execPath, [wrangler, 'dev', ...args, '--persist-to', DATA, '--ip', BIND, '--show-interactive-dev-session=false'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = (chunk) => String(chunk).split('\n').filter((l) => l.trim() && !/Environment Variable|Durable Object|D1 Database|R2 Bucket|Analytics Engine|^\s*Binding|^\s*env\./.test(l)).map((l) => `[${name}] ${l}`).join('\n');
  child.stdout.on('data', (c) => { const s = tag(c); if (s) console.log(s); });
  child.stderr.on('data', (c) => { const s = tag(c); if (s) console.error(s); });
  child.on('exit', (code) => { console.error(`[bunnyfall] ${name} stopped (${code}), shutting down`); stop(code || 1); });
  children.push(child);
}
run('accounts', ['-c', accountToml, '--port', ACCOUNT_PORT, '--inspector-port', '9230', '--env-file', accountVars, '--test-scheduled']);
run('relay', ['-c', relayToml, '--port', RELAY_PORT, '--inspector-port', '9231', '--env-file', relayVars]);

// Cloudflare would fire the account service's crons; locally we knock on its test door once a minute.
const accountBase = `http://127.0.0.1:${ACCOUNT_PORT}`;
setInterval(async () => {
  const crons = ['* * * * *'];
  if (new Date().getUTCMinutes() === 41) crons.push('41 * * * *');
  for (const cron of crons) {
    try { await fetch(`${accountBase}/__scheduled?cron=${encodeURIComponent(cron)}`); } catch { /* not up yet */ }
  }
}, 60_000);

// The owner's update button (selfhost/updater.mjs): leaves a request the host's cron acts on.
const updater = startUpdater({ port: UPDATER_PORT, bind: BIND, accountBase, accountToml, dir: UPDATES });

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  try { updater.close(); } catch { /* gone */ }
  for (const c of children) { try { c.kill('SIGTERM'); } catch { /* gone */ } }
  setTimeout(() => process.exit(code), 3000).unref();
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
console.log(`[bunnyfall] relay on ${BIND}:${RELAY_PORT}, accounts on ${BIND}:${ACCOUNT_PORT}, data in ${DATA}`);
