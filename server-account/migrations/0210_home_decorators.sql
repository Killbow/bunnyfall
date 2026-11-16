-- Players an owner lets draft templates in a home, the drafts themselves, and caravan templates.
-- Existing homes and pieces are unchanged. Drafts never reach home_decor until the owner accepts and pays.
CREATE TABLE IF NOT EXISTS home_decorators (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  player       TEXT NOT NULL,
  granted_at   INTEGER NOT NULL,
  draft_rev    INTEGER NOT NULL DEFAULT 0,
  draft_at     INTEGER,
  sent_at      INTEGER,
  declined_at  INTEGER,
  PRIMARY KEY (map_id, building_key, player),
  FOREIGN KEY (map_id, building_key) REFERENCES homes(map_id, building_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_home_decorators_player ON home_decorators (player);
CREATE TABLE IF NOT EXISTS home_drafts (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  player       TEXT NOT NULL,
  id           TEXT NOT NULL,
  model        INTEGER,
  flat_archive INTEGER,
  flat_record  INTEGER,
  place        TEXT NOT NULL,
  yard         INTEGER NOT NULL DEFAULT 0,
  placed_at    INTEGER NOT NULL,
  PRIMARY KEY (map_id, building_key, id),
  FOREIGN KEY (map_id, building_key, player) REFERENCES home_decorators(map_id, building_key, player) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_home_drafts_player ON home_drafts (map_id, building_key, player, yard);
CREATE TABLE IF NOT EXISTS caravan_decorators (
  owner      TEXT NOT NULL,
  player     TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (owner, player)
);
CREATE TABLE IF NOT EXISTS caravan_templates (
  owner   TEXT NOT NULL,
  player  TEXT NOT NULL,
  base    TEXT NOT NULL,
  doc     TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (owner, player),
  FOREIGN KEY (owner, player) REFERENCES caravan_decorators(owner, player) ON DELETE CASCADE
);
