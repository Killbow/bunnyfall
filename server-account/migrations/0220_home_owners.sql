-- Co-owners of a house: other characters on the main owner's account. homes.char_id stays the main owner.
-- When the main owner is deleted, the earliest-added living co-owner becomes the main owner.
CREATE TABLE IF NOT EXISTS home_owners (
  map_id       INTEGER NOT NULL,
  building_key INTEGER NOT NULL,
  char_id      TEXT NOT NULL,
  player       TEXT NOT NULL,
  added_at     INTEGER NOT NULL,
  PRIMARY KEY (map_id, building_key, char_id),
  FOREIGN KEY (map_id, building_key) REFERENCES homes (map_id, building_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_home_owners_char ON home_owners (player, char_id);
-- The character a house was offered to; null on offers made before co-owners.
ALTER TABLE home_offers ADD COLUMN buyer_char TEXT;
