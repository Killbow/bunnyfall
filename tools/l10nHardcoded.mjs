#!/usr/bin/env node
// Counts prose string literals in src/ that do not go through the text core, file by file.
// Run: node tools/l10nHardcoded.mjs [<file>].
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { isMain } from './lib/isMain.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ROUTED = new Set(['t', 'tIn', 'localizedText', 'localizedTextList', 'localizedStrings', 'localizedTable', 'formatText',
  'getLocalizedText', 'getLocalizedTextWithReversion', 'getLocalizedTextList', 'databaseText', 'gameSettingsText']);
const SKIP = [/^src\/ui\/textManager\.js$/, /^src\/systems\/grammar\//];

const walk = (d, out = []) => {
  for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p); }
  return out;
};

const CSS_IDENT = String.raw`-?[A-Za-z_][\w-]*`;
const COMPOUND_SELECTOR = new RegExp(String.raw`^(?:[a-z][\w-]*|\*)?(?:[.#]${CSS_IDENT}|\[${CSS_IDENT}(?:[~|^$*]?=(?:"[^"]*"|'[^']*'|[\w-]+))?\]|::?${CSS_IDENT}(?:\([^()\s]*\))?)*$`);
const HAS_CLASS = new RegExp(String.raw`\.${CSS_IDENT}`);
export function isProse(s) {
  if (!/[A-Za-z]{2,}[\s\u00a0]+[A-Za-z]{2,}/.test(s)) return false;
  if (/(^|\s)(px|em|rem|vh|vw)(\s|;|$)|\d(px|em|rem|vh|vw|ms|deg)\b|rgba?\(|hsla?\(|var\(--|calc\(|linear-gradient|;\s*$|=>|\bfunction\b|\bimport\b|\bconst\b|\breturn\b|https?:|\.(js|mjs|json|png|wav|ttf|glb|bsa|img|cif)\b/i.test(s)) return false;
  if (/^[a-z]+(-[a-z0-9]+)+( [a-z]+(-[a-z0-9]+)*)*$/.test(s)) return false;
  const english = /\s(a|an|the|of|to|is|in|on|and|or|you|your)\s/i.test(` ${s} `);
  if (/^[\w$.-]+( [\w$.-]+)*$/.test(s) && !/[A-Z]/.test(s[0]) && !english) return false;
  // A literal is a selector only when every part is a CSS compound and one has a class, so "press [E]" is prose.
  if (/[#[:]/.test(s) && !english) {
    const parts = s.trim().split(/\s*[,>+~]\s*|\s+/);
    if (parts.every((p) => p && COMPOUND_SELECTOR.test(p)) && parts.some((p) => HAS_CLASS.test(p))) return false;
  }
  return true;
}

export function hardcodedStrings(root = ROOT) {
  const out = [];
  for (const path of walk(join(root, 'src'))) {
    const file = relative(root, path).split('\\').join('/');
    if (SKIP.some((re) => re.test(file))) continue;
    const text = readFileSync(path, 'utf8');
    let ast;
    try { ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); } catch { continue; }
    const routedNames = new Set();
    (function find(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression' && n.callee?.type === 'Identifier' && ROUTED.has(n.callee.name)) {
        for (const a of n.arguments) if (a?.type === 'Identifier') routedNames.add(a.name);
      }
      for (const k of Object.keys(n)) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(find); else if (v && typeof v.type === 'string') find(v); }
    })(ast);
    const routedInits = new Set();
    for (const node of ast.body) {
      const decl = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
      if (decl?.type !== 'VariableDeclaration') continue;
      for (const d of decl.declarations) if (d.id?.type === 'Identifier' && routedNames.has(d.id.name) && d.init) routedInits.add(d.init);
    }
    const visit = (n, quiet) => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration' || n.type === 'ExportNamedDeclaration' && n.source) return;
      let q = quiet || routedInits.has(n);
      if (n.type === 'CallExpression') {
        const c = n.callee;
        if (c?.type === 'Identifier' && ROUTED.has(c.name)) q = true;
        if (c?.type === 'MemberExpression' && c.object?.name === 'console') q = true;
      }
      if (n.type === 'ThrowStatement' || (n.type === 'NewExpression' && /Error$/.test(n.callee?.name ?? ''))) q = true;
      if (!q) {
        if (n.type === 'Literal' && typeof n.value === 'string' && isProse(n.value)) out.push({ file, line: n.loc.start.line, text: n.value });
        if (n.type === 'TemplateLiteral') {
          const s = n.quasis.map((x) => x.value.cooked ?? '').join(' {} ');
          if (isProse(s)) out.push({ file, line: n.loc.start.line, text: s });
        }
      }
      for (const k of Object.keys(n)) {
        if (k === 'loc') continue;
        if (k === 'key' && (n.type === 'Property' || n.type === 'MethodDefinition' || n.type === 'PropertyDefinition') && !n.computed) continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach((x) => visit(x, q)); else if (v && typeof v.type === 'string') visit(v, q);
      }
    };
    visit(ast, false);
  }
  return out;
}

export function hardcodedCounts(root = ROOT) {
  const counts = {};
  for (const s of hardcodedStrings(root)) counts[s.file] = (counts[s.file] ?? 0) + 1;
  return counts;
}

if (isMain(import.meta.url)) {
  const only = process.argv[2];
  if (only) {
    for (const s of hardcodedStrings().filter((x) => x.file === only)) console.log(`${s.line}\t${JSON.stringify(s.text).slice(0, 160)}`);
  } else {
    const counts = hardcodedCounts();
    console.log('const HARDCODED = {');
    for (const f of Object.keys(counts).sort()) console.log(`  '${f}': ${counts[f]},`);
    console.log('};');
    console.log(`${Object.values(counts).reduce((a, b) => a + b, 0)} hard-coded prose literals in ${Object.keys(counts).length} files`);
  }
}
