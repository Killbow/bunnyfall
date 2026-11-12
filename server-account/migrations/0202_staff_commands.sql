-- BUNNYFALL STAFF COMMANDS (server-account/src/staffCommands.js): /vanish's switch on the account (read by the game's mint,
-- staffHidden.js hiddenToken), and /greed's gifts - gold and Nyx coins a staff member sends a player, kept until the
-- player's game takes them (one claim each).
ALTER TABLE players ADD COLUMN vanish_on INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS staff_gifts (
  id          INTEGER PRIMARY KEY,
  to_account  TEXT NOT NULL,
  gold        INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),
  nyx         INTEGER NOT NULL DEFAULT 0 CHECK (nyx >= 0),
  from_name   TEXT NOT NULL,
  at          INTEGER NOT NULL,
  claimed_at  INTEGER,
  FOREIGN KEY (to_account) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_staff_gifts_open ON staff_gifts (to_account, claimed_at);
