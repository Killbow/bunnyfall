CREATE TABLE discord_link_codes (
  code_hash TEXT PRIMARY KEY,
  discord_id TEXT UNIQUE NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE discord_links (
  discord_id TEXT PRIMARY KEY,
  player TEXT UNIQUE NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  character TEXT NOT NULL
);
CREATE TABLE discord_tavern (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK (source IN ('discord', 'game')),
  event TEXT NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  at INTEGER NOT NULL,
  UNIQUE (source, event)
);
CREATE INDEX discord_tavern_source_id ON discord_tavern(source, id);
CREATE TABLE discord_tavern_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  channel TEXT,
  floor INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX discord_tavern_at ON discord_tavern(at);
