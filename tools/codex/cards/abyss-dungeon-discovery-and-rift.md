---
slug: abyss-dungeon-discovery-and-rift
title: "Discovery, Dungeon Scaling, Rift, and Way Through"
domain: multiplayer
kind: subcard
parent: abyss-dungeons-overview
files:
  - src/net/sdLaw.js
  - src/world/sdDungeon.js
  - src/world/dungeonEnd.js
  - src/worldEvents/sdEnd.js
  - src/worldEvents/sdThrough.js
  - src/worldEvents/sdHost.js
  - src/scenes/world.js
  - src/world/smallerDungeons.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Super-Dungeons.md"
related:
  - abyss-dungeon-director-and-census
  - shattered-hour-orrery-and-steps
invariants:
  - "Exterior door distance checks use `shiftedDoor` in `src/scenes/world.js` so streaming-origin offsets do not skew discovery distances."
  - "Dungeon end selection (`src/world/dungeonEnd.js`) prefers interior enemy markers over border `B*` blocks and underwater markers."
traps:
  - "`shiftedDoor` is a local closure inside `src/scenes/world.js` rather than an exported symbol."
  - "`SD_FOUND_NEAR_M` (25 meters) is the client door test, whereas `SD_FOUND_RADIUS_M` (160 meters) is the relay acceptance radius around the map pixel center."
tags:
  - super-dungeons
  - dungeon
  - portal
  - difficulty
---

While a Hollow is in the `risen` phase, the game hides all map and compass markers until a player discovers the exterior door.

## Door Discovery and Online Sizing

When a player approaches within `SD_FOUND_NEAR_M` (25 meters) of the shifted exterior door (`shiftedDoor` in `src/scenes/world.js`), the client sends an `sd` frame with kind `found` (`sdfound` room key), retrying every `SD_FOUND_RESEND_MS` (15 seconds) until acknowledged (`src/net/sdLaw.js`). The relay verifies that the player is within `SD_FOUND_RADIUS_M` (160 meters) of the pixel center before promoting the Hollow to `found`.

Online dungeons normally draw deterministic sizes in `src/world/smallerDungeons.js` via `onlineDungeonSize` (weights 1 small, 2 medium, and 1 full by map ID, clamped by `dungeonSizeFor`), whereas an active Abyss Dungeon lays its qualifying labyrinth or keep template whole.

## Scaling, Rift, and Way Through

Inside (`src/world/sdDungeon.js`), elite expansion spawns 3 enemies per marker with `SUPER_HEALTH_SCALE` (4), `SUPER_DAMAGE_SCALE` (2.5), `SUPER_FOE_LEVEL_MIN` (24 via `superFoeLevel`), and `SUPER_ELITE_FOES` (6). Loot multipliers `SUPER_LOOT_DROP_MULT` and `SUPER_LOOT_QUALITY_MULT` both scale by 1.5, and dungeon campfires are omitted.

At the dungeon end (`src/worldEvents/sdEnd.js`), the Rift spans `SD_RIFT_MIN_M` (2.6 meters) to `SD_RIFT_SIZE_M` (7 meters), with Return offset by `SD_RETURN_GAP_M` (1.2 meters) and landing clearance `SD_LANDING_CLEAR_M` (0.4 meters). Once the hub stamps `inAt`, `sdThroughPlace` (`src/worldEvents/sdThrough.js`) opens a 2.6-meter (`SD_THROUGH_SIZE_M`) Way Through shortcut near the entrance, kept over `SD_THROUGH_NEAR_RIFT_M` (12 meters) from the Rift until the boss falls. Mid-stay despawn ejects the player once to `dungeonReturn.from`.
