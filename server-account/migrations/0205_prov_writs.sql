-- BUNNYFALL PROVISIONING WRITS: a pot make keeps the dish it sorts into (provisionLaw.js dishTemplateOf - a stew 685, a
-- supper 686, a tart 687, a feast 688), the dish writ it may fill. The makes before this, sorted the same way.
ALTER TABLE prov_makes ADD COLUMN dish INTEGER;
UPDATE prov_makes SET dish = CASE
  WHEN party = 1 THEN 688
  WHEN name GLOB '*Supper' THEN 686
  WHEN name GLOB '*Tart*' OR name GLOB '*Bread*' OR name GLOB '*Pie*' OR name GLOB '*Mead*' OR name GLOB '*Ale*' OR name GLOB '*Cider*' OR name GLOB '*Tea*' THEN 687
  ELSE 685 END
WHERE kind = 'pot';
CREATE INDEX IF NOT EXISTS prov_makes_char ON prov_makes (player, char_id, kind);
