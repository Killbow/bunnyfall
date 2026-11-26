// Grants or revokes one customs pass for one account through the account service. Signs in as a developer from
// DAGGER_HANDLE and DAGGER_PASSWORD, or uses DAGGER_SECRET.
// Run: node tools/customsPass.mjs <name> | --account <id> [--revoke].

import { DEFAULT_ACCOUNT_SERVICE, accountRefusalText } from '../src/net/accountClient.js';
import { isMain } from './lib/isMain.mjs';

export const USAGE = [
  'usage: node tools/customsPass.mjs <name> [--revoke]',
  '       node tools/customsPass.mjs --account <id> [--revoke]',
  '  <name> is a handle, or a guest\'s two-word name as the game shows it.',
  '  Sign in with DAGGER_HANDLE and DAGGER_PASSWORD (or DAGGER_SECRET); DAGGER_ACCOUNT_SERVICE for another service.',
].join('\n');

/**
 * @param {string[]} argv
 * @returns {{ body: { name?: string, account?: string, revoke?: true } } | { usage: string }}
 */
export function passRequest(argv) {
  let revoke = false;
  /** @type {string | undefined} */
  let account;
  const words = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--revoke') { revoke = true; continue; }
    if (a === '--account') {
      if (account !== undefined || i + 1 >= argv.length) return { usage: USAGE };
      account = argv[++i];
      continue;
    }
    if (a.startsWith('--')) return { usage: USAGE };
    words.push(...a.trim().split(/\s+/).filter(Boolean));
  }
  if ((account === undefined) === (words.length === 0) || words.length > 2) return { usage: USAGE };
  const body = account !== undefined ? { account } : { name: words.join(' ') };
  return { body: revoke ? { ...body, revoke: true } : body };
}

async function post(base, path, body, secret = null) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  const req = passRequest(process.argv.slice(2));
  if ('usage' in req) { console.error(req.usage); process.exit(2); }
  const base = process.env.DAGGER_ACCOUNT_SERVICE || DEFAULT_ACCOUNT_SERVICE;
  let secret = process.env.DAGGER_SECRET || null;
  let opened = false;
  if (!secret) {
    const handle = process.env.DAGGER_HANDLE, password = process.env.DAGGER_PASSWORD;
    if (!handle || !password) { console.error('Sign in first: set DAGGER_HANDLE and DAGGER_PASSWORD, or DAGGER_SECRET.'); process.exit(2); }
    const signed = await post(base, '/v1/auth/login', { handle, password, label: 'tools/customsPass.mjs' });
    if (!signed.ok || typeof signed.body?.secret !== 'string') { console.error(`Sign-in refused: ${accountRefusalText(signed.body?.error)}`); process.exit(1); }
    secret = signed.body.secret;
    opened = true;
  }
  try {
    const r = await post(base, '/v1/mod/customs-pass', req.body, secret);
    if (!r.ok) { console.error(`Refused (${r.body?.error ?? r.status}): ${accountRefusalText(r.body?.error)}`); process.exitCode = 1; return; }
    const { target, name, open, changed } = r.body;
    const who = `${name} (${target})`;
    if (open) console.log(changed ? `Granted: ${who} holds a customs pass. Their next Bring online of a character the realm never counted comes in, once.` : `${who} already holds an open customs pass.`);
    else console.log(changed ? `Taken back: ${who}'s open customs pass.` : `${who} holds no open customs pass - nothing to take back.`);
  } finally {
    if (opened) await post(base, '/v1/auth/logout', {}, secret).catch(() => {});
  }
}

if (isMain(import.meta.url)) main();
