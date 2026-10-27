#!/usr/bin/env node
// PLAIN-TEXT (2026-10-26; the owner: "We need a law to reduce over explanatory text + reduce the amount of ai-like
// crafted text"). Measures the three places text grows: the player's strings, code comments and the bible.
// The law is bible/Home.md's SAY IT ONCE, PLAINLY; test/tooling/plaintext.test.js enforces it.
//
//   node tools/plainText.mjs              report what breaks the law, against the baseline
//   node tools/plainText.mjs --lower      rewrite the baseline to today's counts (never raises one)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStringTableCsv } from '../src/systems/textManager.js';
import { isMain } from './lib/isMain.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE = 'tools/plainTextBaseline.json';

/** A player string's limits: words in the whole string and in its longest sentence. Longer help is a page or a fold. */
export const STRING_WORDS_MAX = 40;
export const SENTENCE_WORDS_MAX = 25;
/** Phrases that pad or sell instead of saying. Only words never needed in this game's text. */
export const PADDING = Object.freeze([
  /\bseamless(ly)?\b/i, /\bdelve\b/i, /\belevate\b/i, /\bembark\b/i, /\bunleash\b/i, /\bvibrant\b/i, /\bbustling\b/i,
  /\ba testament to\b/i, /\btapestry of\b/i, /\bin the world of\b/i, /\bdive into\b/i, /\bwhether you're\b/i,
  /\bnot (just|only|merely)\b/i, /\bsimply\b/i, /\bplease note\b/i, /\brest assured\b/i, /\bit'?s worth noting\b/i,
  /\bgame-?changer\b/i, /—/, /[\u{1F300}-\u{1FAFF}]/u,
]);
/** A comment block's most lines (a run of comment lines with no code between). */
export const COMMENT_LINES_MAX = 8;
/** A bible paragraph's most words (tables and code blocks aside). */
export const PARAGRAPH_WORDS_MAX = 150;
/** Where comments are measured. */
export const SOURCE_DIRS = Object.freeze(['src', 'server-account/src', 'server/src']);

const words = (s) => String(s).replace(/\{[^{}]*\}/g, 'X').split(/\s+/).filter(Boolean).length;

/** A player string's breaches: `{ words, sentence, padding }` with each over its limit, or null where it keeps the law. */
export function stringBreach(text) {
  const w = words(text);
  const s = Math.max(0, ...String(text).split(/(?<=[.!?])\s+/).map(words));
  const padding = PADDING.filter((re) => re.test(text)).map(String);
  if (w <= STRING_WORDS_MAX && s <= SENTENCE_WORDS_MAX && !padding.length) return null;
  return { words: w, sentence: s, padding };
}

/** How many comment blocks in `text` run past COMMENT_LINES_MAX lines. */
export function longCommentBlocks(text) {
  let run = 0, inBlock = false, n = 0;
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    let c = false;
    if (inBlock) { c = true; if (t.includes('*/')) inBlock = false; } else if (t.startsWith('//')) c = true;
    else if (t.startsWith('/*')) { c = true; if (!t.includes('*/')) inBlock = true; }
    if (c) run++;
    else { if (run > COMMENT_LINES_MAX) n++; run = 0; }
  }
  return n + (run > COMMENT_LINES_MAX ? 1 : 0);
}

/** How many paragraphs of a bible page run past PARAGRAPH_WORDS_MAX words. */
export function longParagraphs(text) {
  return String(text).split(/\n\s*\n/).filter((p) => !/^\s*(\||```)/.test(p) && words(p) > PARAGRAPH_WORDS_MAX).length;
}

const walk = (root, dir, ext, out = []) => {
  if (!existsSync(join(root, dir))) return out;
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(root, p, ext, out); else if (ext.test(e.name)) out.push(p);
  }
  return out;
};

/** Today's counts: the catalog's breaching keys and their word counts, the long comment blocks a file, the long
 *  paragraphs a page. */
export function measure(root = ROOT) {
  const rows = parseStringTableCsv(readFileSync(join(root, 'locales/en/Port_Strings.csv'), 'utf8'));
  const strings = {};
  for (const [k, v] of rows) { const b = stringBreach(v); if (b) strings[k] = b.words; }
  const comments = {};
  for (const f of SOURCE_DIRS.flatMap((d) => walk(root, d, /\.(m?js)$/))) {
    const n = longCommentBlocks(readFileSync(join(root, f), 'utf8'));
    if (n) comments[f] = n;
  }
  const bible = {};
  for (const f of walk(root, 'bible', /\.md$/)) {
    const n = longParagraphs(readFileSync(join(root, f), 'utf8'));
    if (n) bible[f] = n;
  }
  return { strings, comments, bible };
}

/** What breaks the law against `base`: a string, a file or a page past its baseline (none for one not listed), and a
 *  baseline entry that is now lower than written (the baseline only shrinks, so it is lowered in the same change). */
export function verdict(now, base) {
  const over = [], stale = [];
  for (const part of ['strings', 'comments', 'bible']) {
    const b = base[part] ?? {};
    for (const [k, n] of Object.entries(now[part])) if (n > (b[k] ?? 0)) over.push(`${part} ${k}: ${n} (allowed ${b[k] ?? 0})`);
    for (const [k, n] of Object.entries(b)) if ((now[part][k] ?? 0) < n) stale.push(`${part} ${k}: ${now[part][k] ?? 0} (baseline ${n})`);
  }
  return { over, stale };
}

if (isMain(import.meta.url)) {
  const now = measure();
  const path = join(ROOT, BASELINE);
  const base = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { strings: {}, comments: {}, bible: {} };
  if (process.argv.includes('--lower')) {
    const low = {};
    for (const part of ['strings', 'comments', 'bible']) {
      low[part] = Object.fromEntries(Object.entries(base[part] ?? {}).map(([k, n]) => [k, Math.min(n, now[part][k] ?? 0)]).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
    }
    writeFileSync(path, `${JSON.stringify(low, null, 1)}\n`);
    console.log('baseline lowered');
  } else {
    const { over, stale } = verdict(now, base);
    for (const o of over) console.log(`OVER  ${o}`);
    for (const s of stale) console.log(`LOWER ${s}`);
    if (!over.length && !stale.length) console.log('plain text: within the law');
    process.exitCode = over.length || stale.length ? 1 : 0;
  }
}
