-- BUNNYFALL (2026-11-04, Cromwark): the Nyx coins an account found in the reach of Cromwark (src/systems/wild/nyxShop.js),
-- and what Nyx's titles cost of them (src/net/insignia.js `currency: 'nyx'`). /nyxcoin reads the realm's sum.
ALTER TABLE players ADD COLUMN nyx_found INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN nyx_spent INTEGER NOT NULL DEFAULT 0;
