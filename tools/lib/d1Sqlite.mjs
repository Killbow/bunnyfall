// BUNNYFALL (2026-11-26, caverns): THE ACCOUNT DATABASE FOR A TEST - every migration of server-account/migrations, in order,
// over node's own SQLite (D1 is SQLite), handed out in D1's shape: prepare().bind().first()/all()/run(), and batch() in one
// transaction, each statement answering its rows (a SELECT's, a RETURNING's) and its changes as D1's do.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/** A fresh database with the whole schema: `{ db, sqlite }`, `sqlite` the raw handle for seeding and reading back. */
export function d1Sqlite() {
  const sqlite = new DatabaseSync(':memory:');
  const dir = new URL('../../server-account/migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => {
    const st = sqlite.prepare(sql);
    const exec = () => { const results = st.all(...args); return { results, meta: { changes: sqlite.prepare('SELECT changes() AS c').get().c } }; };
    return { first: async () => st.get(...args) ?? null, all: async () => ({ results: st.all(...args) }), run: async () => ({ meta: st.run(...args) }), _exec: exec };
  };
  const db = {
    prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql) }),
    batch: async (list) => { sqlite.exec('BEGIN'); try { const out = list.map((s) => s._exec()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
  };
  return { db, sqlite };
}

/** A registered player's row, as the account service keeps one. */
export const seedPlayer = (sqlite, id, handle) => sqlite.prepare('INSERT INTO players (id, handle, guest_name, created_at, last_seen) VALUES (?1, ?2, ?2, 1, 1)').run(id, handle);
