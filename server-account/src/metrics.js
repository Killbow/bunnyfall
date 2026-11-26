// @ts-check
// Writes one Analytics Engine point per request. The blob and double positions are the dataset's columns, so new
// fields go at the end and existing ones never move. No point carries a player id, handle, header, or body.

import { ROUTES, savePathOf, realmPathOf, DB_ROOT, noteD1Wait, SLOW_SHED_TRIP_CAP_MS } from './service.js';
import { HEARTBEAT_PARTS } from './heartbeat.js';

export function routeLabel(/** @type {string} */ path) {
  if (ROUTES.has(path)) return path;
  const slot = savePathOf(path);
  if (slot) return `/v1/saves/:slot${slot.part ? `/${slot.part}` : ''}`;
  if (realmPathOf(path)) return '/v1/realm/:id/data';
  return 'other';
}

const add = (/** @type {any} */ tally, /** @type {string} */ key, /** @type {number} */ v) => { if (Number.isFinite(v)) tally[key] = (tally[key] ?? 0) + v; };

export const tableOf = (/** @type {unknown} */ sql) => {
  const m = typeof sql === 'string' ? /^\s*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+["`]?(\w+)/i.exec(sql) : null;
  return m ? m[1].toLowerCase() : null;
};

export const HOT_TABLES = Object.freeze(['players', 'sessions', 'renown_tracks', 'realm_characters']);

function noteMeta(/** @type {any} */ result, /** @type {any} */ tally, /** @type {unknown} */ sql = null) {
  const m = result?.meta;
  if (!m || typeof m !== 'object') return;
  add(tally, 'rr', m.rows_read);
  add(tally, 'rw', m.rows_written);
  if (m.served_by_primary === false) add(tally, 'replica', 1);
  const t = Number.isFinite(m.rows_written) && m.rows_written > 0 ? tableOf(sql) : null;
  if (t) { const by = tally.tables ??= {}; by[t] = (by[t] ?? 0) + m.rows_written; }
}

export const tablesBlob = (/** @type {Record<string, number>|undefined} */ by) => Object.entries(by ?? {})
  .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 8).map(([t, n]) => `${t}:${n}`).join(' ');

const REAL = new WeakMap();
const SQL = new WeakMap();

function timedStatement(/** @type {any} */ stmt, /** @type {any} */ tally, /** @type {unknown} */ sql = null) {
  if (!stmt || typeof stmt !== 'object') return stmt;
  // Methods run on the real statement, since workerd statements have private fields that throw through a Proxy.
  const timed = new Proxy(stmt, {
    get(target, key) {
      const v = Reflect.get(target, key);
      if (typeof v !== 'function') return v;
      if (key === 'bind') return (/** @type {any[]} */ ...args) => timedStatement(v.apply(target, args), tally, sql);
      if (key === 'first' || key === 'all' || key === 'run' || key === 'raw') {
        // A bare first() runs as all() so its meta is counted; D1 receives the same query either way.
        const all = key === 'first' ? Reflect.get(target, 'all') : null;
        return async (/** @type {any[]} */ ...args) => {
          const started = Date.now();
          try {
            if (typeof all === 'function' && args.length === 0) {
              const r = await all.call(target);
              noteMeta(r, tally, sql);
              return r?.results?.[0] ?? null;
            }
            const r = await v.apply(target, args);
            if (key === 'all' || key === 'run') noteMeta(r, tally, sql);
            return r;
          } finally { tripDone(tally, Date.now() - started); }
        };
      }
      return v.bind(target);
    },
  });
  REAL.set(timed, stmt);
  SQL.set(timed, sql);
  return timed;
}

function tripDone(/** @type {any} */ tally, /** @type {number} */ ms) {
  add(tally, 'ms', ms);
  add(tally, 'trips', 1);
  add(tally, 'capped', Math.min(ms, SLOW_SHED_TRIP_CAP_MS));
}

export function countedDb(/** @type {any} */ db, /** @type {{ n: number }} */ tally) {
  return new Proxy(db, {
    get(target, key) {
      if (key === DB_ROOT) return Reflect.get(target, DB_ROOT) ?? target;
      if (key === 'prepare') return (/** @type {any[]} */ ...args) => { tally.n += 1; return timedStatement(target.prepare(...args), tally, args[0]); };
      if (key === 'batch') {
        const batch = Reflect.get(target, key);
        if (typeof batch !== 'function') return batch;
        return async (/** @type {any[]} */ list, /** @type {any[]} */ ...rest) => {
          const started = Date.now();
          try {
            const rs = await batch.call(target, Array.isArray(list) ? list.map((st) => REAL.get(st) ?? st) : list, ...rest);
            if (Array.isArray(rs)) rs.forEach((r, i) => noteMeta(r, tally, Array.isArray(list) ? SQL.get(list[i]) : null));
            return rs;
          } finally { tripDone(tally, Date.now() - started); }
        };
      }
      if (key === 'withSession') {
        const open = Reflect.get(target, key);
        return typeof open === 'function' ? (/** @type {any[]} */ ...args) => countedDb(open.apply(target, args), tally) : open;
      }
      const v = Reflect.get(target, key);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

async function refusalOf(/** @type {Response} */ res) {
  if (res.status < 300 || !(res.headers.get('content-type') ?? '').includes('json')) return '';
  try {
    const body = await res.clone().json();
    return typeof body?.error === 'string' ? body.error.slice(0, 64) : '';
  } catch {
    return '';
  }
}

/**
 * @param {Request} request
 * @param {any} env
 * @param {(request: Request, env: any, said: { parts: string }) => Promise<Response>} serve
 */
export async function measured(request, env, serve, exec = null) {
  const sink = env?.METRICS;
  const said = { parts: '' };
  if (!sink || typeof sink.writeDataPoint !== 'function') return serve(request, env, said, exec);
  const started = Date.now();
  const tally = { n: 0, ms: 0, trips: 0, capped: 0, rr: 0, rw: 0, replica: 0, tables: /** @type {Record<string, number>} */ ({}) };
  const counted = env.DB ? { ...env, DB: countedDb(env.DB, tally) } : env;
  const res = await serve(request, counted, said, exec);
  noteD1Wait(tally.capped, tally.trips, Date.now());
  // The parts come from the body the service read within its size cap; reading a request clone here is unbounded.
  const parts = typeof said.parts === 'string' ? said.parts : '';
  // A failed metric write skips the point and never changes the answer.
  try {
    const route = routeLabel(new URL(request.url).pathname);
    sink.writeDataPoint({
      indexes: [route],
      blobs: [route, request.method, String(res.status), await refusalOf(res), tablesBlob(tally.tables), parts],
      doubles: [Date.now() - started, res.status, tally.n, tally.rw, tally.ms, tally.rr, tally.replica,
        ...HOT_TABLES.map((t) => tally.tables[t] ?? 0)],
    });
  } catch { }
  return res;
}

export function heartbeatPartsOf(/** @type {unknown} */ body) {
  if (!body || typeof body !== 'object') return '';
  const b = /** @type {Record<string, unknown>} */ (body);
  return HEARTBEAT_PARTS.filter((k) => b[k] !== undefined && b[k] !== false).join(',');
}
