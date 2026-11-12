-- BUNNYFALL PROVISIONING (docs/PROVISIONING.md): the pot and the cauldron, their own system.
-- `prov_makes` each make, by its request id (a repeat answers it); `prov_learnt` the traits a character has learnt of an
-- ingredient (the first of each is everyone's, never a row); `prov_book` the makes a character has found, by signature.
-- `prov_prepares` the pot's preparing (Flour of Grain, Cheese of Milk). Provisioning leaves the Focus: its pledges go.
CREATE TABLE IF NOT EXISTS prov_makes (
  player TEXT NOT NULL, rid TEXT NOT NULL, char_id TEXT NOT NULL, kind TEXT NOT NULL, keys TEXT NOT NULL, base TEXT,
  traits TEXT NOT NULL, name TEXT NOT NULL, potent INTEGER NOT NULL DEFAULT 0, magnitude INTEGER NOT NULL DEFAULT 0,
  resist INTEGER NOT NULL DEFAULT 0, minutes INTEGER NOT NULL DEFAULT 0, count INTEGER NOT NULL, party INTEGER NOT NULL DEFAULT 0,
  drink INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL, at INTEGER NOT NULL, n TEXT NOT NULL,
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS prov_learnt (
  player TEXT NOT NULL, char_id TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, trait TEXT NOT NULL,
  PRIMARY KEY (player, char_id, kind, key, trait),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS prov_book (
  player TEXT NOT NULL, char_id TEXT NOT NULL, sig TEXT NOT NULL, kind TEXT NOT NULL, base TEXT, keys TEXT NOT NULL,
  name TEXT NOT NULL, traits TEXT NOT NULL, made INTEGER NOT NULL DEFAULT 1, at INTEGER NOT NULL,
  PRIMARY KEY (player, char_id, sig),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS prov_prepares (
  player TEXT NOT NULL, rid TEXT NOT NULL, char_id TEXT NOT NULL, prep TEXT NOT NULL, count INTEGER NOT NULL, at INTEGER NOT NULL, n TEXT NOT NULL,
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
DELETE FROM prof_focus WHERE profession = 'provisioning';
