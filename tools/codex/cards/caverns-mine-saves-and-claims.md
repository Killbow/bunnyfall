---
slug: caverns-mine-saves-and-claims
title: "Caverns: Where a Mine Save Lands, and Two Miners' Claims"
domain: economy
kind: subcard
parent: caverns-mines-overview
files:
  - src/saves/mineSaveLanding.js
  - src/saves/bootLoadPlan.js
  - src/world/worldSaveLoad.js
  - src/scenes/dungeonContext.js
  - src/net/mine/mineReceipt.js
  - server-account/src/mineHaul.js
  - src/systems/mine/mineClient.js
  - src/professions/mineHost.js
routes:
  - /v1/mine/haul
  - /v1/prof/harvest
tables:
  - mine_hauls
related:
  - save-snapshots-and-character-identity
invariants:
  - "A save taken in a mine (`locationKey` `dungeon:2147480832`, or a map id carrying `MINE_SALT`) lands outside at that mine's pixel; `savedLanding` never lets its mine-local position stand in the world."
  - "A save stranded at the corner pixel (0,499), off the map or with a non-finite native position lands at the start cell."
  - "A haul receipt's `mine_hauls` id is `mine:reset:count:taker`, so two miners with one count are each paid once; ids from before the taker joined still read as banked."
traps:
  - "A mine has no map-table longitude or latitude, so the old dungeon envelope's pixel read as (0,499), the ocean: `dungeonHomeOf` names a mine's own pixel."
  - "`no-node` and `day-full` had no refusal words and fell to the generic service line. A transient haul failure is asked again: the receipt pays once."
tags:
  - caverns
  - saves
  - mining
---

# Caverns: Where a Mine Save Lands, and Two Miners' Claims

A mine is a made level (`MINE_LOCATION_ID`), so `dungeonHomeOf` (`src/saves/mineSaveLanding.js`) writes its own `px,py` into the dungeon envelope. A load, boot plan or world load asks `savedLanding` first: a mine save lands outside at the mouth's pixel, a lost mine at the start cell, a save already stranded in the corner at the start cell. Saves from older clients carry the corner pixel but the right map id, which `mineSiteOfMapId` inverts.

A cave vein harvest (`cvein:<mine>:<reset>:<slot>`) is per account and day, so two miners at one vein are both paid. The service answers `no-node` for a forged slot and `day-full` past `MINE_VEINS_PER_DAY`; the client closes that vein for the session (`closedCave`). `mineClient.haul` says each refusal in words and retries `offline`, `server` and `busy` claims.
