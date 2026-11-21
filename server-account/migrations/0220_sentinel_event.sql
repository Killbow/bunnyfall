-- BUNNYFALL (2026-11-20): THE SENTINEL GARRISON EVENT (src/net/sentinelLaw.js, server-account/src/sentinel.js) - one month, once.
-- `started_at` is set the first time the service is asked; `stay_pts` and `leave_pts` are the two sides' running counts (never who
-- gave); `outcome` is written once when the month is over ('stay', 'leave' or 'divided') and never changed. `sentinel_gifts`
-- keeps what an account gave each UTC day, for the daily cap.
CREATE TABLE IF NOT EXISTS sentinel_event (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started_at INTEGER NOT NULL,
  stay_pts INTEGER NOT NULL DEFAULT 0,
  leave_pts INTEGER NOT NULL DEFAULT 0,
  outcome TEXT
);
CREATE TABLE IF NOT EXISTS sentinel_gifts (
  account TEXT NOT NULL,
  day INTEGER NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account, day)
);
