---
slug: searchables-overview
title: "Searchables, Dungeon Room Records, and Overworld Grave Ledger"
domain: items
kind: overview
parent: null
files:
  - src/items/searchables.js
  - src/scenes/dungeonContext.js
  - src/scenes/worldModes.js
  - src/ui/actionText.js
  - src/characters/dungeonEnemies.js
  - src/scenes/exterior.js
  - src/items/searchRoom.js
  - src/characters/searchPartyHost.js
  - src/net/overworldLaw.js
  - src/net/wire.js
  - src/net/online.js
  - server/src/world/overworld.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Searchables.md"
related:
  - searchables-enemy-loot-cap-and-elite-rare
  - loot-rarity-ladder-overview
  - lockpick-item-stock-and-loot
  - shared-room-loot-champion-base-overview
  - travel-view-overworld-overview
invariants:
  - "SEARCH_REACH = DOOR_ACTIVATION_DISTANCE / 2 (64 units), measured from the body capsule to the box via searchReachFor, not from the eye."
  - "SEARCH_COOLDOWN_MINUTES = 5 * 60 per object, persisted under the Searchables save vendor."
  - "A find holds at most SEARCH_LOOT_MAX = 4 items, and the first item is gold."
  - "Chest and crate spawns exclude WATER_SPECIES (Slaughterfish, Dreugh, Lamia)."
  - "A party search spawns `SEARCH_FOES_PER_PLAYER = 2` enemies per player present. Only the named enemy may be elite."
  - "Foreign dungeon records are bounded by SEARCH_FOREIGN_PER_OBJECT = 4, SEARCH_FOREIGN_MAX = 24 and SEARCH_FOREIGN_BYTES = 4096. Their timestamps must never exceed server time."
  - "Overworld grave rows are [px, py, n, minute, acct, name], kept for OW_GRAVE_KEEP_MIN = 5 * 60 minutes."
  - "Each cell holds at most OW_GRAVE_ACCT_ROWS_MAX = 32 rows per account (GRAVE_OWED_MAX = 32 client side) and OW_CELL_GRAVES_MAX = 128 in total."
  - "owGraveGate allows 1 Hz with a burst of 4 (OW_GRAVE_HZ_MAX, OW_GRAVE_BURST_MAX)."
traps:
  - "Cupboards (models 41003/41004) are not searchable."
  - "Building interiors have no searchables. scenes/exterior.js registers no graveTargets."
  - "A spawned enemy or a loot container opens only after the parchment box closes (onClose)."
  - "A relay below OW_GRAVE_RELAY_MIN closes the socket on `gr`. Gate sends on relaySupportsOwGraves, and never hardcode a relay version."
  - "The cooldown is per account: an alt character sees 'Already searched by <name>.' (searchedText)."
  - "Headstone loot drops at the feet of the searcher and is not a shared container."
  - "Standalone dungeon.js has no room lens, so every search word is treated as local."
dfu: []
tags:
  - searchables
  - graves
  - dungeon
  - party
  - overworld
---

# Searchables, Dungeon Room Records, and Overworld Grave Ledger

`src/items/searchables.js` governs interactive dungeon props and exterior headstones within `SEARCH_REACH = DOOR_ACTIVATION_DISTANCE / 2` (`64` units via `searchReachFor`), enforcing an account-wide `SEARCH_COOLDOWN_MINUTES = 5 * 60` cooldown under the `Searchables` save vendor (`searchedText`). Cupboards (`41003`, `41004`) and building interiors are excluded, and `src/scenes/exterior.js` registers no `graveTargets`.

- **Rolls, spawns, and finds (`dungeonContext.js`, `dungeonEnemies.js`, `actionText.js`, `searchPartyHost.js`):** Dungeons roll `1/3` enemy, `1/3` find, and `1/3` nothing; headstones roll `2/3` nothing, `1/6` enemy, and `1/6` find. Graves, coffins, and shelves raise level-scaled undead while chests and crates draw layout species excluding `WATER_SPECIES`. One in three chests or crates is locked (level `1` to `15`). Party ambushes spawn `SEARCH_FOES_PER_PLAYER = 2` enemies per player, with a 50% elite roll on the named enemy; spawns and loot containers open on `onClose`. Finds cap at `SEARCH_LOOT_MAX = 4` items (gold first) and register in `nearbyLootRecords`.
- **Room sync and overworld graves (`searchRoom.js`, `overworldLaw.js`, `wire.js`, `online.js`, `overworld.js`):** Dungeon searches broadcast `srch:<i>` (`SEARCH_FOREIGN_PER_OBJECT = 4`, `SEARCH_FOREIGN_MAX = 24`, `SEARCH_FOREIGN_BYTES = 4096`); rival parties roll independent finds, while standalone `dungeon.js` stays local. Headstone loot drops at the feet of the searcher and syncs via `gr` (`owFoldGraves`, `_owGraves`, gated by `relaySupportsOwGraves` at `OW_GRAVE_RELAY_MIN = 212`, `OW_GRAVE_KEEP_MIN = 5 * 60`, `OW_GRAVE_ACCT_ROWS_MAX = 32`, `GRAVE_OWED_MAX = 32`, `OW_CELL_GRAVES_MAX = 128`, and `owGraveGate` at `OW_GRAVE_HZ_MAX = 1`, `OW_GRAVE_BURST_MAX = 4`).
