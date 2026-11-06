-- BUNNYFALL (2026-11-06, the owner: "add 500 to the nyx coins global counter each time it fires"): the realm's count of
-- Nyx coins (server-account/src/nyx.js nyxTotal) carries the Great Cannon's own - CANNON_NYX_BONUS a shot, added in the
-- same write that fires it (server-account/src/cannon.js), so a shot is counted once.
ALTER TABLE cannon ADD COLUMN nyx_bonus INTEGER NOT NULL DEFAULT 0;
