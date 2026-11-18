-- BUNNYFALL: one shared, versioned set of playable beds per company farm.
CREATE TABLE IF NOT EXISTS company_farm_gardens (
  map_id INTEGER PRIMARY KEY REFERENCES company_farms(map_id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0,
  garden TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS company_farm_garden_work (
  map_id INTEGER NOT NULL REFERENCES company_farms(map_id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  account TEXT NOT NULL,
  bed INTEGER NOT NULL,
  PRIMARY KEY (map_id, day, account, bed)
);
