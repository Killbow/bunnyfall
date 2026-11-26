-- BUNNYFALL (2026-11-26, caverns): a drill's hauls paid (server-account/src/mineHaul.js). One row a signed receipt
-- (`id` its mine, reset and haul count), so a receipt carried twice pays once; `day` bounds an account's drill ore a day.
CREATE TABLE IF NOT EXISTS mine_hauls (
  id      TEXT PRIMARY KEY,
  player  TEXT NOT NULL,
  char_id TEXT NOT NULL,
  ore     TEXT NOT NULL,
  n       INTEGER NOT NULL,
  day     INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  nonce   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mine_hauls_day ON mine_hauls (player, day);
