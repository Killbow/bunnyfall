// Calls the account service's developer review routes (server-account/src/review.js); USAGE lists the commands.
// Sign in with DAGGER_HANDLE and DAGGER_PASSWORD, or DAGGER_SECRET; DAGGER_ACCOUNT_SERVICE picks another service.

import { DEFAULT_ACCOUNT_SERVICE, accountRefusalText } from '../src/net/accountClient.js';
import { repairOf, repairFlagOf, purseMendOf } from '../src/net/repairLaw.js';
import { isHandleShaped } from '../src/net/handleShape.js';
import { isMain } from './lib/isMain.mjs';

export const USAGE = [
  'usage: node tools/realmReview.mjs holds',
  '       node tools/realmReview.mjs findings|clear|hold|rollback <realm character id> [note]',
  '         (clear lifts the hold and EXCUSES the finding standing, exactly as it stands now - its pieces, purse, bank,',
  '          level, attributes and skills; any other state holds again. A clean checkpoint ends the excuse of a purse, bank,',
  '          level, attribute or skill; a piece\'s excuse stands. A purse below nothing: use mend)',
  '       node tools/realmReview.mjs budget [days]',
  '       node tools/realmReview.mjs budget-set <json>',
  '       node tools/realmReview.mjs bodies [days]',
  '       node tools/realmReview.mjs grants [days]',
  '       node tools/realmReview.mjs progress [days]',
  '       node tools/realmReview.mjs progress-set <json>',
  '       node tools/realmReview.mjs gains [days]',
  '       node tools/realmReview.mjs trades <realm character id>',
  '       node tools/realmReview.mjs characters <handle>',
  '       node tools/realmReview.mjs repair <realm character id> <ticket> <faction id> <flag: 0x40 | 64 | Summoned> <gold> [note]',
  '       node tools/realmReview.mjs mend <realm character id> <ticket> <was: the purse below nothing, -8000000> <gold owed> [note]',
  '  Sign in with DAGGER_HANDLE and DAGGER_PASSWORD (or DAGGER_SECRET); DAGGER_ACCOUNT_SERVICE for another service.',
].join('\n');

/**
 * @param {any} body
 * @returns {string[]}
 */
export function faucetLines(body) {
  if (!Array.isArray(body?.faucets)) return [];
  return body.faucets.map((/** @type {any} */ f) => `faucet ${f.kind}: ${f.gold} gold in ${f.n} payments over the last ${body.days} days`);
}

const BY_ID = Object.freeze(['findings', 'clear', 'hold', 'rollback', 'trades']);

/**
 * @param {string[]} argv
 * @returns {{ path: string, body: any } | { usage: string }}
 */
export function reviewRequest(argv) {
  const [act, ...rest] = argv;
  if (act === 'holds' && rest.length === 0) return { path: '/v1/mod/realm-holds', body: {} };
  if (act === 'characters' && rest.length === 1 && isHandleShaped(rest[0])) return { path: '/v1/mod/realm-characters', body: { name: rest[0] } };
  if (act === 'repair' && rest.length >= 5 && /^r[0-9a-f]{20}$/.test(rest[0])) {
    const [id, ticket, faction, flag, gold] = rest;
    // repairOf and purseMendOf are the service's own checks, so a typo is refused here before anything is sent.
    const repair = repairOf({ ticket, faction: /^[0-9]+$/.test(faction) ? Number(faction) : NaN, flag: repairFlagOf(flag), gold: /^[0-9]+$/.test(gold) ? Number(gold) : NaN });
    const note = rest.slice(5).join(' ');
    return repair ? { path: '/v1/mod/realm-repair', body: { id, ...repair, ...(note ? { note } : {}) } } : { usage: USAGE };
  }
  if (act === 'mend' && rest.length >= 4 && /^r[0-9a-f]{20}$/.test(rest[0])) {
    const [id, ticket, was, gold] = rest;
    const mend = purseMendOf({ ticket, was: /^-[0-9]+$/.test(was) ? Number(was) : NaN, gold: /^[0-9]+$/.test(gold) ? Number(gold) : NaN });
    const note = rest.slice(4).join(' ');
    return mend ? { path: '/v1/mod/realm-mend', body: { id, ...mend, ...(note ? { note } : {}) } } : { usage: USAGE };
  }
  if (BY_ID.includes(act) && rest.length >= 1 && /^r[0-9a-f]{20}$/.test(rest[0])) {
    const note = rest.slice(1).join(' ');
    return { path: `/v1/mod/realm-${act}`, body: { id: rest[0], ...(note ? { note } : {}) } };
  }
  if (act === 'budget' && rest.length <= 1) {
    const days = rest.length ? Number(rest[0]) : 7;
    return Number.isSafeInteger(days) && days >= 1 && days <= 30 ? { path: '/v1/mod/realm-budget', body: { days } } : { usage: USAGE };
  }
  if ((act === 'bodies' || act === 'gains' || act === 'progress' || act === 'grants') && rest.length <= 1) {
    const days = rest.length ? Number(rest[0]) : 7;
    return Number.isSafeInteger(days) && days >= 1 && days <= 30 ? { path: `/v1/mod/realm-${act}`, body: { days } } : { usage: USAGE };
  }
  if (act === 'budget-set' && rest.length >= 1) {
    let set = null;
    try { set = JSON.parse(rest.join(' ')); } catch { set = null; }
    return set ? { path: '/v1/mod/realm-budget', body: { set } } : { usage: USAGE };
  }
  if (act === 'progress-set' && rest.length >= 1) {
    let set = null;
    try { set = JSON.parse(rest.join(' ')); } catch { set = null; }
    return set ? { path: '/v1/mod/realm-progress', body: { set } } : { usage: USAGE };
  }
  return { usage: USAGE };
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
  const req = reviewRequest(process.argv.slice(2));
  if ('usage' in req) { console.error(req.usage); process.exit(2); }
  const base = process.env.DAGGER_ACCOUNT_SERVICE || DEFAULT_ACCOUNT_SERVICE;
  let secret = process.env.DAGGER_SECRET || null;
  let opened = false;
  if (!secret) {
    const handle = process.env.DAGGER_HANDLE, password = process.env.DAGGER_PASSWORD;
    if (!handle || !password) { console.error('Sign in first: set DAGGER_HANDLE and DAGGER_PASSWORD, or DAGGER_SECRET.'); process.exit(2); }
    const signed = await post(base, '/v1/auth/login', { handle, password, label: 'tools/realmReview.mjs' });
    if (!signed.ok || typeof signed.body?.secret !== 'string') { console.error(`Sign-in refused: ${accountRefusalText(signed.body?.error)}`); process.exit(1); }
    secret = signed.body.secret;
    opened = true;
  }
  try {
    const r = await post(base, req.path, req.body, secret);
    if (!r.ok) { console.error(`Refused (${r.body?.error ?? r.status}): ${accountRefusalText(r.body?.error)}`); process.exitCode = 1; return; }
    console.log(JSON.stringify(r.body, null, 2));
    for (const line of faucetLines(r.body)) console.log(line);
  } finally {
    // Sign out only a session this call opened; a DAGGER_SECRET session stays signed in.
    if (opened) await post(base, '/v1/auth/logout', {}, secret).catch(() => {});
  }
}

if (isMain(import.meta.url)) main();
