-- BUNNYFALL FARM EXPANSION, PHASE 2 (docs/FARM-EXPANSION.md section 10): FARM WORK - an account's count of the work it
-- has put into Company farms (src/net/farm/farmWorkLaw.js), raised with the work in one batch (farmGardens.js) and never
-- past the day's cap; the farm titles and First Light are derived from it (titles.js). farm_work_day is the UTC day
-- farm_work_today counts (-1: never).
ALTER TABLE players ADD COLUMN farm_work INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN farm_work_day INTEGER NOT NULL DEFAULT -1;
ALTER TABLE players ADD COLUMN farm_work_today INTEGER NOT NULL DEFAULT 0;
