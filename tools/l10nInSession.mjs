#!/usr/bin/env node
// Merges in-session translation drafts into locales/<lang>/Port_Strings.csv, checking placeholders and never
// replacing a row a person wrote.
// Run: node tools/l10nInSession.mjs drafts.json, or node tools/l10nInSession.mjs --owed [lang ...].
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStringTableCsv, formatStringTableCsv } from '../src/ui/textManager.js';
import { checkDraft, hash, planRun } from './translate.mjs';
import { isMain } from './lib/isMain.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const IN_SESSION = 'claude-in-session';
const TABLE = 'Port_Strings';

const catalogOf = (root) => new Map(parseStringTableCsv(readFileSync(join(root, 'locales/en', `${TABLE}.csv`), 'utf8')));
export const draftLanguages = (root = ROOT) => readdirSync(join(root, 'locales'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'en' && existsSync(join(root, 'locales', d.name, `${TABLE}.csv`))).map((d) => d.name).sort();

function readLanguage(root, code) {
  const csv = join(root, 'locales', code, `${TABLE}.csv`), metaPath = join(root, 'locales', code, `${TABLE}.meta.json`);
  const rows = new Map(existsSync(csv) ? parseStringTableCsv(readFileSync(csv, 'utf8')) : []);
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
  return { csv, metaPath, rows, meta };
}

export function owed(root = ROOT, langs = draftLanguages(root)) {
  const en = catalogOf(root);
  const out = {};
  for (const code of langs) {
    const { rows, meta } = readLanguage(root, code);
    const plan = planRun(en, rows, meta);
    out[code] = Object.fromEntries(plan.draft.map((k) => [k, en.get(k)]));
  }
  return out;
}

export function mergeDrafts(drafts, root = ROOT) {
  const en = catalogOf(root);
  const report = { written: {}, refused: [], kept: [], dropped: [], owed: {} };
  for (const [code, rowsIn] of Object.entries(drafts)) {
    if (code === 'en' || !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(code)) { report.refused.push(`${code}: not a language folder`); continue; }
    const { csv, metaPath, rows, meta } = readLanguage(root, code);
    const plan = planRun(en, rows, meta);
    const people = new Set(plan.human);
    const nextMeta = { ...plan.meta };
    let n = 0;
    for (const [key, text] of Object.entries(rowsIn ?? {})) {
      if (!en.has(key)) { report.refused.push(`${code} ${key}: not in the English catalog`); continue; }
      if (people.has(key)) { report.kept.push(`${code} ${key}`); continue; }
      const problems = checkDraft(en.get(key), text, 'icu');
      if (problems.length) { report.refused.push(`${code} ${key}: ${problems.join('; ')}`); continue; }
      rows.set(key, text);
      nextMeta[key] = { en: hash(en.get(key)), tr: hash(text), by: IN_SESSION };
      n++;
    }
    for (const key of [...rows.keys()]) if (!en.has(key)) { rows.delete(key); delete nextMeta[key]; report.dropped.push(`${code} ${key}`); }
    const ordered = [...en.keys()].filter((k) => rows.has(k)).map((k) => [k, rows.get(k)]);
    writeFileSync(csv, formatStringTableCsv(ordered));
    const metaOrdered = Object.fromEntries([...en.keys()].filter((k) => nextMeta[k]).map((k) => [k, nextMeta[k]]));
    writeFileSync(metaPath, `${JSON.stringify(metaOrdered, null, 1)}\n`);
    report.written[code] = n;
  }
  report.owed = Object.fromEntries(Object.entries(owed(root)).map(([c, o]) => [c, Object.keys(o).length]).filter(([, k]) => k));
  return report;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--owed') {
    const langs = args.slice(1).length ? args.slice(1) : draftLanguages();
    console.log(JSON.stringify(owed(ROOT, langs), null, 1));
  } else if (args[0]) {
    const r = mergeDrafts(JSON.parse(readFileSync(args[0], 'utf8')));
    for (const [c, n] of Object.entries(r.written)) console.log(`${c}: ${n} rows written`);
    for (const x of r.refused) console.error(`refused  ${x}`);
    for (const x of r.kept) console.log(`kept (a person's)  ${x}`);
    for (const x of r.dropped) console.log(`dropped (not in the catalog)  ${x}`);
    for (const [c, n] of Object.entries(r.owed)) console.error(`${c} still owes ${n}`);
    process.exit(r.refused.length || Object.keys(r.owed).length ? 1 : 0);
  } else {
    console.error('usage: node tools/l10nInSession.mjs <drafts.json> | --owed [lang ...]');
    process.exit(2);
  }
}
