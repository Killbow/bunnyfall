-- BUNNYFALL FIRMAMENT FREE RESPEC (server-account/src/firmament.js respecFirmament): one reset of a character's whole
-- tree that costs no gold. Migration 0195 resets the crafting ranks that pay for craft stars, so a tree learned before
-- it can cost more than its purses hold. Every living realm character when this migration runs gets one; a character
-- with no stars yet keeps it until it has some to reset.
--
-- ONE ROW A CHARACTER: the row stays until the free reset uses it (deleted in the same batch that clears the tree) or
-- the realm character is deleted (realm.js deleteRealm). The `firmament` table and its packed trees are not touched.
-- Deleting the account deletes its rows (CASCADE).
CREATE TABLE IF NOT EXISTS firmament_free_respec (
  player     TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (player, char_id),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- THE GRANT: one row for every living realm character.
INSERT OR IGNORE INTO firmament_free_respec (player, char_id, granted_at)
  SELECT player, id, CAST(strftime('%s', 'now') AS INTEGER) FROM realm_characters WHERE dead_at IS NULL;
