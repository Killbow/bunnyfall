#!/usr/bin/env node
// Warns every player online that the server will restart.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mintRestartOrder } from '../src/net/identityToken.js';
import { parseRestartArg, RESTART_MIN_S, RESTART_MAX_S } from '../src/net/restartLaw.js';

const USAGE = `usage: restart.sh -5min | -30s | -1h | cancel   (${RESTART_MIN_S} seconds to ${RESTART_MAX_S / 60} minutes)`;

const arg = parseRestartArg(process.argv[2]);
if ('error' in arg) {
  console.error(arg.error === 'range' ? `out of range. ${USAGE}` : USAGE);
  process.exit(2);
}

const data = process.env.BUNNYFALL_DATA || join(process.cwd(), 'data');
let keys;
try { keys = JSON.parse(readFileSync(join(data, 'keys.json'), 'utf8')); } catch (e) {
  console.error(`cannot read the server's keys in ${data}/keys.json (${e?.message ?? e})`);
  process.exit(1);
}

const { subtle } = globalThis.crypto;
const privateKey = await subtle.importKey('pkcs8', Buffer.from(keys.identity.priv, 'base64'), { name: 'Ed25519' }, false, ['sign']);
const nowS = Math.floor(Date.now() / 1000);
const ra = 'cancel' in arg ? 0 : nowS + arg.seconds;
const order = await mintRestartOrder({ ra }, privateKey, { subtle, nowS });

const relay = `http://127.0.0.1:${process.env.RELAY_PORT || '8787'}/v1/law`;
let res, body;
try {
  res = await fetch(relay, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order }) });
  body = await res.json().catch(() => ({}));
} catch (e) {
  console.error(`the relay did not answer at ${relay} (${e?.message ?? e})`);
  process.exit(1);
}
if (!res.ok || body?.ok !== true) {
  console.error(`the relay refused the notice (${res.status} ${body?.error ?? ''})`);
  process.exit(1);
}
const who = `${body.n ?? 0} player connection(s) told`;
if ('cancel' in arg) console.log(`restart called off - ${who}`);
else console.log(`warning sent: ${arg.seconds >= 60 ? `${Math.round(arg.seconds / 60)} min` : `${arg.seconds} s`}, at ${new Date(ra * 1000).toLocaleTimeString('en-GB', { timeZone: 'UTC' })} UTC - ${who}`);
console.log(`ra=${ra}`);
