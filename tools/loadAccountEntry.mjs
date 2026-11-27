// The account Worker entry that tools/loadHarness.mjs runs under wrangler dev; it is never deployed.
// It keeps metrics points and D1 row counts in the isolate, drained by each read of /__load/stats.
// The database is wrapped once per isolate and answers DB_ROOT with the real binding, so the service's caches
// keyed by that binding behave as they do in a deploy.
import service from '../server-account/src/index.js';
import { DB_ROOT } from '../server-account/src/service.js';
// wrangler dev refuses an entry that does not export every Durable Object class the bindings name.
export * from '../server-account/src/index.js';

const POINTS_MAX = 500_000;
const points = [];
/** @type {Map<string, { n: number, rowsRead: number, rowsWritten: number, ms: number }>} */
const bySql = new Map();
// Each point is stamped with when its request ended, so storm seconds do not depend on when the harness reads.
const sink = { writeDataPoint(/** @type {any} */ p) { if (points.length < POINTS_MAX) points.push({ ...p, t: Date.now() }); } };

const note = (/** @type {string} */ sql, /** @type {any} */ meta) => {
  const key = sql.replace(/\s+/g, ' ').trim().slice(0, 240);
  const row = bySql.get(key) ?? { n: 0, rowsRead: 0, rowsWritten: 0, ms: 0 };
  row.n += 1;
  row.rowsRead += Number(meta?.rows_read ?? 0);
  row.rowsWritten += Number(meta?.rows_written ?? 0);
  row.ms += Number(meta?.duration ?? 0);
  bySql.set(key, row);
};

const realOf = new WeakMap();
const sqlOf = new WeakMap();

function statement(/** @type {any} */ real, /** @type {string} */ sql) {
  const st = new Proxy(real, {
    get(target, key) {
      if (key === 'bind') return (/** @type {any[]} */ ...a) => statement(target.bind(...a), sql);
      if (key === 'first') {
        return async (/** @type {string|undefined} */ col) => {
          const r = await target.all();
          note(sql, r?.meta);
          const row = r?.results?.[0] ?? null;
          if (col === undefined || row === null) return row;
          // Throw on a missing column, as workerd's D1 binding does.
          if (!(col in row)) throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${col})`);
          return row[col];
        };
      }
      if (key === 'all' || key === 'run') return async () => { const r = await target[key](); note(sql, r?.meta); return r; };
      // raw() returns no meta, so it is counted as a statement with unknown rows.
      if (key === 'raw') return async (/** @type {any} */ opts) => { const r = await target.raw(opts); note(sql, null); return r; };
      const v = Reflect.get(target, key);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  realOf.set(st, real);
  sqlOf.set(st, sql);
  return st;
}

let wrapped = null, wrappedOf = null;
function database(/** @type {any} */ db) {
  if (!db) return db;
  if (wrappedOf === db) return wrapped;
  wrappedOf = db;
  wrapped = new Proxy(db, {
    get(target, key) {
      if (key === DB_ROOT) return Reflect.get(target, DB_ROOT) ?? target;
      if (key === 'prepare') return (/** @type {string} */ sql) => statement(target.prepare(sql), String(sql));
      if (key === 'batch') {
        return async (/** @type {any[]} */ list) => {
          const out = await target.batch(list.map((st) => realOf.get(st) ?? st));
          list.forEach((st, i) => note(sqlOf.get(st) ?? '(batch)', out?.[i]?.meta));
          return out;
        };
      }
      const v = Reflect.get(target, key);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  return wrapped;
}

const withLoad = (/** @type {any} */ env) => ({ ...env, DB: database(env.DB), METRICS: sink });

export default {
  async fetch(/** @type {Request} */ request, /** @type {any} */ env, /** @type {any} */ ctx) {
    const url = new URL(request.url);
    // Every read drains, so a reader that sums its reads counts each statement once.
    if (url.pathname === '/__load/stats') {
      const body = JSON.stringify({ points: points.splice(0), statements: [...bySql].map(([sql, s]) => ({ sql, ...s })) });
      bySql.clear();
      return new Response(body, { headers: { 'content-type': 'application/json' } });
    }
    return service.fetch(request, withLoad(env), ctx);
  },
  async scheduled(/** @type {any} */ event, /** @type {any} */ env, /** @type {any} */ ctx) {
    const s = /** @type {any} */ (service);
    if (typeof s.scheduled === 'function') return s.scheduled(event, withLoad(env), ctx);
  },
};
