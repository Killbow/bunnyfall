-- BUNNYFALL COMPANIES (the war against Rodney): Rodney's blight - each slice's reach past Cromwark, grown daily
-- (src/net/blightLaw.js, server-account/src/blight.js), and the raids that pushed it back, one push a raid.
CREATE TABLE IF NOT EXISTS rodney_blight (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  day     INTEGER NOT NULL,
  extras  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rodney_blight_pushes (
  raid     TEXT PRIMARY KEY,
  sector   INTEGER NOT NULL,
  account  TEXT NOT NULL,
  at       INTEGER NOT NULL
);
