#!/usr/bin/env node
// PLAIN-TEXT (2026-10-26; the owner: "We need a law to reduce over explanatory text + reduce the amount of ai-like
// crafted text"). Measures the three places text grows: the player's strings, code comments and the bible.
// The law is bible/Home.md's SAY IT ONCE, PLAINLY; test/tooling/plaintext.test.js enforces it.
//
//   node tools/plainText.mjs              report what breaks the law, against the baseline
//   node tools/plainText.mjs --lower      rewrite the baseline to today's counts (never raises one)
//   node tools/plainText.mjs --seed REF   at a merge from a base without the law: admit REF's own counts, no more
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

/** The tree on disk, as measure() reads it. */
const diskTree = (root) => ({ list: (dir, ext) => walk(root, dir, ext), read: (f) => readFileSync(join(root, f), 'utf8') });
/** The tree at a git ref, read in one `git cat-file --batch`. */
export function gitTree(ref, root = ROOT) {
  const git = (args, input) => execFileSync('git', args, { cwd: root, input, maxBuffer: 1 << 30 });
  const paths = String(git(['ls-tree', '-r', '--name-only', ref, '--', ...SOURCE_DIRS, 'bible', 'locales/en'])).split('\n').filter(Boolean);
  const out = git(['cat-file', '--batch'], paths.map((p) => `${ref}:${p}`).join('\n'));
  const files = new Map();
  let at = 0;
  for (const p of paths) {
    const nl = out.indexOf(10, at);
    const size = Number(String(out.subarray(at, nl)).split(' ')[2]);
    files.set(p, out.subarray(nl + 1, nl + 1 + size).toString('utf8'));
    at = nl + 1 + size + 1;
  }
  return { list: (dir, ext) => paths.filter((p) => p.startsWith(`${dir}/`) && ext.test(p)), read: (f) => files.get(f) ?? '' };
}

/** Today's counts: the catalog's breaching keys and their word counts, the long comment blocks a file, the long
 *  paragraphs a page. `tree` the files read (the disk's, or gitTree's). */
export function measure(root = ROOT, tree = diskTree(root)) {
  const rows = parseStringTableCsv(tree.read('locales/en/Port_Strings.csv'));
  const strings = {};
  for (const [k, v] of rows) { const b = stringBreach(v); if (b) strings[k] = b.words; }
  const comments = {};
  for (const f of SOURCE_DIRS.flatMap((d) => tree.list(d, /\.(m?js)$/))) {
    const n = longCommentBlocks(tree.read(f));
    if (n) comments[f] = n;
  }
  const bible = {};
  for (const f of tree.list('bible', /\.md$/)) {
    const n = longParagraphs(tree.read(f));
    if (n) bible[f] = n;
  }
  return { strings, comments, bible };
}

/** A merge from a base that does not hold the law yet: each count past the baseline is admitted up to the base's own
 *  count for it, never past it - what the base wrote before the law stands, what this branch adds does not. */
export function seeded(base, now, at) {
  const out = {};
  for (const part of ['strings', 'comments', 'bible']) {
    out[part] = { ...(base[part] ?? {}) };
    for (const [k, n] of Object.entries(now[part])) {
      const allow = Math.min(n, at[part]?.[k] ?? 0);
      if (allow > (out[part][k] ?? 0)) out[part][k] = allow;
    }
  }
  return out;
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
  const seedAt = process.argv.indexOf('--seed');
  if (seedAt > 0) {
    const seed = seeded(base, now, measure(ROOT, gitTree(process.argv[seedAt + 1])));
    for (const part of ['strings', 'comments', 'bible']) {
      for (const [k, n] of Object.entries(seed[part])) if (n !== (base[part]?.[k] ?? 0)) console.log(`SEED  ${part} ${k}: ${base[part]?.[k] ?? 0} -> ${n}`);
      seed[part] = Object.fromEntries(Object.entries(seed[part]).sort(([a], [b]) => a.localeCompare(b)));
    }
    writeFileSync(path, `${JSON.stringify(seed, null, 1)}\n`);
  } else if (process.argv.includes('--lower')) {
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
