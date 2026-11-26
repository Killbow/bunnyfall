#!/usr/bin/env node
// Writes locales/en/Port_Strings.csv from every t() and tIn() call in src/, refusing what a table cannot hold.
// Run: node tools/l10nExtract.mjs [--check] (--check exits 1 when the file on disk is stale).
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, sep, relative as nativeRelative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { parseMessage, parseStringTableCsv, formatStringTableCsv } from '../src/ui/textManager.js';
import { isMain } from './lib/isMain.mjs';

const relative = (from, to) => nativeRelative(from, to).split(sep).join('/');
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CATALOG_PATH = 'locales/en/Port_Strings.csv';
export const PORT_KEY = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/;

function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (Array.isArray(v)) for (const c of v) walk(c, visit);
    else if (v && typeof v.type === 'string') walk(v, visit);
  }
}

export function literalText(n, consts = null) {
  if (!n) return null;
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral' && n.expressions.length === 0) return n.quasis[0].value.cooked;
  if (n.type === 'BinaryExpression' && n.operator === '+') {
    const a = literalText(n.left, consts), b = literalText(n.right, consts);
    return a === null || b === null ? null : a + b;
  }
  if (n.type === 'Identifier' && consts?.has(n.name)) return consts.get(n.name);
  return null;
}

export function moduleConsts(ast) {
  const out = new Map();
  for (const node of ast.body) {
    const decl = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    if (decl?.type !== 'VariableDeclaration' || decl.kind !== 'const') continue;
    for (const d of decl.declarations) {
      if (d.id?.type !== 'Identifier') continue;
      const words = literalText(d.init, out);
      if (words !== null) out.set(d.id.name, words);
    }
  }
  return out;
}

export function keyPrefixes(n) {
  if (n?.type === 'TemplateLiteral') return n.quasis[0].value.cooked ? [n.quasis[0].value.cooked] : [];
  if (n?.type === 'BinaryExpression' && n.operator === '+') return keyPrefixes(n.left);
  if (n?.type === 'ConditionalExpression') { const x = [...keyPrefixes(n.consequent), ...keyPrefixes(n.alternate)]; return x.length === 2 ? x : []; }
  return n?.type === 'Literal' && typeof n.value === 'string' && n.value ? [n.value] : [];
}

export function extractPortStrings(root = ROOT) {
  const strings = new Map();
  const problems = [];
  const skipped = [];
  const prefixes = new Set();
  const unbounded = [];
  for (const file of walkFiles(join(root, 'src'))) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('textManager.js')) continue;
    let ast;
    try { ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); } catch (err) {
      problems.push(`${relative(root, file)}: does not parse (${err.message})`);
      continue;
    }
    const names = new Map();
    for (const node of ast.body) {
      if (node.type !== 'ImportDeclaration' || !/textManager\.js$/.test(node.source.value)) continue;
      for (const sp of node.specifiers) if (sp.type === 'ImportSpecifier' && (sp.imported.name === 't' || sp.imported.name === 'tIn')) names.set(sp.local.name, sp.imported.name);
    }
    if (!names.size) continue;
    const consts = moduleConsts(ast);
    walk(ast, (node) => {
      if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier' || !names.has(node.callee.name)) return;
      const at = `${relative(root, file)}:${node.loc.start.line}`;
      const [keyArg, enArg] = names.get(node.callee.name) === 'tIn' ? node.arguments.slice(1) : node.arguments;
      const key = literalText(keyArg), en = literalText(enArg, consts);
      if (key === null) {
        skipped.push(`${at}: the key is not a literal`);
        const starts = keyPrefixes(keyArg);
        for (const x of starts) prefixes.add(x);
        if (!starts.length) unbounded.push(at);
        return;
      }
      if (!PORT_KEY.test(key)) { problems.push(`${at}: '${key}' is not a dotted key`); return; }
      if (en === null) { problems.push(`${at}: '${key}' has no literal English`); return; }
      try { parseMessage(en); } catch (err) { problems.push(`${at}: '${key}' ${err.message}`); return; }
      const prev = strings.get(key);
      if (prev && prev.en !== en) { problems.push(`${at}: '${key}' is '${en}' here and '${prev.en}' at ${prev.at}`); return; }
      if (!prev) strings.set(key, { en, at });
    });
  }
  return { strings, problems, skipped, prefixes, unbounded };
}

export function catalogCsv(strings, kept = []) {
  const rows = new Map(kept);
  for (const [k, v] of strings) rows.set(k, v.en);
  return formatStringTableCsv([...rows.keys()].sort().map((k) => [k, rows.get(k)]));
}

export function keptRows(onDisk, strings, prefixes) {
  if (!onDisk) return [];
  return [...parseStringTableCsv(onDisk)].filter(([k]) => !strings.has(k) && [...prefixes].some((p) => k.startsWith(p)));
}

if (isMain(import.meta.url)) {
  const { strings, problems, skipped, prefixes, unbounded } = extractPortStrings();
  for (const w of skipped) console.warn(`skipped ${w}`);
  if (problems.length) { for (const p of problems) console.error(p); process.exit(1); }
  if (unbounded.length) { console.error(`no row can be told from these calls, so none is written: ${unbounded.join(', ')}`); process.exit(1); }
  const path = join(ROOT, CATALOG_PATH);
  let existing = '';
  try { existing = readFileSync(path, 'utf8'); } catch { /* a first catalog has no rows to keep */ }
  const csv = catalogCsv(strings, keptRows(existing, strings, prefixes));
  if (process.argv.includes('--check')) {
    let onDisk = '';
    try { onDisk = readFileSync(path, 'utf8'); } catch { }
    if (onDisk !== csv) { console.error(`${CATALOG_PATH} is not what the source says - run node tools/l10nExtract.mjs`); process.exit(1); }
    console.log(`${CATALOG_PATH}: ${strings.size} strings, in step with the source`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, csv);
    console.log(`${CATALOG_PATH}: ${strings.size} strings`);
  }
}
