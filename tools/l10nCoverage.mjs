#!/usr/bin/env node
// Reports translation coverage per offered language: machine and human rows, owed and stale rows, and packs.
// Run: node tools/l10nCoverage.mjs [--json].
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStringTableCsv } from '../src/ui/textManager.js';
import { LOCALE_CATALOG } from '../src/ui/localeCatalog.js';
import { planRun } from './translate.mjs';
import { readBundledPack } from './l10nPack.mjs';
import { isMain } from './lib/isMain.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = 'Port_Strings';

const readCsv = (p) => (existsSync(p) ? new Map(parseStringTableCsv(readFileSync(p, 'utf8'))) : new Map());
const readJson = (p, fallback) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };

export function masterCounts(root = ROOT) {
  const dir = join(root, 'vendor/dfu-text');
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.csv'))) out[f.slice(0, -4)] = readCsv(join(dir, f)).size;
  return out;
}

export function languageCoverage(code, root = ROOT, { english = readCsv(join(root, 'locales/en', `${TABLE}.csv`)), masters = masterCounts(root) } = {}) {
  const dir = join(root, 'locales', code);
  const rows = readCsv(join(dir, `${TABLE}.csv`));
  const meta = readJson(join(dir, `${TABLE}.meta.json`), {});
  const plan = planRun(english, rows, meta);
  const person = plan.human.length;
  const owed = plan.draft.filter((k) => !rows.has(k)).length;
  const port = { total: english.size, have: english.size - owed, machine: english.size - owed - person, person, owed, stale: plan.stale.length };
  const pack = readBundledPack(code, root);
  const bundled = pack ? {
    name: pack.meta.name, license: pack.meta.license,
    tables: Object.fromEntries(Object.entries(pack.tables).map(([t, n]) => [t, { rows: n, of: masters[t] ?? null }])),
    quests: pack.quests, books: pack.books,
  } : null;
  return { code, port, bundled };
}

export function coverage(root = ROOT) {
  const english = readCsv(join(root, 'locales/en', `${TABLE}.csv`));
  const masters = masterCounts(root);
  return LOCALE_CATALOG.filter((l) => l.code !== 'en' && !l.hidden && existsSync(join(root, 'locales', l.code)) && statSync(join(root, 'locales', l.code)).isDirectory())
    .map((l) => ({ ...languageCoverage(l.code, root, { english, masters }), name: l.englishName, own: l.name }));
}

const pct = (n, d) => (d ? `${Math.floor((n / d) * 1000) / 10}%` : '-');

export function coverageMarkdown(report) {
  const out = ['| Language | Tag | The port\'s own words | Machine | A person\'s | Owed | Stale | Bundled pack |', '|---|---|---|---|---|---|---|---|'];
  for (const r of report) {
    const p = r.port;
    const pack = r.bundled ? `${r.bundled.name} (${r.bundled.license}): ${Object.entries(r.bundled.tables).map(([t, v]) => `${t} ${v.rows}${v.of ? `/${v.of}` : ''}`).join(', ')}${r.bundled.quests ? `, ${r.bundled.quests} quests` : ''}${r.bundled.books ? `, ${r.bundled.books} books` : ''}` : '-';
    out.push(`| ${r.name} (${r.own}) | ${r.code} | ${p.have}/${p.total} (${pct(p.have, p.total)}) | ${p.machine} | ${p.person} | ${p.owed} | ${p.stale} | ${pack} |`);
  }
  return `${out.join('\n')}\n`;
}

if (isMain(import.meta.url)) {
  const report = coverage();
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 1));
  else process.stdout.write(coverageMarkdown(report));
}
