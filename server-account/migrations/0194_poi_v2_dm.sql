-- POI v2 / DM TOOLKIT (World Builder, Milestone 5). The service side of what a POI's trades and events may do.
--
--   npx wrangler d1 migrations apply daggerfall-accounts --remote
--
-- Applied exactly once through the `d1_migrations` ledger, which the deploy runs (ACC1-CI).
--
-- A trade or an event of an APPROVED, LIVE POI that moves a player's items or gold is settled here
-- (server-account/src/poiTrade.js), through the same guarded record move every other act that pays a realm character
-- uses (realm.js prepareRealmRecord). The save's schema does not change: these tables hold only what a POI remembers.

-- How often each recipe (or an event that gives) has been run, by the scope its limit counts in:
--   char:<id> (once per character; also an event's once), acct:<player> (once per account), day:<id>:<utc day>
--   (daily per character), cool:<id> (the cooldown's clock), global (the stock). `claim` is "<trade>/<recipe>" or
--   "event/<key>". The count moves in the settling batch itself, guarded, so two at once never both pass.
CREATE TABLE IF NOT EXISTS poi_trade_claims (
  poi_id   TEXT NOT NULL,
  claim    TEXT NOT NULL,
  scope    TEXT NOT NULL,
  n        INTEGER NOT NULL DEFAULT 0,
  last_at  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (poi_id, claim, scope)
);

-- The variables a POI keeps past a visit: `character` scope under `char:<id>`, `poi_global` under `poi`. `value` is the
-- JSON of a boolean, a number or a string.
CREATE TABLE IF NOT EXISTS poi_state_vars (
  poi_id   TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  var      TEXT NOT NULL,
  value    TEXT NOT NULL,
  PRIMARY KEY (poi_id, scope_id, var)
);

-- One row per settled act, by the client's own `txnId`: an act sent again (a lost answer) is answered what it was, and a
-- txnId can never settle twice. Pruned by cron.js (poi-txn-log).
CREATE TABLE IF NOT EXISTS poi_txn_log (
  txn_id     TEXT PRIMARY KEY,
  player     TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  poi_id     TEXT NOT NULL,
  rev        INTEGER NOT NULL,
  kind       TEXT NOT NULL,                  -- 'trade' | 'event'
  result     TEXT NOT NULL,                  -- the answer, as JSON
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS poi_txn_log_created ON poi_txn_log (created_at);
