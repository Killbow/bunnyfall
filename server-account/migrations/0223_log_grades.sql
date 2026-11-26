-- BUNNYFALL (2026-11-26, caverns): timber grades (src/net/timberLaw.js). A character's prime and knotty logs of each wood,
-- counted beside the Stores (which keep no unit's grade) as prof_unbruised counts unbruised herbs: the felling adds them
-- (profHarvest.js), the workbench's saw spends them (profCraft.js), the rest of a wood's own logs are sound.
CREATE TABLE IF NOT EXISTS prof_log_grades (
  player   TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  material TEXT NOT NULL,
  prime    INTEGER NOT NULL DEFAULT 0,
  knotty   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player, char_id, material)
);
