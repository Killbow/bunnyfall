-- BUNNYFALL (2026-11-26, caverns): the mine kit (src/net/mine/societyLaw.js SOCIETY_KIT, server-account/src/society.js):
-- a character's drill, fuel, lamps and Survey Rod, bought for gold at the Cartographers' desk, kept beside the Stores.
CREATE TABLE IF NOT EXISTS mine_kit (
  player  TEXT NOT NULL,
  char_id TEXT NOT NULL,
  kit     TEXT NOT NULL,
  qty     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player, char_id, kit)
);
