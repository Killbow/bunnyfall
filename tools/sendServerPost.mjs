#!/usr/bin/env node
// Builds the SQL for an operator's server post send.
// Usage: node tools/sendServerPost.mjs --names|--look|--words|--sql|--migration hours-first ...
// The unique (to_id, batch) index makes a send skip an account that already holds that batch, so a rerun is safe.

import { readFileSync } from 'node:fs';
import { isMain } from './lib/isMain.mjs';
import { HANDLE_RE } from '../src/net/handleShape.js';
import { POST_BATCH_RE, POST_SENDER, POST_SUBJECT_MAX, POST_BODY_MAX } from '../src/net/postLaw.js';
import { mintHourlock } from '../src/items/gilded.js';

export const POST_ITEMS = Object.freeze({
  none: () => null,
  hourlock: () => mintHourlock(),
});
export const POST_RECIPIENTS_MAX = 200;

// HOURS_FIRST and HOURS_FIRST_RECORD stay frozen to match migration 0094, since an applied migration never reruns.
export const HOURS_FIRST = Object.freeze({
  batch: 'hours-first-hourlock',
  handles: 'aether,ArtemisGodfrey,CycleD0se,Duck,Kobakk,MackyWackyDeeJew,mayaamano,Nirnroot,ofrizz,rosalina,ShikiX3,Temegast,Terra',
  item: 'hourlock',
  subject: "Hour's First",
  body: [
    'You were among the first to break an Abyss Dungeon. The Hour remembers.',
    '',
    "Your title, Hour's First, and its aura, The First Hour, are yours to wear - choose them on your profile.",
    '',
    'The Hourlock is enclosed. Claim it and it goes into the pack of the online character you are playing.',
    '',
    `- ${POST_SENDER}`,
  ].join('\n'),
});

export const HOURS_FIRST_RECORD = "{\"group\":\"Weapons\",\"templateIndex\":560,\"material\":4,\"flags\":0,\"variant\":0,\"message\":0,\"stackCount\":1,\"name\":\"The Hourlock\",\"value\":39740,\"maxCondition\":4800,\"currentCondition\":4800,\"rarity\":\"gilded\",\"gilded\":\"the-hourlock\",\"affixes\":[{\"id\":\"damage\",\"value\":40},{\"id\":\"stat\",\"param\":\"agility\",\"value\":15},{\"id\":\"skill\",\"param\":33,\"value\":30},{\"id\":\"elemental\",\"param\":\"shock\",\"value\":10}],\"isIdentified\":true}";

export const sqlText = (/** @type {string} */ s) => `'${String(s).replaceAll("'", "''")}'`;

export function postHandles(raw) {
  const names = String(raw ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  if (!names.length || names.length > POST_RECIPIENTS_MAX) throw new Error(`not a list of names: 1 to ${POST_RECIPIENTS_MAX} handles, comma-separated`);
  for (const h of names) if (!HANDLE_RE.test(h)) throw new Error(`not a handle: ${JSON.stringify(h)}`);
  return [...new Set(names.map((h) => h.toLowerCase()))];
}

export function postBatch(raw) {
  const b = String(raw ?? '').trim();
  if (!POST_BATCH_RE.test(b)) throw new Error(`not a send's name: ${JSON.stringify(raw)} - lower-case words and hyphens, 3 to 48`);
  return b;
}

export function postWords({ subject, body }) {
  const s = String(subject ?? '').trim();
  const b = String(body ?? '').replaceAll('\\n', '\n').trim();
  if (!s || s.length > POST_SUBJECT_MAX) throw new Error(`not a subject: 1 to ${POST_SUBJECT_MAX} characters`);
  if (!b || b.length > POST_BODY_MAX) throw new Error(`not a message: 1 to ${POST_BODY_MAX} characters`);
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s + b)) throw new Error('a control character is not words');
  return { subject: s, body: b };
}

export function postItem(raw) {
  const k = String(raw ?? '').trim();
  if (!Object.hasOwn(POST_ITEMS, k)) throw new Error(`not an item: ${JSON.stringify(raw)} - one of ${Object.keys(POST_ITEMS).join(', ')}`);
  const rec = POST_ITEMS[k]();
  return rec ? JSON.stringify(rec) : null;
}

const inList = (names) => names.map(sqlText).join(', ');

export function lookSql(handles, batch) {
  const names = postHandles(handles), b = postBatch(batch);
  return `SELECT p.handle, p.handle_lc, (SELECT COUNT(*) FROM server_post s WHERE s.to_id = p.id AND s.batch = ${sqlText(b)}) AS sent FROM players p WHERE p.handle IS NOT NULL AND p.handle_lc IN (${inList(names)}) ORDER BY p.handle_lc;`;
}

/** @param {{ handles: string, batch: string, item: string, subject: string, body: string }} o */
export function sendSql({ handles, batch, item, subject, body, record = null }, { returning = true } = {}) {
  const names = postHandles(handles), b = postBatch(batch), words = postWords({ subject, body });
  const rec = record ?? postItem(item);
  return `INSERT OR IGNORE INTO server_post (id, to_id, batch, sender, subject, body, item, sent_at)
SELECT lower(hex(randomblob(12))), p.id, ${sqlText(b)}, ${sqlText(POST_SENDER)}, ${sqlText(words.subject)}, ${sqlText(words.body)}, ${rec ? sqlText(rec) : 'NULL'}, CAST(strftime('%s', 'now') AS INTEGER)
FROM players p WHERE p.handle IS NOT NULL AND p.handle_lc IN (${inList(names)})${returning ? '\nRETURNING id, to_id' : ''};`;
}

export function hoursFirstHandles(toml = readFileSync(new URL('../server-account/wrangler.toml', import.meta.url), 'utf8')) {
  const m = /^HOURS_FIRST_HANDLES = "([^"]*)"$/m.exec(toml);
  if (!m) throw new Error('server-account/wrangler.toml holds no HOURS_FIRST_HANDLES');
  return m[1];
}
export const hoursFirstSql = () => sendSql({ ...HOURS_FIRST, record: HOURS_FIRST_RECORD }, { returning: false });

function main(argv) {
  if (argv[0] === '--names' && argv.length === 2) return void process.stdout.write(`${postHandles(argv[1]).join('\n')}\n`);
  if (argv[0] === '--look' && argv.length === 3) return void process.stdout.write(`${lookSql(argv[1], argv[2])}\n`);
  if (argv[0] === '--words' && argv.length === 3) return void process.stdout.write(`${JSON.stringify(postWords({ subject: argv[1], body: argv[2] }))}\n`);
  if (argv[0] === '--sql' && argv.length === 6) return void process.stdout.write(`${sendSql({ handles: argv[1], batch: argv[2], item: argv[3], subject: argv[4], body: argv[5] })}\n`);
  if (argv[0] === '--migration' && argv[1] === 'hours-first' && argv.length === 2) return void process.stdout.write(`${hoursFirstSql()}\n`);
  throw new Error('usage: node tools/sendServerPost.mjs --names <handles> | --look <handles> <batch> | --words <subject> <message> | --sql <handles> <batch> <item> <subject> <message> | --migration hours-first');
}

if (isMain(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
}
