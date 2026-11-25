---
slug: spawned-dungeons-rebirth-overview
title: "Spawned Dungeons: First-Entry Clocks, Expiry, Rebirth, and Spawn Ledger"
domain: world
kind: overview
parent: null
files:
  - src/world/spawnedDungeons.js
  - src/world/overworldSpawns.js
  - src/scenes/dungeonContext.js
  - src/scenes/world.js
  - src/saves/save.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-12h.md"
related:
  - spawned-dungeons-cell-ledger-keep-law
  - shared-ground-spawn-roll-agree
  - travel-view-overworld-overview
invariants:
  - "A spawned dungeon clock starts only on first entry (`onDungeonSpawned` in `src/scenes/dungeonContext.js` -> `_spawnSeen` in `src/world/overworldSpawns.js`); streaming or walking past a pixel never starts it."
  - "`spawnDeath` equals `min(cleared + CLEARED_TTL_MINUTES, seen + GENERAL_TTL_MINUTES)` (`2` and `7` game days), `spawnExpired` holds during `[death, death + REBIRTH_TTL_MINUTES)` (`REBIRTH_TTL_DAYS = 12`), and `spawnReborn` stands the same `(px, py)` hash template on fresh clocks afterward."
  - "In `createSpawnLedger` (`src/world/spawnedDungeons.js`), `note` and `clear` start a new life over reborn rows, `merge(key, seen, cleared, now = NaN)` min-merges while dropping heard reborn rows, `toJSON` omits reborn rows at the last finite clock, and `load()` resets the clock to `NaN`."
traps:
  - "Wild Zone halls (`wildHall`) and `superTier` sites are excluded in `_spawnSeen` and `_locationToBuild`."
  - "Default `merge` `now` to `NaN` so cell welcome rows arriving before `playerTicker` initializes are not discarded, and never treat negative elapsed time from loading an older save as expiry."
dfu: []
tags:
  - spawned-dungeons
  - ttl
  - rebirth
  - overworld
  - saves
---

# Spawned Dungeons: First-Entry Clocks, Expiry, Rebirth, and Spawn Ledger

Overworld spawned dungeons start their clock on first entry, stay dormant through rebirth after expiry, and return on fresh clocks.

- **Clocks and rebirth (`src/scenes/dungeonContext.js`, `src/world/overworldSpawns.js`, `src/scenes/world.js`):** Clocks start on first entry (`onDungeonSpawned` -> `_spawnSeen`), never when walking past; `wildHall` and `superTier` sites are excluded in `_spawnSeen` and `_locationToBuild`. `spawnDeath` equals `min(cleared + CLEARED_TTL_MINUTES, seen + GENERAL_TTL_MINUTES)` (`2` and `7` game days; `14` real hours at `ONLINE_MINUTES_PER_MS = 12`). `spawnExpired` holds during `[death, death + REBIRTH_TTL_MINUTES)` (`REBIRTH_TTL_DAYS = 12`, or `24` real hours), then `spawnReborn` stands the `(px, py)` template on fresh clocks.
- **Spawn ledger (`src/world/spawnedDungeons.js`, `src/saves/save.js`):** In `createSpawnLedger`, `note` and `clear` start a new life over reborn rows, `merge(key, seen, cleared, now = NaN)` min-merges while dropping heard reborn rows, `toJSON` omits reborn rows at the last finite clock, and `load()` resets the clock to `NaN`. Default `now` to `NaN` so welcome rows arriving before `playerTicker` are kept, and never treat negative elapsed save time as expiry.
