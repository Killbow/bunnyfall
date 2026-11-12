-- BUNNYFALL CRAFTWORK (docs/CRAFTING.md): a Focus craft at rank 100 may go into Craftwork, once a skill a character. Its
-- rank and XP go back to 0 (its perks stay); from then on the skill earns half its XP and the materials' effects on what it
-- makes reach 40% instead of 20 (net/craft/craftLaw.js CRAFTWORK_SWING). One row a skill entered; `rid` answers a repeat.
CREATE TABLE IF NOT EXISTS prof_craftwork (
  player     TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  profession TEXT NOT NULL,
  rid        TEXT NOT NULL,
  at         INTEGER NOT NULL,
  PRIMARY KEY (player, char_id, profession),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS prof_craftwork_rid ON prof_craftwork (player, rid);
