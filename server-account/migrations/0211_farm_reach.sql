-- BUNNYFALL COMPANIES (farms): the hall town and Charter capital recorded for each farm, and the map pixels of the
-- farm, hall, and capital as a client placed them. The service judges a lapsed release by them (territory.js
-- farmInReach). A new table, not new columns, keeps this migration safe to run twice. Farms that exist now get a row
-- with the current hall and Charter of their Company and NULL pixels, until a member reports them (`reported` 1).
CREATE TABLE IF NOT EXISTS company_farm_reach (
  map_id    INTEGER PRIMARY KEY REFERENCES company_farms(map_id) ON DELETE CASCADE,
  px        INTEGER,
  py        INTEGER,
  hall_map  INTEGER,
  hall_px   INTEGER,
  hall_py   INTEGER,
  cap_map   INTEGER,
  cap_px    INTEGER,
  cap_py    INTEGER,
  reported  INTEGER
);
INSERT OR IGNORE INTO company_farm_reach (map_id, hall_map, cap_map)
  SELECT f.map_id, (SELECT h.map_id FROM homes h WHERE h.guild_id = f.guild_id),
    (SELECT m.map_id FROM city_charter_members m WHERE m.guild_id = f.guild_id)
  FROM company_farms f;
-- A farm an older service writes after this migration gets the same row, so the hall-moved rule still applies to it.
CREATE TRIGGER IF NOT EXISTS company_farms_reach AFTER INSERT ON company_farms BEGIN
  INSERT OR IGNORE INTO company_farm_reach (map_id, hall_map, cap_map) VALUES (NEW.map_id,
    (SELECT map_id FROM homes WHERE guild_id = NEW.guild_id),
    (SELECT map_id FROM city_charter_members WHERE guild_id = NEW.guild_id));
END;
