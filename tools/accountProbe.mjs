// Boots the account service in local workerd and checks boot, crypto, migrations, tokens, and save routes
// on local D1 and R2.
// Run with `npm run account`; set WRANGLER_BIN to an installed wrangler so npx does not resolve it on every call.
import { spawn, execFile } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { promisify } from 'node:util';
import { writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wranglerCommand, devSpawnOptions, killTree } from './lib/wranglerLaunch.mjs';
import { verifyToken, importPublicKeyB64 } from '../src/net/identityToken.js';
import { PBKDF2_ITERS } from '../server-account/src/password.js';
import { ACCOUNT_VERSION, SHOT_MAX_BYTES } from '../server-account/src/service.js';
import { ACCEPTED } from '../src/net/legalLaw.js';
import { gzipText, REALM_TEXT_MAX_BYTES } from '../src/net/realmSaveCodec.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const acct = join(root, 'server-account');
const run = promisify(execFile);
const PORT = Number(process.env.ACCOUNT_PROBE_PORT || 8811);
const BASE = `http://127.0.0.1:${PORT}`;
const WRANGLER_BIN = process.env.WRANGLER_BIN || '';
const cmd = (args) => wranglerCommand(args, { bin: WRANGLER_BIN });

let checks = 0; let bad = 0;
const ok = (name, pass, detail = '') => {
  checks++; if (!pass) bad++;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` - ${detail}` : ''}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each run gets a fresh state folder, since `wrangler --local` reuses its D1 and R2 between runs.
const STATE = mkdtempSync(join(tmpdir(), 'acctprobe-state-'));
const HANDLE = 'ProbeWalker';
const STRANGER = 'ProbeStranger';

// Use node:http instead of fetch so proxy environment variables never apply to the loopback calls.
function call(method, path, body, opts = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = httpRequest({
      host: '127.0.0.1', port: PORT, path, method, timeout: Number(opts.timeout ?? 20_000),
      headers: {
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
      },
    }, (res) => {
      let text = '';
      res.on('data', (d) => { text += d; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { }
        resolve({ status: res.statusCode, body: parsed, text });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timed out')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
const post = (path, body) => call('POST', path, body ?? {});
const get = (path, opts) => call('GET', path, undefined, opts);

function raw(method, path, buf, bearer, extra = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: '127.0.0.1', port: PORT, path, method, timeout: 30_000,
      headers: {
        ...(buf ? { 'content-type': 'application/octet-stream', 'content-length': buf.length } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...extra,
      },
    }, (res) => {
      const parts = [];
      res.on('data', (d) => parts.push(d));
      res.on('end', () => {
        const all = Buffer.concat(parts);
        const type = res.headers['content-type'] ?? '';
        let body = null;
        if (type.includes('json')) { try { body = JSON.parse(all.toString('utf8')); } catch { } }
        resolve({ status: res.statusCode, type, buf: all, body });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timed out')); });
    req.on('error', reject);
    if (buf) req.write(buf);
    req.end();
  });
}

const tmp = mkdtempSync(join(tmpdir(), 'acctprobe-'));
let dev = null;

try {
  console.log('== minting a throwaway signing pair (never written into the repo)');
  const { stdout } = await run(process.execPath, [join(root, 'tools/mintIdentityKeys.mjs'), '--pipe']);
  const [priv, pub] = stdout.split('\n');
  ok('the key tool emits a pair', Boolean(priv && pub));
  const envFile = join(tmp, 'probe.env');
  writeFileSync(envFile, `IDENTITY_PRIVATE_KEY=${priv}\nIDENTITY_PUBLIC_KEY=${pub}\n`, { mode: 0o600 });

  console.log('== applying the real migrations to a local D1, through wrangler\'s ledger');
  const [migBin, migArgs] = cmd(['d1', 'migrations', 'apply', 'daggerfall-accounts', '--local', '--persist-to', STATE]);
  // Wrangler reprints its summary once per migration, so the output needs a large buffer
  // and the names are deduplicated.
  const mig = await run(migBin, migArgs, { cwd: acct, timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
  const seen = [...new Set([...mig.stdout.matchAll(/(\d{4}_\w+\.sql)/g)].map((m) => m[1]))];
  const onDisk = readdirSync(join(acct, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  ok('every migration in the directory was applied, in order',
    seen.join() === onDisk.join(), `applied ${seen.join(' ')} | on disk ${onDisk.join(' ')}`);

  // Only a refused connection means the port is free; an orphaned workerd accepts connections and never answers.
  let held = false;
  try {
    await get('/v1/health', { timeout: 2000 });
    held = true;
  } catch (e) {
    if (!/ECONNREFUSED/i.test(String(e?.message ?? e))) held = true;
  }
  if (held) {
    throw new Error(`something is already holding ${PORT} (answering, or accepting and never replying)`
      + ' - kill it with `pkill -f workerd`, or set ACCOUNT_PROBE_PORT to a free port');
  }

  console.log('== booting the Worker in workerd');
  const [devBin, devArgs] = cmd(['dev', '--local', '--persist-to', STATE, '--port', String(PORT), '--ip', '127.0.0.1', '--env-file', envFile]);
  // Spawn the whole tree so the kill also stops the workerd grandchild that holds the port.
  dev = spawn(devBin, devArgs, devSpawnOptions({ cwd: acct, stdio: ['ignore', 'pipe', 'pipe'] }));
  let log = '';
  dev.stdout.on('data', (d) => { log += d; });
  dev.stderr.on('data', (d) => { log += d; });

  let up = false;
  for (let i = 0; i < 150 && !up; i++) {
    await sleep(1000);
    if (i && i % 10 === 0) console.log(`   ...still waiting for workerd (${i}s)`);
    try { up = (await get('/v1/health', { timeout: 2000 })).status === 200; } catch { }
  }
  if (!up) {
    console.log('--- wrangler said ---');
    console.log(log.split('\n').filter((l) => l.trim()).slice(-25).join('\n'));
    console.log('---------------------');
  }
  ok('the Worker BOOTS in workerd', up,
    up ? '' : `never answered /v1/health. workerd said: ${(/Uncaught[^\n]*/.exec(log) || ['(no uncaught error)'])[0]}`);
  if (!up) throw new Error('the Worker did not start');

  const health = await get('/v1/health');
  ok('/v1/health names the deploy this tree builds', health.body?.v === ACCOUNT_VERSION,
    `${health.body?.v} vs ${ACCOUNT_VERSION}`);
  ok('an unknown path is 404, answered before any credential', (await get('/v1/nope')).status === 404);

  console.log('== the account lifecycle, against real D1');
  // /v1/health answers without touching D1, so this is the first check that the database binding works.
  const first = await post('/v1/auth/guest', { label: 'probe', ...ACCEPTED });
  if (first.status !== 200) {
    throw new Error(`/v1/auth/guest answered ${first.status} ${JSON.stringify(first.body)}`
      + ' - if this is `no-database`, the local D1 wrangler dev opened is not the one'
      + ' `d1 migrations apply --local` wrote to');
  }
  const guest = first.body;
  ok('a guest is a real row from first contact', Boolean(guest?.id && guest?.secret));
  ok('...under a name from Daggerfall\'s own banks, with exactly one space',
    /^\S+ \S+$/.test(guest?.name ?? ''), guest?.name);
  const unticked = await post('/v1/auth/guest', { label: 'probe-unticked' });
  ok('no account opens for a game from before the boxes - told it may need updating',
    unticked.status === 400 && unticked.body?.error === 'not-found', `${unticked.status} ${JSON.stringify(unticked.body)}`);
  const half = await post('/v1/auth/guest', { label: 'probe-half', terms: ACCEPTED.terms });
  ok('...nor with one document ticked and not the other',
    half.status === 400 && half.body?.error === 'terms-unaccepted', `${half.status} ${JSON.stringify(half.body)}`);

  const tokRes = await post('/v1/auth/token', { secret: guest.secret });
  const tok = tokRes.body;
  ok('the Worker mints a token', typeof tok?.token === 'string',
    typeof tok?.token === 'string' ? '' : `${tokRes.status} ${JSON.stringify(tok)}`);
  if (typeof tok?.token !== 'string') throw new Error('no token to verify - the rest of this probe is about that token');

  const pubRes = await get('/v1/pubkey');
  const pubkey = pubRes.body;
  ok('the service publishes its own public half, with no credential', Boolean(pubkey?.key),
    pubkey?.key ? '' : `${pubRes.status} ${JSON.stringify(pubkey)}`);
  if (!pubkey?.key) throw new Error('no published key - the seam ACC1d needs is not there');

  const { subtle } = globalThis.crypto;
  const vk = await importPublicKeyB64(pubkey.key, { subtle });
  const nowS = Math.floor(Date.now() / 1000);
  const v = await verifyToken(tok.token, vk, { subtle, nowS });
  ok('A TOKEN THE WORKER SIGNED VERIFIES AGAINST THE KEY THE WORKER PUBLISHES',
    v.ok === true, v.ok ? `${v.claims.n} / ${v.claims.k}` : v.why);
  ok('...and the name in it is the one the SERVICE holds, not one a client asked for',
    v.ok && v.claims.n === guest.name);

  const stranger = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const svk = await subtle.importKey('raw', await subtle.exportKey('raw', stranger.publicKey),
    { name: 'Ed25519' }, false, ['verify']);
  ok('a stranger\'s key refuses the same token', (await verifyToken(tok.token, svk, { subtle, nowS })).ok === false);
  const [tv, body, sig] = tok.token.split('.');
  const bent = `${tv}.${body.slice(0, -2)}${body.slice(-2) === 'AA' ? 'AB' : 'AA'}.${sig}`;
  ok('one bent byte in the claims is refused', (await verifyToken(bent, vk, { subtle, nowS })).ok === false);

  console.log('== password, recovery and the throttle, in the runtime that will run them');
  const t0 = Date.now();
  const reg = (await post('/v1/auth/register',
    { secret: guest.secret, handle: HANDLE, password: 'a good long one', ...ACCEPTED })).body;
  const regMs = Date.now() - t0;
  ok('registering is an UPGRADE IN PLACE - the id does not change', Boolean(reg?.recoveryCode));
  const view = (await get('/v1/account', { bearer: guest.secret })).body;
  ok('...the same player id, now linked', view?.account?.id === guest.id && view?.account?.kind === 'linked');
  ok(`PBKDF2 at ${PBKDF2_ITERS} fits a Worker's CPU budget`, regMs < 10_000, `register took ${regMs}ms`);
  ok('...and is at or under the cap Cloudflare enforces in PRODUCTION ONLY (workerd does not)', PBKDF2_ITERS <= 100_000, `${PBKDF2_ITERS} would be NotSupportedError on the real platform`);

  const good = await post('/v1/auth/login', { handle: HANDLE.toLowerCase(), password: 'a good long one' });
  ok('a handle is case-insensitive on the way in', good.status === 200);
  const miss = await post('/v1/auth/login', { handle: 'nobody-holds-this', password: 'a good long one' });
  const wrong = await post('/v1/auth/login', { handle: HANDLE, password: 'not the password' });
  ok('a handle nobody holds and a wrong password refuse identically',
    miss.status === wrong.status && miss.body?.error === wrong.body?.error, miss.body?.error);

  console.log('== the cloud saves, against real local R2');
  const me = (await post('/v1/auth/login', { handle: HANDLE, password: 'a good long one' })).body;
  const SLOT = '/v1/saves/c0ffee00-1111-2222-3333-444455556666/before%20the%20lich';
  ok('a linked account starts with no cloud saves',
    (await get('/v1/saves', { bearer: me.secret })).body?.saves?.length === 0);

  const visitor = (await post('/v1/auth/guest', { label: 'probe-guest', ...ACCEPTED })).body;
  const walled = await get('/v1/saves', { bearer: visitor.secret });
  ok('a GUEST is walled out of the save routes', walled.status === 403 && walled.body?.error === 'saves-need-account',
    `${walled.status} ${walled.body?.error}`);

  const blob = Buffer.from(`{"probe":"${'x'.repeat(4096)}"}`);
  ok('a blob with no card is refused (SAV4: a slot is only real WITH its SaveInfo)',
    (await raw('PUT', `${SLOT}/data`, blob, me.secret)).status === 404);
  const card = await call('PUT', SLOT, { characterName: 'Nystul', gameTime: 42, realTime: Date.now() }, { bearer: me.secret });
  ok('the card creates the slot', card.status === 200 && card.body?.created === true,
    `${card.status} ${JSON.stringify(card.body)}`);
  const put = await raw('PUT', `${SLOT}/data`, blob, me.secret);
  ok('the blob lands in R2 and the row counts its bytes',
    put.status === 200 && put.body?.bytes === blob.length, `${put.status} ${JSON.stringify(put.body)}`);
  const listed = (await get('/v1/saves', { bearer: me.secret })).body?.saves ?? [];
  ok('...and the listing says so', listed.length === 1 && listed[0].bytes === blob.length
    && listed[0].saveName === 'before the lich', JSON.stringify(listed[0]));
  const down = await raw('GET', `${SLOT}/data`, undefined, me.secret);
  ok('THE BYTES COME BACK OUT OF REAL R2, byte for byte',
    Buffer.compare(down.buf, blob) === 0, `${down.status} ${down.buf.length} of ${blob.length}`);
  ok('...as an octet-stream and not a JSON envelope around base64',
    down.type.includes('octet-stream'), down.type);
  ok('the shot is bounded apart from the save',
    (await raw('PUT', `${SLOT}/shot`, Buffer.alloc(SHOT_MAX_BYTES + 1), me.secret)).status === 413);

  const other = (await post('/v1/auth/guest', { label: 'probe-other', ...ACCEPTED })).body;
  await post('/v1/auth/register', { secret: other.secret, handle: STRANGER, password: 'a good long one', ...ACCEPTED });
  ok('another account cannot read this slot',
    (await raw('GET', `${SLOT}/data`, undefined, other.secret)).status === 404);
  ok('...and cannot delete it either',
    (await call('DELETE', SLOT, undefined, { bearer: other.secret })).status === 404);
  ok('...and this slot is still here', (await get('/v1/saves', { bearer: me.secret })).body?.saves?.length === 1);

  ok('the player\'s own delete takes the slot', (await call('DELETE', SLOT, undefined, { bearer: me.secret })).status === 200);
  ok('...the row is gone', (await get('/v1/saves', { bearer: me.secret })).body?.saves?.length === 0);
  ok('...and so is the object in R2', (await raw('GET', `${SLOT}/data`, undefined, me.secret)).status === 404);

  console.log('== a realm save, packed, against real local R2 and workerd\'s own streams');
  const realmer = (await post('/v1/auth/guest', { label: 'probe-realm', ...ACCEPTED })).body;
  const made = await call('POST', '/v1/realm/create', { name: 'Thoryn' }, { bearer: realmer.secret });
  ok('a realm character is made, and the service says it opens a packed save', made.status === 200 && made.body?.gzip === true,
    `${made.status} ${JSON.stringify(made.body)}`);
  const RS = `/v1/realm/${made.body?.id}/data`;
  const at = (seq) => ({ 'x-realm-lease': made.body?.lease, 'x-realm-seq': String(seq) });
  const born = await raw('PUT', RS, Buffer.from(await gzipText(JSON.stringify({ level: 1, goldPieces: 100, items: [] }))), realmer.secret, at(1));
  ok('a packed first save is opened and measured (AUDIT REALM2 S1) - a new character\'s lands', born.status === 200,
    `${born.status} ${JSON.stringify(born.body)}`);
  const items = [];
  for (let i = 0; items.length < 60_000; i++) items.push({ templateIndex: (i * 37) % 300, name: `Record ${i}`, value: (i * 7919) % 10007, condition: (i * 31) % 100 });
  const life = JSON.stringify({ v: 1, name: 'Thoryn', items });
  const packed = Buffer.from(await gzipText(life));
  const landed = await raw('PUT', RS, packed, realmer.secret, at(2));
  ok(`a save past the request's 4 MiB of text (${Buffer.byteLength(life)} bytes) lands packed (${packed.length})`,
    Buffer.byteLength(life) > 4 * 1024 * 1024 && landed.status === 200 && landed.body?.seq === 2, `${landed.status} ${JSON.stringify(landed.body)}`);
  const asStored = await raw('GET', `${RS}?enc=gzip`, undefined, realmer.secret);
  ok('...read as stored, it is the packed bytes, byte for byte', Buffer.compare(asStored.buf, packed) === 0, `${asStored.status} ${asStored.buf.length}`);
  const older = await raw('GET', RS, undefined, realmer.secret);
  ok('...and a build from before is answered the text, opened by workerd', older.status === 200 && older.buf.toString('utf8') === life,
    `${older.status} ${older.buf.length} of ${Buffer.byteLength(life)}`);
  const huge = Buffer.from(await gzipText(JSON.stringify({ v: 1, pad: 'x'.repeat(REALM_TEXT_MAX_BYTES + 10) })));
  const refused = await raw('PUT', RS, huge, realmer.secret, at(3));
  ok('a packed save whose trailer says past the text\'s bound is refused', refused.status === 413 && refused.body?.error === 'too-large',
    `${refused.status} ${JSON.stringify(refused.body)}`);
  const liar = await call('POST', '/v1/realm/create', { name: 'Liar' }, { bearer: realmer.secret });
  const text = JSON.stringify({ level: 1, goldPieces: 100, items: [], pad: 'x'.repeat(REALM_TEXT_MAX_BYTES) });
  const lying = Buffer.concat([Buffer.from(await gzipText(text.slice(0, -2))), Buffer.from(await gzipText(text.slice(-2)))]);
  const lied = await raw('PUT', `/v1/realm/${liar.body?.id}/data`, lying, realmer.secret, { 'x-realm-lease': liar.body?.lease, 'x-realm-seq': '1' });
  ok('a first save whose trailer lies is no new character\'s', lied.status === 403 && lied.body?.error === 'realm-birth',
    `${lied.status} ${JSON.stringify(lied.body)}`);

  console.log('== back to the account: recovery');
  const back = await post('/v1/auth/recover',
    { handle: HANDLE, code: reg.recoveryCode.toLowerCase(), password: 'the new one here' });
  ok('the recovery code ROUND-TRIPS through a real request, lowercased', back.status === 200);
  ok('...and mints a NEW code', Boolean(back.body?.recoveryCode) && back.body.recoveryCode !== reg.recoveryCode);
  ok('...and signs the old devices out', (await post('/v1/auth/token', { secret: guest.secret })).status === 401);
} catch (e) {
  bad++;
  console.log(` FAIL  the probe could not finish - ${e?.message ?? e}`);
} finally {
  if (dev?.pid) {
    for (const sig of ['SIGTERM', 'SIGKILL']) {
      try { killTree(dev.pid, sig); } catch { }
      await sleep(500);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  rmSync(STATE, { recursive: true, force: true });
}

console.log(`\n${checks - bad}/${checks} checks passed`);
process.exit(bad ? 1 : 0);
