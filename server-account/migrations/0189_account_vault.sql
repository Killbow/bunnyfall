-- BUNNYFALL (2026-11-05, Phase 5): THE ACCOUNT VAULT - a shelf of pieces and a purse every character of one account reaches
-- at a bank (server-account/src/accountVault.js). A piece moves on a realm record, as the guild vault's do.
CREATE TABLE IF NOT EXISTS account_vault (
  player_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  rec TEXT NOT NULL,
  name TEXT NOT NULL,
  count INTEGER NOT NULL,
  dep_char TEXT NOT NULL,
  dep_name TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (player_id, slot)
);
ALTER TABLE players ADD COLUMN vault_gold INTEGER NOT NULL DEFAULT 0;
