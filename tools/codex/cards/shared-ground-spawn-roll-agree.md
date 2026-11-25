---
slug: shared-ground-spawn-roll-agree
title: "Spawned Dungeon Ground Roll Agreement"
domain: world
kind: subcard
parent: shared-ground-agreement-overview
files:
  - src/world/spawnGroundPlace.js
  - src/world/spawnedDungeons.js
  - src/world/overworldSpawns.js
  - src/world/landformLiftWorld.js
  - src/world/pixelBuild.js
  - src/world/terrainTiles.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-24b.md"
related:
  - shared-ground-agreement-overview
  - roads-painter-seam-and-paths-mask
invariants:
  - "`groundLocationAt(px, py, stood)` returns the stood location, else online the roll's spawn via `spawnAt(px, py, { clocks: false })`."
  - "No ground spawn offline, past the Veil (ether sea), in the open zone, on ocean, wet plateau, or a path-crossed pixel."
  - "Pixel build uses the ground location for blend, tiles and `hasLocation`; `_liftLocationAt` reads it for unbuilt pixels."
  - "Ruin blocks, door, enemies and `tvSpawnGone` still follow TTL1 clocks; a dead spawn keeps its levelled clearing."
traps:
  - "Never read clocks or `_insideSpawn` when shaping ground: clients on either side of a death/return diverge."
dfu: []
tags:
  - spawned-dungeons
  - ground
  - ttl
---

# Spawned Dungeon Ground Roll Agreement

Overworld spawned dungeons level their terrain footprint from timeless deterministic roll rules so every online peer shapes identical ground regardless of local spawn clocks (`src/world/spawnGroundPlace.js`, `src/world/spawnedDungeons.js`, `src/world/overworldSpawns.js`).

- **Clockless Ground Location (`src/world/spawnGroundPlace.js`, `src/world/spawnedDungeons.js`, `src/world/overworldSpawns.js`):** `groundLocationAt(px, py, stood)` returns the `stood` location if present, or in online mode evaluates the deterministic spawn roll via `spawnAt(px, py, { clocks: false })` using `SPAWN_CHANCE` (`0.30`) and `ELITE_CHANCE` (`0.10`). No ground spawn occurs offline, beyond the Veil in the ether sea, inside the open zone, on ocean or wet plateau pixels, or on any pixel crossed by a path.
- **Terrain Shaping and Lifespan Clocks (`src/world/landformLiftWorld.js`, `src/world/pixelBuild.js`, `src/world/terrainTiles.js`):** Pixel building resolves the ground location for height blending, terrain tiles, and `hasLocation`, while `_liftLocationAt` queries it for unbuilt pixels. Surface props, ruin blocks, dungeon doors, exterior enemies, and `tvSpawnGone` still obey `TTL1` timers (`7` days after entry, `2` days after clearing, and `12` days dead before returning), leaving a leveled clearing while a spawn is dead. Ground shaping must never inspect clocks or `_insideSpawn`, or clients across a death boundary will diverge.
