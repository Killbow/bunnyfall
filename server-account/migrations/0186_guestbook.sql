-- GUESTBOOK (2026-10-30): the lines visitors sign at a home's front door (src/net/guestbookLaw.js).
CREATE TABLE IF NOT EXISTS home_guestbook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  player TEXT NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  signed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS home_guestbook_home ON home_guestbook (map_id, building_key, id);
CREATE INDEX IF NOT EXISTS home_guestbook_signer ON home_guestbook (map_id, building_key, player, signed_at);
