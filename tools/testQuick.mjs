#!/usr/bin/env node
// BUNNYFALL TEST-QUICK: the check before a push, in minutes. A test file runs when
//   - it changed itself, or
//   - it imports a changed module DIRECTLY (one step, not the whole import tree: world.js reaches almost every module,
//     so the tree picks nearly the whole suite) - but for a HUB, a module more than HUB test files import (uiPrefs,
//     inputActions, professionLaw), only the tests named after it, or
//   - it is one of RULES, the project's standing rules (the hosts do not grow, nothing unlicensed ships).
// A test that only names a changed file in its text is NOT chosen: those are word-for-word pins on the source, and
// they are being retired (see CLAUDE.md). `npm run test:changed` still runs the wide selection when you want it.
//
//   npm run test:quick                       # run them
//   node tools/testQuick.mjs --list          # print them
//   node tools/testQuick.mjs --base HEAD~3   # changed since another point
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './lib/isMain.mjs';
import { importsOf, changedFiles } from './testChanged.mjs';
import { testFiles, runTests, runnerFlags } from './testShards.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A module imported by more test files than this is a hub: only its own tests run for it. */
export const HUB = 60;
const stem = (f) => f.split('/').pop().replace(/\.m?js$/, '').toLowerCase();

/** The standing rules: always run. */
export const RULES = Object.freeze(['test/scenes/hostceiling.test.js', 'test/tooling/doctrine.test.js']);

/** The test files among `tests` that a change to `changed` reaches in one import step, the changed tests, and RULES. */
export function quickTestsFor(changed, tests, root = ROOT) {
  const set = new Set(changed);
  const chosen = new Set(RULES.filter((f) => existsSync(join(root, f))));
  const importers = new Map();   // changed module -> the tests that import it directly
  for (const t of tests) {
    if (set.has(t)) { chosen.add(t); continue; }
    let text = '';
    try { text = readFileSync(join(root, t), 'utf8'); } catch { continue; }
    for (const d of importsOf(t, text, root)) if (set.has(d)) importers.set(d, [...(importers.get(d) ?? []), t]);
  }
  for (const [mod, ts] of importers) {
    const own = ts.length > HUB ? ts.filter((t) => stem(t).includes(stem(mod))) : ts;
    for (const t of own) chosen.add(t);
  }
  return [...chosen].sort();
}

function main(argv) {
  const at = argv.indexOf('--base');
  const changed = changedFiles(at >= 0 ? argv[at + 1] : null);
  const files = quickTestsFor(changed, testFiles());
  if (argv.includes('--list')) { for (const f of files) console.log(f); return 0; }
  console.log(`${changed.length} changed files -> ${files.length} test files (direct imports and the standing rules)`);
  return runTests(files, { extra: runnerFlags(argv) });
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
