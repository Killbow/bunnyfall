// BUNNYFALL: every route the account service handles must be in its known-routes list (server-account/src/service.js
// ROUTES), or its gate answers `not-found` before the handler runs. This prints any route index.js handles that the list
// lacks, and exits 1 when there is one. Run it after adding a route: node tools/routesCheck.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const { ROUTES } = await import('../server-account/src/service.js');
const src = readFileSync(fileURLToPath(new URL('../server-account/src/index.js', import.meta.url)), 'utf8');
const handled = new Set([...src.matchAll(/'(\/v1\/[a-z0-9\-/]+)'/g)].map((m) => m[1]).filter((p) => !p.endsWith('/') && !p.endsWith('-')));
const missing = [...handled].filter((p) => !ROUTES.has(p));
if (missing.length) { console.log(`Missing from ROUTES in server-account/src/service.js:\n  ${missing.join('\n  ')}`); process.exit(1); }
console.log(`ok: all ${handled.size} handled routes are listed`);
