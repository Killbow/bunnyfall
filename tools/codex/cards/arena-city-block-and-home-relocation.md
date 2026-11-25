---
slug: arena-city-block-and-home-relocation
title: "Arena City Block, Models, and Displaced Homes"
domain: world
kind: subcard
parent: arena-colosseum-overview
files:
  - src/world/arenaCity.js
  - src/world/arenaFloor.js
  - src/world/arenaModel.js
  - src/world/arenaPlaques.js
  - src/world/arenaUndercroft.js
  - src/world/customModels.js
  - src/arena/arenaMove.js
  - server-account/src/homes.js
  - server-account/src/halls.js
  - server-account/migrations/0075_arena4b.sql
routes:
  - /v1/homes/arena-move
  - /v1/homes/arena-moves
  - /v1/homes/arena-seen
tables:
  - homes
  - home_moves
  - home_decor
  - home_hidden
  - home_rooms
replacesBible:
  - "11-Multiplayer/Arena.md"
related:
  - arena-colosseum-overview
  - homes-camps-guilds-and-territories
invariants:
  - "The colosseum replaces `GEMSAL03` at Daggerfall City cell `(4, 3)` with `ARENADAG.RMB`, registered at `ARENA_BLOCK_INDEX = 900100`."
  - "Colosseum mesh `864102` is registered in `NO_CLIMATE_REMAP` (`isClimateFreeModel`) so it renders its own textures without climate remapping."
  - "Player homes displaced from `GEMSAL03` relocate to a house of matching building type outside the cell (`arenaHouseFor` and `arenaHomeFor`), moving loose items into the first container of the new home or a generated crate."
traps:
  - "`ARENADAG.RMB` is a custom block cut from `DFARENA.RMB` and shipped as vendored JSON, not loaded from classic `ARENA2` archives."
  - "Account-server home relocations record once per `(map_id, old_key)` in `home_moves`, and `arenaMoveHome` must stay idempotent across repeated logins."
dfu: []
tags:
  - arena
  - rmb
  - city
  - homes
  - relocation
  - models
  - automap
---

# Arena City Block, Models, and Displaced Homes

In `src/world/arenaCity.js`, Daggerfall City cell `(4, 3)` swaps its classic `GEMSAL03` residential block for `ARENADAG.RMB` at `ARENA_BLOCK_INDEX = 900100`, a vendored JSON block derived from `DFARENA.RMB`. `arenaAutoMap` and `arenaTownLandmark` tint the exterior automap and town overview, while `ARENA_PLAZA_FLATS` populates the surrounding plazas and `src/world/arenaUndercroft.js` builds the gate interior.

## Custom Meshes, Plaques, and Idempotent Home Migration

- **Climate-free models (`src/world/arenaModel.js`, `src/world/arenaFloor.js`, `src/world/arenaPlaques.js`, `src/world/customModels.js`):** The main colosseum structure (`864102`), sand floor and banner rig (`ARENA_GROUND_MODEL` and `ARENA_BANNER_MODEL` at `864103`), and Hall of Champions plaques (`PLAQUE_MODEL = 864110`, `PLAQUE_BARE_MODEL = 864111`) bypass climate texture swapping via `NO_CLIMATE_REMAP`. `arenaStairRuns` computes walkable stair geometry directly from the colosseum mesh.
- **Displaced home relocation (`src/arena/arenaMove.js`, `server-account/src/homes.js`, `server-account/src/halls.js`, `server-account/migrations/0075_arena4b.sql`):** When a save or account owns a building inside the replaced `GEMSAL03` footprint, `arenaHouseFor` and `arenaHomeFor` assign a replacement building of the same type elsewhere in Daggerfall City, and `arenaRecordDisplaced` remaps the saved building keys.
- **Inventory and D1 sync:** Offline and online migrations transfer stored items into the first container at the new address (or spawn a crate when none exists) and synchronize `homes`, `home_moves`, `home_decor`, `home_hidden`, and `home_rooms` over `/v1/homes/arena-move`, `/v1/homes/arena-moves`, and `/v1/homes/arena-seen`.
