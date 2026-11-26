#!/usr/bin/env node
// Builds the SQL questions that read the account service's Analytics Engine load points, and draws the answers.
// Counts and sums are weighted by _sample_interval, since Analytics Engine samples under load.
// Run: node tools/d1Load.mjs --sql <name> [hours] | --names | --table <name> <file>.

import { readFileSync } from 'node:fs';
import { isMain } from './lib/isMain.mjs';

export const DATASET = 'daggerfall_accounts';
export const HOURS_MAX = 168;

export function loadHours(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return 1;
  const h = /^[0-9]{1,3}$/.test(s) ? Number(s) : NaN;
  if (!Number.isSafeInteger(h) || h < 1 || h > HOURS_MAX) throw new Error(`not a window: ${JSON.stringify(raw)} - whole hours, 1 to ${HOURS_MAX}`);
  return h;
}

export const since = (h) => `timestamp > NOW() - INTERVAL '${loadHours(h)}' HOUR`;
const W = {
  n: 'SUM(_sample_interval)',
  waitS: 'SUM(double5 * _sample_interval) / 1000',
  stmts: 'SUM(double3 * _sample_interval)',
  read: 'SUM(double6 * _sample_interval)',
  written: 'SUM(double4 * _sample_interval)',
  players: 'SUM(double8 * _sample_interval)',
  sessions: 'SUM(double9 * _sample_interval)',
  renown: 'SUM(double10 * _sample_interval)',
  realm: 'SUM(double11 * _sample_interval)',
};

export const QUESTIONS = Object.freeze([
  ['routes', 'D1 wait by route (the database\'s time, most first)', ['route', 'method', 'requests', 'd1_wait_s', 'statements', 'rows_read', 'rows_written', 'p95_ms'],
    (h) => `SELECT blob1 AS route, blob2 AS method, ${W.n} AS requests, ${W.waitS} AS d1_wait_s, ${W.stmts} AS statements, ${W.read} AS rows_read, ${W.written} AS rows_written, quantileWeighted(0.95)(double1, _sample_interval) AS p95_ms FROM ${DATASET} WHERE ${since(h)} GROUP BY route, method ORDER BY d1_wait_s DESC LIMIT 40`],
  ['minutes', 'Minute by minute', ['minute', 'requests', 'd1_wait_s', 'statements', 'rows_written'],
    (h) => `SELECT toStartOfInterval(timestamp, INTERVAL '1' MINUTE) AS minute, ${W.n} AS requests, ${W.waitS} AS d1_wait_s, ${W.stmts} AS statements, ${W.written} AS rows_written FROM ${DATASET} WHERE ${since(h)} GROUP BY minute ORDER BY minute DESC LIMIT 180`],
  ['cron', 'The clock\'s jobs', ['job', 'firings', 'failed', 'd1_wait_s', 'statements', 'changed', 'p95_ms'],
    (h) => `SELECT blob1 AS job, ${W.n} AS firings, SUM(IF(blob3 = '200', 0, 1) * _sample_interval) AS failed, ${W.waitS} AS d1_wait_s, ${W.stmts} AS statements, ${W.written} AS changed, quantileWeighted(0.95)(double1, _sample_interval) AS p95_ms FROM ${DATASET} WHERE ${since(h)} AND blob2 = 'CRON' GROUP BY job ORDER BY d1_wait_s DESC`],
  ['errors', 'Answers that were not 2xx', ['route', 'status', 'word', 'requests'],
    (h) => `SELECT blob1 AS route, blob3 AS status, blob4 AS word, ${W.n} AS requests FROM ${DATASET} WHERE ${since(h)} AND NOT startsWith(blob3, '2') GROUP BY route, status, word ORDER BY requests DESC LIMIT 40`],
  ['written', 'D1 rows written by route and tables (most first)', ['route', 'tables', 'requests', 'rows_written', 'players', 'sessions', 'renown_tracks', 'realm_characters'],
    (h) => `SELECT blob1 AS route, blob5 AS tables, ${W.n} AS requests, ${W.written} AS rows_written, ${W.players} AS players, ${W.sessions} AS sessions, ${W.renown} AS renown_tracks, ${W.realm} AS realm_characters FROM ${DATASET} WHERE ${since(h)} AND double4 > 0 GROUP BY route, tables ORDER BY rows_written DESC LIMIT 40`],
]);

export function questionBook(questions) {
  const questionOf = (name) => {
    const q = questions.find(([n]) => n === name);
    if (!q) throw new Error(`no question ${JSON.stringify(name)} - one of ${questions.map(([n]) => n).join(', ')}`);
    return q;
  };
  return {
    names: () => questions.map(([n]) => n),
    loadSql: (name, hours) => `${questionOf(name)[3](hours)} FORMAT JSON`,
    loadTable: (name, answer) => { const [, title, cols] = questionOf(name); return answerTable(name, title, cols, answer); },
  };
}
const book = questionBook(QUESTIONS);
export const loadSql = book.loadSql;

const cell = (v) => {
  if (v == null) return '';
  const n = typeof v === 'number' ? v : (/^-?\d+(\.\d+)?$/.test(String(v)) ? Number(v) : null);
  if (n == null) return String(v).replace(/\|/g, '\\|');
  return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 1 });
};
/**
 * @param {string} name
 * @param {any} answer
 */
export function loadTable(name, answer) {
  return book.loadTable(name, answer);
}
export function answerTable(name, title, cols, answer) {
  const rows = answer?.data;
  if (!Array.isArray(rows)) throw new Error(`${name}: the answer carries no rows - ${JSON.stringify(answer).slice(0, 300)}`);
  const head = `**${title}**\n\n`;
  if (!rows.length) return `${head}No points in the window.\n`;
  return `${head}| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n${rows.map((r) => `| ${cols.map((c) => cell(r[c])).join(' | ')} |`).join('\n')}\n`;
}

export function runBook(b, tool, argv = process.argv.slice(2)) {
  const [flag, x, y] = argv;
  if (flag === '--names') console.log(b.names().join('\n'));
  else if (flag === '--sql') console.log(b.loadSql(x, y));
  else if (flag === '--table') process.stdout.write(b.loadTable(x, JSON.parse(readFileSync(y, 'utf8'))));
  else if (flag === '--hours') console.log(loadHours(x));
  else { console.error(`usage: ${tool} --names | --sql <name> [hours] | --table <name> <answer.json> | --hours [hours]`); process.exit(2); }
}

if (isMain(import.meta.url)) runBook(book, 'd1Load.mjs');
