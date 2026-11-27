// Polls the live site until it serves this commit's build: the same entry chunk, or a build tag descended from it.
// Usage: npm run build && node tools/verify-deploy.mjs [url]

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { isMain } from './lib/isMain.mjs';

export function entryBundle(html) {
  return String(html ?? '').match(/<script[^>]+src="(?:\.{0,2}\/)?(assets\/[\w.-]+\.js)"/)?.[1] ?? null;
}

export { buildTagOf } from '../src/net/updateNotice.js';
import { buildTagOf } from '../src/net/updateNotice.js';

export function deployVerdict({ localHtml, liveHtml, contains = () => null }) {
  const bundle = entryBundle(localHtml);
  if (!bundle) return { kind: 'nolocal', message: 'no entry script ref in local dist/play/index.html' };
  if (String(liveHtml ?? '').includes(bundle)) {
    return { kind: 'exact', bundle, message: `serves ${bundle}` };
  }
  const theirs = entryBundle(liveHtml);
  const localTag = buildTagOf(localHtml);
  const liveTag = buildTagOf(liveHtml);
  if (!localTag || !liveTag) {
    return { kind: 'wait', bundle, theirs, message: `live serves ${theirs ?? '(no bundle / not up yet)'}` };
  }
  // Build tags compare by prefix, since older pages carry a different hash length.
  if (localTag.startsWith(liveTag) || liveTag.startsWith(localTag)) {
    return {
      kind: 'dirty', bundle, theirs, localTag, liveTag,
      message: `live is your commit ${liveTag} but serves ${theirs} - rebuild from a clean tree`,
    };
  }
  const ancestor = contains(localTag, liveTag);
  if (ancestor === true) {
    return {
      kind: 'ancestor', bundle, theirs, localTag, liveTag,
      message: `serves ${theirs} from ${liveTag}, which contains ${localTag}`,
    };
  }
  return {
    kind: 'wait', bundle, theirs, localTag, liveTag,
    message: `live serves ${theirs ?? '(no bundle)'} from ${liveTag} - waiting...`,
  };
}

export function gitContains(a, d) {
  // Git exits 1 when the commit is not an ancestor; any other status (128 for an unknown commit) means it cannot tell.
  const ask = () => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', a, d], { stdio: 'ignore' });
      return true;
    } catch (e) { return e.status === 1 ? false : null; }
  };
  let out = ask();
  if (out === null) {
    try { execFileSync('git', ['fetch', 'origin', 'main'], { stdio: 'ignore' }); } catch { }
    out = ask();
  }
  return out;
}

async function main() {
  const url = process.argv[2] || 'https://daggerfalljs.dev/play/';
  const localHtml = await readFile('dist/play/index.html', 'utf8');
  const bundle = entryBundle(localHtml);
  if (!bundle) { console.error('no entry script ref in local dist/play/index.html'); process.exit(1); }
  console.log('local bundle:', bundle, buildTagOf(localHtml) ? `(${buildTagOf(localHtml)})` : '(unstamped)');

  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    let liveHtml = null;
    try {
      liveHtml = await (await fetch(url, { cache: 'no-store' })).text();
    } catch (e) { console.log(`fetch: ${e.message} - waiting...`); }
    if (liveHtml !== null) {
      const v = deployVerdict({ localHtml, liveHtml, contains: gitContains });
      if (v.kind === 'exact' || v.kind === 'ancestor') {
        console.log(`VERIFIED: ${url} ${v.message}`);
        process.exit(0);
      }
      if (v.kind === 'dirty') { console.error(`FAILED: ${v.message}`); process.exit(1); }
      console.log(v.message);
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  console.error('TIMEOUT: live site never matched the local bundle');
  process.exit(1);
}

if (isMain(import.meta.url)) main();
