-- BUNNYFALL CRAFTING REWORK, PHASE 2 (docs/CRAFTING.md) - FOCUS, THE PICKS, THE RESET.
--
-- FOCUS (`prof_focus`): the crafts a character has pledged, at most two (net/craft/craftLaw.js FOCUS_MAX). A Focus craft
-- levels at full speed, can reach Masterwork and may take a rank 100 perk. `prof_focus_change` keeps when a craft was
-- last dropped from the Focus: dropping one waits a week from it, pledging a free place never does.
CREATE TABLE IF NOT EXISTS prof_focus (
  player     TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  profession TEXT NOT NULL,
  set_at     INTEGER NOT NULL,
  PRIMARY KEY (player, char_id, profession),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS prof_focus_change (
  player     TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  PRIMARY KEY (player, char_id),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);

-- THE PICKS: what a piece was made of, as `{"f": form, "p": {slot: material}}`, kept beside the piece. A piece made the
-- old way has none. The piece is still signed and sold under its legacy recipe's id (craftLaw.js).
ALTER TABLE products ADD COLUMN picks TEXT;

-- THE RESET: the five crafting tracks start again, with their perks. Gathering tracks, the Stores and every piece made
-- stay as they are.
UPDATE prof_tracks
   SET xp = 0, spec50 = NULL, spec100 = NULL, respec_rank = NULL, respec_to = NULL, respec_at = NULL,
       spec50_at = NULL, spec100_at = NULL, free_respec = 0, updated_at = CAST(strftime('%s', 'now') AS INTEGER)
 WHERE profession IN ('smithing', 'building', 'outfitting', 'provisioning', 'enchanting');
