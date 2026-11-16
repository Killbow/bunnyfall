-- Personal service shifts. Compare-and-swap revisions and request receipts make payments replay-safe.
CREATE TABLE IF NOT EXISTS tavern_service (
  character TEXT PRIMARY KEY REFERENCES realm_characters(id) ON DELETE CASCADE,
  player TEXT NOT NULL, version INTEGER NOT NULL, state TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tavern_service_txns (
  character TEXT NOT NULL REFERENCES realm_characters(id) ON DELETE CASCADE,
  txn TEXT NOT NULL, result TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (character, txn)
);
