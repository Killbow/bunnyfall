#!/usr/bin/env node
// BUNNYFALL TEST-QUICK: the check before a push, in a few minutes on a 2-core box. What counts here is the NUMBER of test
// files, not their recorded times: each file loads a large part of the game at start, about ten seconds apiece. So a
// test file runs only when
//   - it changed itself (a new test, a test you edited), or
//   - it is named after a changed module, its name starting with the module's (contentOff.test.js, legacyhost1.test.js), or
//   - it is a standing rule: the host ceilings always, the licence check when public/ or src/assets/ changed.
// Everything else waits for a deliberate wider run (`npm run test:changed`), which is slow here.
//
//   npm run test:quick                       # run them
//   node tools/testQuick.mjs --list          # print them
//   node tools/testQuick.mjs --base HEAD~3   # changed since another point
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './lib/isMain.mjs';
import { changedFiles } from './testChanged.mjs';
import { testFiles, runTests, runnerFlags } from './testShards.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Always run: the hosts do not grow. */
export const RULES = Object.freeze(['test/scenes/hostceiling.test.js']);
/** Run when what ships under public/ or src/assets/ changed: nothing unlicensed ships. */
export const LICENCE_RULE = 'test/tooling/doctrine.test.js';

const stem = (f) => f.split('/').pop().replace(/(\.test)?\.m?js$/, '').toLowerCase();

/** The test files among `tests` that a change to `changed` calls for. */
export function quickTestsFor(changed, tests, root = ROOT) {
  const chosen = new Set(RULES.filter((f) => existsSync(join(root, f))));
  if (changed.some((f) => /^(public|src\/assets)\//.test(f))) chosen.add(LICENCE_RULE);
  const set = new Set(changed);
  const modules = new Set(changed.filter((f) => /^(src|server|server-account)\/.*\.m?js$/.test(f)).map(stem));
  // named after it: the test's name starts with the module's (gatelaw.test.js, gatelaw_days.test.js, legacyhost1.test.js)
  for (const t of tests) if (set.has(t) || [...modules].some((m) => stem(t).startsWith(m))) chosen.add(t);
  return [...chosen].sort();
}

function main(argv) {
  const at = argv.indexOf('--base');
  const changed = changedFiles(at >= 0 ? argv[at + 1] : null);
  const files = quickTestsFor(changed, testFiles());
  if (argv.includes('--list')) { for (const f of files) console.log(f); return 0; }
  console.log(`${changed.length} changed files -> ${files.length} test files (changed, named after a changed module, the rules)`);
  return runTests(files, { extra: runnerFlags(argv) });
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
