-- BUNNYFALL CAMPS (src/net/campLaw.js, server-account/src/camps.js): a player's camp in the open world, pitched with the
-- camping kit - its owner's account and the character who pitched it, the kit's record it stands for (`rec`, one camp
-- a record) and its tent's heading, its name, and its fire's place (the map pixel, and pixel-local metres) - and
-- its pieces, each the decor law's own record (net/decorLaw.js, a yard's piece), kept as JSON. Kept until struck.
CREATE TABLE IF NOT EXISTS camps (
  id TEXT PRIMARY KEY,
  player TEXT NOT NULL,
  char_id TEXT NOT NULL,
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  rec TEXT NOT NULL,
  yaw REAL NOT NULL DEFAULT 0,
  px INTEGER NOT NULL,
  py INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS camps_pixel ON camps (px, py);
CREATE UNIQUE INDEX IF NOT EXISTS camps_rec ON camps (player, rec);
CREATE TABLE IF NOT EXISTS camp_pieces (
  camp_id TEXT NOT NULL,
  id TEXT NOT NULL,
  piece TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (camp_id, id)
);
