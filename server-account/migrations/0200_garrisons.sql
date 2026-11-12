-- BUNNYFALL COMPANIES (garrisons and patrols): the soldiers a Company keeps at its hall's town (`owner` 'g:<guild id>')
-- and a City Charter at its capital ('c:<capital map id>') - src/net/garrisonLaw.js, server-account/src/garrisons.js.
-- `day` the last UTC day reckoned (upkeep eaten, desertions, the march); `troops` and `orders` JSON; `sector` the
-- blight's slice the town faces (the client's measure, set with the march order).
CREATE TABLE IF NOT EXISTS garrisons (
  owner     TEXT PRIMARY KEY,
  map_id    INTEGER NOT NULL,
  region    INTEGER NOT NULL,
  day       INTEGER NOT NULL,
  troops    TEXT NOT NULL,
  orders    TEXT NOT NULL,
  sector    INTEGER,
  report    TEXT
);
