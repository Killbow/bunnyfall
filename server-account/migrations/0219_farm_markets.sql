-- BUNNYFALL FARM EXPANSION, PHASE 7 (docs/FARM-EXPANSION.md section 9): MARKET DAY. The day itself comes from the law
-- (src/net/farm/marketLaw.js: a farm's weekday is drawn from its map id), so the service writes a row only when
-- something happens at it.
--   farm_markets          the day's takings (a tenth of every sale goes to `pot`); `judged` is claimed once, with its `claim`
--   farm_stalls           what a stall holds today, stocked from a Company's Stores (`guild_id` is who is paid); unsold
--                         stock goes back to that Company's Stores after the day (`claim` makes the return happen once)
--   farm_market_entries   a contest entry: one an account a contest; `snapshot` is what was judged (care, contentment)
--   farm_market_awards    the ribbons given at the close; `counted` 1 while the account's weekly three are not spent
--   farm_market_prizes    gold the pot owes an account, collected into a record's purse (collectRent's pattern)
CREATE TABLE IF NOT EXISTS farm_markets (
  map_id  INTEGER NOT NULL,
  day     INTEGER NOT NULL,
  takings INTEGER NOT NULL DEFAULT 0,
  pot     INTEGER NOT NULL DEFAULT 0,
  judged  INTEGER NOT NULL DEFAULT 0,
  claim   TEXT,
  PRIMARY KEY (map_id, day)
);
CREATE TABLE IF NOT EXISTS farm_stalls (
  map_id   INTEGER NOT NULL,
  day      INTEGER NOT NULL,
  slot     INTEGER NOT NULL CHECK (slot >= 0 AND slot < 8),
  guild_id TEXT NOT NULL,
  material TEXT NOT NULL,
  qty      INTEGER NOT NULL CHECK (qty >= 0 AND qty <= 1000),
  price    INTEGER NOT NULL CHECK (price >= 1),
  claim    TEXT,
  PRIMARY KEY (map_id, day, slot)
);
CREATE TABLE IF NOT EXISTS farm_market_entries (
  map_id   INTEGER NOT NULL,
  day      INTEGER NOT NULL,
  contest  TEXT NOT NULL,
  account  TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  name     TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  score    INTEGER NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (map_id, day, contest, account)
);
CREATE TABLE IF NOT EXISTS farm_market_awards (
  map_id  INTEGER NOT NULL,
  day     INTEGER NOT NULL,
  contest TEXT NOT NULL,
  ribbon  TEXT NOT NULL,
  account TEXT NOT NULL,
  name    TEXT NOT NULL,
  score   INTEGER NOT NULL,
  week    INTEGER NOT NULL,
  counted INTEGER NOT NULL DEFAULT 0,
  work    INTEGER NOT NULL DEFAULT 0,
  gold    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (map_id, day, contest, ribbon)
);
CREATE INDEX IF NOT EXISTS idx_farm_market_awards_acct ON farm_market_awards (account, week);
CREATE TABLE IF NOT EXISTS farm_market_prizes (
  account TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  gold    INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0)
);
