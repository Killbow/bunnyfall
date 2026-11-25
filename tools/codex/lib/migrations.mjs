// D1 migration ordering and metadata table helpers.
import { readdirSync } from 'node:fs';

export const MIGRATIONS_TABLE = 'd1_migrations';

const quoteIdent = (id) => `"${id.replace(/"/g, '""')}"`;

/** @param {string} [table] @returns {string} */
export const createMigrationsTableSql = (table = MIGRATIONS_TABLE) => `CREATE TABLE IF NOT EXISTS ${quoteIdent(table)}(
\t\tid         INTEGER PRIMARY KEY AUTOINCREMENT,
\t\tname       TEXT UNIQUE,
\t\tapplied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);`;

/** @param {string} name */
function leadingNumber(name) {
  const m = /^(\d+)/.exec(name);
  return m ? Number(m[1]) : NaN;
}

/** @param {string} a @param {string} b */
export function compareMigrationNames(a, b) {
  const an = leadingNumber(a);
  const bn = leadingNumber(b);
  if (an !== bn && !(Number.isNaN(an) && Number.isNaN(bn))) {
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    if (Number.isFinite(an)) return -1;
    if (Number.isFinite(bn)) return 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** @param {string} dir @returns {string[]} */
export function listMigrations(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort(compareMigrationNames);
}
