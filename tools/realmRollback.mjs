#!/usr/bin/env node
// Rolls a realm character back to its last clean save from before its purse went below zero, via the review act.
// Run: node tools/realmRollback.mjs --handle <account> --by <developer> [--character <id>] [--run <id>] [--apply]
// [--summary <file>] [--local], where wrangler finds server-account's wrangler.toml; --local uses local D1 and R2.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviewAct } from '../server-account/src/review.js';
import { realmSaveTextOf } from '../server-account/src/realm.js';
import { wealthOf } from '../server-account/src/judge.js';
import { REALM_LETTER_TEMPLATE } from '../src/net/realmGoldLaw.js';
import { wranglerD1, wranglerR2, wranglerExec } from './lib/wranglerBindings.mjs';
import { isMain } from './lib/isMain.mjs';

export const USAGE = [
  'usage: node tools/realmRollback.mjs --handle <account> --by <developer> [--character <realm id>] [--run <run id>] [--apply] [--summary <file>] [--local]',
  '  run where wrangler finds server-account/wrangler.toml; a dry run unless --apply',
].join('\n');

export const REFUSALS = Object.freeze({
  'not-developer': "the run was asked by someone not on the developers' list (server-account/wrangler.toml DEVELOPER_HANDLES)",
  body: 'that is no account name',
  'no-player': 'no account has that name',
  'not-theirs': "the character named is not one of this account's",
  which: "more than one of this account's characters has a purse that went below nothing - name the one to roll back in `character`",
  'no-purse-finding': "no finding says a purse of this account's went below nothing - there is nothing here for this run to undo",
  'no-clean': 'no clean save is kept to go back to',
  'clean-after': 'the last clean save is from AFTER the purse first went below nothing: the purse was set at nothing since and a later save judged clean, so the save from before the sale is gone - a rollback would land after the sale and give nothing back',
  'rolled-back': 'the character was rolled back since its purse went below nothing (a staff rollback stands in its findings) - there is nothing left to undo',
  dead: 'the character is dead - a rollback never raises the dead',
  'service-moved': 'the service moved this record after its clean save (a death in the open zone, a sale from its shop, a repair) - a rollback would bring back what stands elsewhere now',
  'no-realm-character': 'the character is gone',
});

/** @param {string} toml */
export function configOf(toml) {
  const sections = toml.split(/\n(?=\[)/);
  const bound = (/** @type {string} */ head, /** @type {string} */ binding) => sections.find((s) => s.startsWith(head) && new RegExp(`^binding\\s*=\\s*"${binding}"`, 'm').test(s)) ?? '';
  const value = (/** @type {string} */ text, /** @type {string} */ key) => new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm').exec(text)?.[1] ?? null;
  return {
    database: value(bound('[[d1_databases]]', 'DB'), 'database_name'),
    bucket: value(bound('[[r2_buckets]]', 'SAVES'), 'bucket_name'),
    developers: value(sections.find((s) => s.startsWith('[vars]')) ?? '', 'DEVELOPER_HANDLES'),
  };
}

// The clean save must be older than the first 'gold' finding; otherwise a rollback lands after the bad sale.
/** @param {any} answer */
export function purseReach(answer) {
  const findings = (Array.isArray(answer?.findings) ? answer.findings : []).filter((f) => Number.isSafeInteger(f?.seq));
  const law = findings.filter((f) => f.kind === 'law');
  const codes = (/** @type {any} */ f) => (Array.isArray(f.detail?.findings) ? f.detail.findings.map((/** @type {any} */ x) => x?.code) : []);
  const purse = law.filter((f) => codes(f).includes('gold')).reduce((a, f) => (a && a.seq <= f.seq ? a : f), null);
  const clean = Number.isSafeInteger(answer?.character?.clean_seq) ? answer.character.clean_seq : null;
  const first = purse?.seq ?? null;
  const back = findings.some((f) => f.kind === 'staff' && f.detail?.act === 'rollback' && f.seq >= first);
  const why = first == null ? 'no-purse-finding' : clean == null ? 'no-clean' : clean >= first ? (back ? 'rolled-back' : 'clean-after') : null;
  return {
    ok: why == null, why, first, at: purse?.at ?? null, clean,
    between: why ? [] : law.filter((f) => f.seq > clean && f.seq < first).map((f) => ({ seq: f.seq, codes: codes(f) })).sort((a, b) => a.seq - b.seq),
  };
}

/**
 * @param {any} bucket
 * @param {unknown} key
 */
export async function saveSummary(bucket, key) {
  if (typeof key !== 'string' || !key) return null;
  let save = null;
  try { save = JSON.parse((await realmSaveTextOf(await bucket.get(key))) ?? ''); } catch { save = null; }
  if (!save || typeof save !== 'object' || Array.isArray(save)) return null;
  const gold = (/** @type {unknown} */ v) => (Number.isFinite(v) ? /** @type {number} */ (v) : 0);
  const items = Array.isArray(save.items) ? save.items : [];
  const letters = items.filter((/** @type {any} */ it) => it?.templateIndex === REALM_LETTER_TEMPLATE);
  return {
    level: save.level ?? null,
    purse: gold(save.goldPieces),
    letters: letters.length,
    lettersGold: letters.reduce((/** @type {number} */ n, /** @type {any} */ it) => n + gold(it.value), 0),
    banks: (Array.isArray(save.bankAccounts) ? save.bankAccounts : []).reduce((/** @type {number} */ n, /** @type {any} */ a) => n + gold(a?.accountGold), 0),
    pieces: items.length,
    wealth: wealthOf(save),
  };
}

export const noteFor = (/** @type {{ first: number | null }} */ reach, /** @type {string | null} */ run = null) =>
  `PURSE-BACK (TRADE-WRAP, FIELD BUGS 2026-10-18b): the purse below nothing from save ${reach.first}${run ? ` - realm-rollback.yml run ${run}` : ''}`;

/**
 * @param {any} ctx
 * @param {{ handle: string, by: string, character?: string | null, developers: string | null, run?: string | null }} o
 */
export async function rollbackPurse(ctx, { handle, by, character = null, developers, run = null }) {
  const player = { handle: by };
  const env = { DEVELOPER_HANDLES: developers };
  /** @type {any} */
  const result = { handle, by, account: null, characters: [], character: null, now: null, back: null, answer: null, refusal: null };
  const stop = (/** @type {string} */ refusal) => Object.assign(result, { refusal });
  const who = await reviewAct(ctx, player, env, 'characters', { name: handle });
  if (who.error) return stop(who.error);
  result.account = who.player;
  for (const c of who.characters) result.characters.push({ ...c, reach: purseReach(await reviewAct(ctx, player, env, 'findings', { id: c.id })) });
  const below = result.characters.filter((/** @type {any} */ c) => c.reach.first != null);
  const pick = character ? result.characters.find((/** @type {any} */ c) => c.id === character) : below.length === 1 ? below[0] : null;
  if (!pick) return stop(character ? 'not-theirs' : below.length ? 'which' : 'no-purse-finding');
  result.character = pick;
  if (!pick.reach.ok) return stop(pick.reach.why);
  const row = await ctx.db.prepare('SELECT obj, clean_obj FROM realm_characters WHERE id = ?').bind(pick.id).first();
  result.now = await saveSummary(ctx.bucket, row?.obj);
  result.back = await saveSummary(ctx.bucket, row?.clean_obj);
  result.answer = await reviewAct(ctx, player, env, 'rollback', { id: pick.id, note: noteFor(pick.reach, run) });
  return result.answer.error ? stop(result.answer.error) : result;
}

export const readBackOk = (/** @type {any} */ r) => !!r.after && r.after.seq >= r.answer?.seq && r.after.held == null;

const n = (/** @type {number} */ v) => v.toLocaleString('en-US');
const when = (/** @type {number | null} */ s) => (s == null ? '' : ` (${new Date(s * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC)`);
const heldKind = (/** @type {string} */ h) => /^(UPDATE \w+|INSERT INTO \w+|DELETE FROM \w+|INSERT OR \w+ INTO \w+|r2 object delete)/.exec(h)?.[1] ?? 'a write';

/**
 * @param {any} r
 * @param {{ apply: boolean, held?: string[] }} o
 */
export function rollbackReport(r, { apply, held = [] }) {
  const out = [`## Realm rollback (a purse below nothing): ${r.handle}`, ''];
  out.push(`Asked by **${r.by}**. ${apply ? 'Apply: on.' : 'A dry run: nothing is written.'}`, '');
  if (r.characters.length) {
    out.push('| Character | Realm id | Purse below nothing from save | Last clean save | Playing | Held | Dead |', '|---|---|---|---|---|---|---|');
    for (const c of r.characters) out.push(`| ${c.name ?? '?'} | ${c.id} | ${c.reach.first ?? '-'}${when(c.reach.at)} | ${c.reach.clean ?? '-'} | ${c.playing ? 'yes' : 'no'} | ${c.held ?? '-'} | ${c.dead ? 'yes' : 'no'} |`);
    out.push('');
  }
  const c = r.character;
  if (c && r.now && r.back) {
    out.push(`**${c.name ?? c.id}** goes back to save ${c.reach.clean}, its last clean one - from before its purse went below nothing at save ${c.reach.first}.`, '');
    out.push('| | Purse | Letters of credit | Banks | Pieces carried | Wealth |', '|---|---|---|---|---|---|');
    for (const [label, s] of [['Now', r.now], ['Back', r.back]]) out.push(`| ${label} | ${n(s.purse)} | ${s.letters} (${n(s.lettersGold)} gold) | ${n(s.banks)} | ${s.pieces} | ${n(s.wealth)} |`);
    out.push('');
    if (c.reach.between.length) out.push(`Also undone, the saves the law held for something else between them: ${c.reach.between.map((/** @type {any} */ b) => `save ${b.seq} (${b.codes.join(', ')})`).join('; ')}.`, '');
  }
  if (r.refusal) {
    out.push(`**Refused - ${r.refusal}.** ${REFUSALS[r.refusal] ?? 'the review answered so'}. Nothing was written.`);
  } else if (!apply) {
    const kinds = new Map();
    for (const h of held) kinds.set(heldKind(h), (kinds.get(heldKind(h)) ?? 0) + 1);
    out.push(`**The review's rollback answers yes.** Run again with apply on to write it - ${[...kinds].map(([k, v]) => `${v} ${k}`).join(', ')}.`);
  } else {
    const a = r.after;
    out.push(`**Rolled back.** ${c.name ?? c.id} is save ${c.reach.clean} again, at sequence ${r.answer.seq} - its hold lifted and its seat taken from any tab, so its next join plays it. What was played after save ${c.reach.clean} is undone.`);
    out.push('', readBackOk(r) ? `Read back: sequence ${a.seq}, held by nothing.` : `**Read back wrong** - sequence ${a?.seq ?? 'none'}, held ${a?.held ?? 'by nothing'}: look at the record (tools/realmReview.mjs findings ${c.id}).`);
  }
  return out.join('\n') + '\n';
}

async function main() {
  const arg = (/** @type {string} */ name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] ?? null : null; };
  const handle = arg('handle'), by = arg('by');
  if (!handle || !by) { console.error(USAGE); process.exit(2); }
  const apply = process.argv.includes('--apply');
  const where = process.argv.includes('--local') ? 'local' : 'remote';
  const summary = arg('summary');
  const config = configOf(readFileSync('wrangler.toml', 'utf8'));
  if (!config.database || !config.bucket) { console.error('the wrangler.toml here binds no DB and no SAVES - run this in server-account'); process.exit(2); }
  const say = (/** @type {string} */ text) => { process.stdout.write(text); if (summary) writeFileSync(summary, text); };
  const exec = wranglerExec();
  /** @type {string[]} */
  const held = [];
  const dir = mkdtempSync(join(tmpdir(), 'realm-rollback-'));
  try {
    // A dry run is the same review act with every write held, so it reports the same refusals an apply would.
    const db = wranglerD1({ database: config.database, exec, where, dry: !apply, held });
    const ctx = { db, bucket: wranglerR2({ bucket: config.bucket, exec, dir, where, dry: !apply, held }), nowS: Math.floor(Date.now() / 1000) };
    const result = await rollbackPurse(ctx, { handle, by, character: arg('character') || null, developers: config.developers, run: arg('run') || null });
    // The run page is public, so the account id is masked in the log.
    if (process.env.GITHUB_ACTIONS && result.account?.id) process.stdout.write(`::add-mask::${result.account.id}\n`);
    if (apply && !result.refusal) result.after = await db.prepare('SELECT seq, held FROM realm_characters WHERE id = ?').bind(result.character.id).first();
    say(rollbackReport(result, { apply, held }));
    process.exitCode = result.refusal || (apply && !readBackOk(result)) ? 1 : 0;
  } catch (e) {
    say(`## Realm rollback (a purse below nothing): ${handle}\n\n**Failed** - ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) main();
