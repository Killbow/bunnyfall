-- BUNNYFALL CRAFTING REWORK: dropping a Focus craft costs silver (craftLaw.js FOCUS_CHANGE_MARKS), not a week's wait.
-- `prof_focus_paid` holds each paid change by its request id, so a change asked again is answered, never charged twice.
-- `prof_focus_change` (0195) is no longer written.
CREATE TABLE IF NOT EXISTS prof_focus_paid (
  player  TEXT NOT NULL,
  rid     TEXT NOT NULL,
  char_id TEXT NOT NULL,
  marks   INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  n       TEXT NOT NULL,
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
