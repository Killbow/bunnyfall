-- EVENT-EXTRAS (2026-11-13, mob: "participating players can be awarded currencies") - A STAFF EVENT'S SILVER, PAID ONCE.
--
--   npx wrangler d1 migrations apply daggerfall-accounts --remote
--
-- Applied exactly once through the `d1_migrations` ledger. Deploy the relay first: it signs the receipts this counts.
--
-- An event's earners are handed a receipt at its end (net/staffEvent/staffEventReceipt.js `e1`, the relay's key). The
-- account it names carries it to /v1/event/claim, which verifies it, checks the event's own pay (staff_events.ev `sv`,
-- `rk`) and pays the silver once.
--
-- event_pay  ONE ROW AN EVENT AND ACCOUNT: the primary key is (event, account), so a receipt pays once whatever happens
--            to it. `nonce` names the claim that wrote the row, so the one batch that writes it pays by its own row alone
--            (stars_held's law, migration 0141). `silver` is what the event's `sv` was.
CREATE TABLE IF NOT EXISTS event_pay (
  event   TEXT    NOT NULL,
  account TEXT    NOT NULL,
  nonce   TEXT    NOT NULL,
  silver  INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (event, account)
) WITHOUT ROWID;
