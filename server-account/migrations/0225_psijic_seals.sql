CREATE TABLE IF NOT EXISTS psijic_seals (
  account_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  epoch_granted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS psijic_seal_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  rid TEXT UNIQUE,
  actor_id TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_psijic_seal_ledger_account
  ON psijic_seal_ledger(account_id, id DESC);
