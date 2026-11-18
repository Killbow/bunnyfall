ALTER TABLE discord_tavern ADD COLUMN discord_id TEXT;
CREATE INDEX discord_tavern_recent ON discord_tavern(source, id DESC) WHERE discord_id IS NOT NULL;
CREATE TABLE discord_tavern_serves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  character TEXT NOT NULL REFERENCES realm_characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  patron TEXT NOT NULL,
  drink TEXT NOT NULL,
  at INTEGER NOT NULL,
  message TEXT UNIQUE
);
CREATE INDEX discord_tavern_pending ON discord_tavern_serves(channel, message, id);
CREATE TABLE discord_tavern_tips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serve INTEGER NOT NULL REFERENCES discord_tavern_serves(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  claimed INTEGER NOT NULL DEFAULT 0,
  UNIQUE(serve, discord_id)
);
CREATE INDEX discord_tavern_character ON discord_tavern_serves(character, id);
