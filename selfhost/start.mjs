#!/usr/bin/env node
// BUNNYFALL: runs the relay and the account service on this machine, no Cloudflare account needed.
// Runs both Workers in workerd (Miniflare's API, see BUNNYFALL PERF below). Everything persists under DATA (default ./data).
//   node selfhost/start.mjs            listen on 127.0.0.1 (Windows test)
//   BIND=0.0.0.0 node selfhost/start.mjs   listen on all interfaces (Docker)
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

// BUNNYFALL PERF: the Workers run straight in workerd through Miniflare's API, never `wrangler dev`. wrangler dev is a
// development server: it puts a proxy Worker (a second workerd) in front of each Worker and every WebSocket frame
// crosses it, watches the source tree to rebuild, polls a file registry to join the two Workers, runs an inspector
// and records a trace of every request. Here each Worker is bundled once, both live in ONE workerd, the service
// bindings are direct, and each listens on its own port with no hop in between. The data layout is wrangler's own
// (DATA/v3/...), so a box that ran the old way keeps its accounts, saves and rooms.
const require = createRequire(join(root, 'server', 'package.json'));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const wr = require('wrangler');
const BUILD = join(DATA, 'build');
const parseVars = (file) => Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
function bundle(name, toml) {
  const out = join(BUILD, name);
  rmSync(out, { recursive: true, force: true });
  const r = spawnSync(process.execPath, [wrangler, 'deploy', '--dry-run', '--outdir', out, '-c', toml], { stdio: ['ignore', 'pipe', 'inherit'], env });
  if (r.status !== 0) { console.error(`[bunnyfall] could not bundle ${name}`); process.exit(r.status || 1); }
  const main = readdirSync(out).find((f) => /\.m?js$/.test(f) && !f.endsWith('.map'));
  return { out, main: join(out, main) };
}
function workerFrom(toml, name, varsFile, port) {
  const { workerOptions } = wr.unstable_getMiniflareWorkerOptions(toml);
  const b = bundle(name, toml);
  const keep = ['compatibilityDate', 'compatibilityFlags', 'bindings', 'r2Buckets', 'd1Databases', 'durableObjects', 'serviceBindings'];
  const opts = Object.fromEntries(keep.filter((k) => workerOptions[k] !== undefined).map((k) => [k, workerOptions[k]]));
  return {
    ...opts,
    name,
    modulesRoot: b.out,
    modules: [{ type: 'ESModule', path: b.main }],
    bindings: { ...opts.bindings, ...parseVars(varsFile) },
    unsafeDirectSockets: [{ host: BIND, port: Number(port) }],
  };
}
console.log('[bunnyfall] bundling the Workers');
const accountsWorker = workerFrom(accountToml, 'daggerfall-accounts', accountVars, ACCOUNT_PORT);
const relayWorker = workerFrom(relayToml, 'daggerfall-online', relayVars, RELAY_PORT);
const mf = new Miniflare(convertV4MiniflareOptions({
  host: '127.0.0.1',
  port: 0,
  resourcePersistencePath: join(DATA, 'v3'),
  logRequests: false,
  workers: [accountsWorker, relayWorker],
}));
await mf.ready;
const accountsFetcher = await mf.getWorker('daggerfall-accounts');

// Cloudflare would fire the account service's crons; here the runner fires them, once a minute.
const accountBase = `http://127.0.0.1:${ACCOUNT_PORT}`;
setInterval(async () => {
  const crons = ['* * * * *'];
  if (new Date().getUTCMinutes() === 41) crons.push('41 * * * *');
  for (const cron of crons) {
    try { await accountsFetcher.scheduled({ cron, scheduledTime: new Date() }); } catch (e) { console.error('[bunnyfall] cron', cron, e?.message ?? e); }
  }
}, 60_000);

// The owner's update button (selfhost/updater.mjs): leaves a request the host's cron acts on.
const updater = startUpdater({ port: UPDATER_PORT, bind: BIND, accountBase, accountToml, dir: UPDATES });

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  try { updater.close(); } catch { /* gone */ }
  mf.dispose().catch(() => {});
  setTimeout(() => process.exit(code), 3000).unref();
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
console.log(`[bunnyfall] relay on ${BIND}:${RELAY_PORT}, accounts on ${BIND}:${ACCOUNT_PORT}, data in ${DATA}`);
