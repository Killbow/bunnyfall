---
slug: rest-arc-campfires-charges-and-dungeon-fires
title: "Reusable Campfires, Rest Items, and Dungeon Fires"
domain: systems
kind: subcard
parent: rest-arc-overview
files:
  - src/systems/survival/camp.js
  - src/systems/survival/camps.js
  - src/systems/survival/items.js
  - src/systems/survival/restItems.js
  - src/world/dungeonFires.js
  - src/scenes/dungeonContext.js
  - src/systems/naval/seasWorld.js
  - src/trade/shopStock.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Rest-Arc.md"
related:
  - rest-arc-overview
  - rest-arc-rest-act-channel-and-yield
  - homes-camps-guilds-and-territories
invariants:
  - "CAMPFIRE_USES = 8 charges (Campfire hitPoints, basePrice 40). Placing a Campfire spends nothing. spendCampNight spends one charge only when its owner sleeps there, and the last charge leaves the fire cold."
  - "A placed fire stays lit for FIRE_MINUTES = 480. A cold Campfire with fuel stands until its owner picks it up (packCamp returns its charges) or relights it. campExpired sweeps only fires without fuel of their own (Ember Jar, old-save kit fires)."
  - "fieldCookKeeps: a Field Cook's night at their own fueled Campfire (not an Ember Jar) spends no charge."
  - "CAMPS_PER_OWNER = 4: a new placing strikes the owner's oldest camps instead of being refused."
  - "dungeonFireCount = clamp(round(nonBorderBlocks / 3), 2, 7), halved (minimum 1) for elite dungeons. Online, no wandering spawn stands within DFIRE.wardM = 15 m of a placed fire (inFireWard)."
  - "`dungeonFirePlan` is pure over layout data and collider answers, compares squared distances only, and reads the classic flat height (`lawFoot`), so every client places the same dungeon fires with nothing on the wire."
traps:
  - "Leaving a dungeon returns the owner's fueled Campfires to the pack. Kit fires and Ember Jars stay behind with the dungeon."
  - "A deck camp whose ship is gone for DECK_GONE_S = 2 seconds is packed back to its owner (camps.js; validDeck bounds DECK_LOCAL_BOUND = 120)."
  - "`dungeonFirePlan` runs once at dungeon build, after movers and doors are hung and before `restoreSaveData` moves them; running it later lets saved poses change where fires land."
dfu: []
tags:
  - campfire
  - charges
  - dungeon-fires
  - rest-items
  - naval
---

# Reusable Campfires, Rest Items, and Dungeon Fires

Wilderness and dungeon rest points combine rechargeable Campfires, rest consumables, and procedural dungeon hearths (`src/systems/survival/camp.js`, `src/systems/survival/camps.js`, `src/world/dungeonFires.js`).

## Charged Campfires, Consumables, and Naval Decks

- **Charges and fuel (`src/systems/survival/camp.js`, `src/systems/survival/items.js`, `src/systems/survival/restItems.js`):** A Campfire (`basePrice` `40`, `FIRE_FLAT = { archive: 210, record: 1 }`, tent mesh `TENT_MODEL = 41606`) stores `CAMPFIRE_USES = 8` charges in `hitPoints`. Pitching costs nothing; `spendCampNight` spends one charge when the owner sleeps there (skipped by `fieldCookKeeps` for a Field Cook at an owned fueled Campfire), and Firewood restores `FIREWOOD_NIGHTS` (`3`) charges.
- **Burn duration and cleanup (`src/systems/survival/camps.js`, `src/systems/naval/seasWorld.js`):** Lit fires burn for `FIRE_MINUTES` (`480`). Cold fueled Campfires remain until relit or packed via `packCamp`, while `campExpired` sweeps Ember Jars (`EMBER_JAR_MINUTES = 180`) and legacy kit fires. Consumables include Waking Salts (`SALTS_MINUTES = 60`) and Sleeping Draught (`DRAUGHT_SPENT_MINUTES = 60`). Owners keep up to `CAMPS_PER_OWNER` (`4`) camps, evicting the oldest on overflow. Leaving a dungeon or losing a ship deck for `DECK_GONE_S` (`2` s, `validDeck` bound `DECK_LOCAL_BOUND = 120`) auto-packs fueled Campfires.

## Dungeon Hearths and Spawn Wards

- **Placement and ward (`src/world/dungeonFires.js`, `src/scenes/dungeonContext.js`):** `dungeonFireCount` places `clamp(round(nonBorderBlocks / 3), 2, 7)` hearths (halved, minimum `1`, in elite dungeons) under `DFIRE` (`doorM` `3`, `enemyM` `8`, `spacingM` `80`, `entranceM` `25`, `min` `2`, `max` `7`, `perBlocks` `3`). Online, `inFireWard` blocks wandering spawns within `DFIRE.wardM` (`15` m).
