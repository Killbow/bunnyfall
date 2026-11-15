-- POI claim names (src/poi/poiSettle.js recipeClaim): a recipe of a trade keyed `event` counts its limits under
-- "trade/event/<recipe>"; every other claim name is unchanged. Rows stored before this counted such a recipe under
-- "event/<recipe>", the name an event's claim uses, so one row may hold both. Every `event/<key>` row of every POI is
-- copied to `trade/event/<key>` and left in place for the event, so each reads what was stored and neither can claim
-- more than the row allows. Copying a row that only an event wrote is restrictive: events count per character, so the
-- copy can only stop that character from a same-key recipe in a trade keyed `event`. Where the copy already exists
-- (the new code served first, or the file runs again), the larger count and the later time win, never a sum.
INSERT INTO poi_trade_claims (poi_id, claim, scope, n, last_at)
  SELECT poi_id, 'trade/' || claim, scope, n, last_at FROM poi_trade_claims WHERE claim LIKE 'event/%'
  ON CONFLICT (poi_id, claim, scope) DO UPDATE SET n = max(n, excluded.n), last_at = max(last_at, excluded.last_at);
