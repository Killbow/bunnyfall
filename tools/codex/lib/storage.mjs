// Durable Object SQLite schemas matching workerd per-object storage layout.

export const KV_SCHEMA = `
      CREATE TABLE IF NOT EXISTS _cf_KV (
        key TEXT PRIMARY KEY,
        value BLOB
      ) WITHOUT ROWID;`;

export const METADATA_SCHEMA = `
      CREATE TABLE IF NOT EXISTS _cf_METADATA (
        key INTEGER PRIMARY KEY,
        value BLOB
      );`;
