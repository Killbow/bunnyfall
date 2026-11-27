// Exits 1 when the account service handles a route missing from ROUTES (server-account/src/service.js), or when
// the client names a /v1/ path that no server serves. Run: node tools/routesCheck.mjs.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { ROUTES, poiPathOf } = await import('../server-account/src/service.js');
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const paths = (text) => [...text.matchAll(/['`](\/v1\/[a-z0-9\-/]+)['`]/g)].map((m) => m[1]).filter((p) => !p.endsWith('/') && !p.endsWith('-'));
const jsFiles = (dir) => readdirSync(join(root, dir)).flatMap((n) => {
  const p = join(dir, n);
  if (statSync(join(root, p)).isDirectory()) return jsFiles(p);
  return n.endsWith('.js') ? [p] : [];
});

const handled = new Set(['server-account/src/index.js', ...jsFiles('server-account/src/routes')].flatMap((f) => paths(read(f))));
const missing = [...handled].filter((p) => !ROUTES.has(p));

const relay = new Set(jsFiles('server/src').flatMap((f) => paths(read(f))));
// The relay also serves paths through constants it imports from the client's wire, such as SAFE_LAW_PATH.
const { SAFE_LAW_PATH } = await import('../src/net/wire.js');
relay.add(SAFE_LAW_PATH);
/** @type {Map<string, string>} */
const called = new Map();
for (const f of jsFiles('src')) for (const p of paths(read(f))) if (!called.has(p)) called.set(p, f);
const unknown = [...called].filter(([p]) => !ROUTES.has(p) && !poiPathOf(p) && !relay.has(p));

if (missing.length) console.log(`Missing from ROUTES in server-account/src/service.js:\n  ${missing.join('\n  ')}`);
if (unknown.length) console.log(`Called by the client but served by no server:\n  ${unknown.map(([p, f]) => `${p}  (${f})`).join('\n  ')}`);
if (missing.length || unknown.length) process.exit(1);
console.log(`ok: all ${handled.size} handled routes are listed; all ${called.size} client paths are served`);
