// BUNNYFALL: every route the account service handles must be in its known-routes list (server-account/src/service.js
// ROUTES), or its gate answers `not-found` before the handler runs. This prints any route index.js handles that the list
// lacks, and exits 1 when there is one. Run it after adding a route: node tools/routesCheck.mjs
//
// It also checks the other way: every '/v1/...' path the client names (src/) must be one the account service lists
// (ROUTES, or the POI prefix poiPathOf answers) or one the relay handles (server/src). A client calling a route that no
// server knows fails only in play, so it is caught here.
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
// The relay also serves paths through constants it imports from the client's wire (SAFE_LAW_PATH): read them as served.
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
