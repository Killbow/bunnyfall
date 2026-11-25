---
slug: "doorless-graveyard-check-and-revenant-lair-mending"
title: "Doorless Graveyard Detection and Revenant Lair Chebyshev Relocation"
domain: "world"
kind: "subcard"
parent: "gifted-shield-merge-and-cast-level-cap-overview"
files:
  - "src/world/lairHost.js"
  - "src/revenants/revenant.js"
  - "src/revenants/revenantFeud.js"
  - "src/world/meshReader.js"
  - "src/travel/travelDungeonModels.js"
  - "src/world/locationLayout.js"
  - "src/world/spawnedDungeons.js"
  - "src/world/wildDungeons.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-22d.md"
related:
  - "gifted-shield-merge-and-cast-level-cap-overview"
  - "revenant-lairs-thefts-and-companions"
  - "revenant-lair-reach-and-single-body"
  - "revenants-lifecycle-overview"
invariants:
  - "`createLairDoor` (`src/world/lairHost.js`) marks `enterable(px, py)` true only when laid location blocks contain a dungeon-entrance door (`blocksPlaceEntrance` with `meshHasDungeonEntrance`) and, online, lie outside the Wild Zone."
  - "`nearest` scans a Chebyshev ring up to `LAIR_MEND_PX = RUMOR_PX` (`20` px, excluding `(px, py)` itself), caching results per skin, pixel, and model ID."
  - "`mendRevenantLairs` (`src/revenants/revenant.js`) waits until `_state.mirrorId` is loaded and checks each record once per lair pixel."
traps:
  - "Running `mendRevenantLairs` before `ensureMirror` allows the incoming mirror snapshot to overwrite repaired lair coordinates."
  - "If no enterable dungeon exists within `20` px, a Dread revenant retains its original lair while any other revenant clears `lair = null`, `lairKnown = false`, and `trail = 0`."
dfu: []
tags:
  - "revenants"
  - "lairs"
  - "graveyards"
  - "dungeons"
---

# Doorless Graveyard Detection and Revenant Lair Chebyshev Relocation

Graveyard blocks `GRVEAS10.RMB` and `GRVEAS36.RMB` carry `hasDungeon` in `MAPS.BSA` without placing an entrance door (`archive` `56` or `331`). Revenant lair selection and save migration verify physical entrance doors and relocate stranded lairs across `src/world/lairHost.js`, `src/revenants/revenant.js`, and `src/revenants/revenantFeud.js`.

- **Physical entrance verification (`src/world/lairHost.js`, `src/world/meshReader.js`, `src/travel/travelDungeonModels.js`, `src/world/locationLayout.js`):** `createLairDoor` marks `enterable(px, py)` true only when laid exterior blocks contain a dungeon-entrance door via `blocksPlaceEntrance` and `meshHasDungeonEntrance`, while excluding spawned or online Wild Zone dungeons (`src/world/spawnedDungeons.js`, `src/world/wildDungeons.js`).
- **Chebyshev search and mirror-gated mending (`src/world/lairHost.js`, `src/revenants/revenant.js`, `src/revenants/revenantFeud.js`):** When a lair pixel lacks a door, `nearest` scans a Chebyshev ring up to `LAIR_MEND_PX = RUMOR_PX` (`20` px, excluding `(px, py)` itself) and caches results per skin, pixel, and model ID. `mendRevenantLairs` waits until `_state.mirrorId` is loaded after `ensureMirror` so an incoming mirror snapshot cannot overwrite repaired coordinates, checking each record once per lair pixel. If no enterable dungeon exists within `20` px, a Dread revenant keeps its original lair while any other revenant clears `lair = null`, `lairKnown = false`, and `trail = 0`.
