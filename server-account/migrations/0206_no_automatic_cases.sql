-- BUNNYFALL (Killbunny, 2026-11-12: "only official reports"): the AI reviewer and the automatic spawn cases are gone.
-- Every open case nobody reported (a spawn check, a case the reviewer opened from the chat feed) closes as dismissed;
-- a player's report stays open. The reviewer's waiting reads stop.
UPDATE mod_cases SET status = 'dismissed', resolved_by = 'Bunnyfall', resolved_at = CAST(strftime('%s', 'now') AS INTEGER),
  resolution = 'automatic case removed', updated_at = CAST(strftime('%s', 'now') AS INTEGER), claimed_at = NULL,
  discord_state = CASE WHEN discord_msg IS NULL THEN 'off' ELSE 'due' END
WHERE status = 'open' AND (kind != 'chat' OR source = 'review') AND reports = 0;
UPDATE mod_cases SET ai_state = 'off' WHERE ai_state IN ('due', 'reading');
DELETE FROM mod_feed;
