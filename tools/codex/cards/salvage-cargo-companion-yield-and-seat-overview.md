---
slug: salvage-cargo-companion-yield-and-seat-overview
title: "Reforge Classic Refusal, Boat Cargo, Companion Yield, and Legacy Seat"
domain: gameplay
kind: overview
parent: null
files:
  - src/items/reforge.js
  - src/ui/reforgeWindow.js
  - src/ui/enhancedInventory.js
  - src/systems/naval/comeSailAway.js
  - src/systems/naval/etherCrossWorld.js
  - src/systems/quest/person.js
  - vendor/dfu-quests/Quests/A0C00Y12.txt
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-12d.md"
related:
  - companion-activation-yield-and-own-person
  - legacy-online-birth-seat-and-heir-guard
  - loot-arc-welkynd-salvage-reforge-and-imprint
  - naval-and-come-sail-away
  - quests-macros-and-main-spine
invariants:
  - "salvageRefusal asks salvageShards first; only an unmade piece with zero shards whose rarityOf is 'magic' is refused as 'classic'."
  - "boatCargoMod = clamp(2 - load/threshold, 0, 1): zero at twice the threshold, and it multiplies every oar/sail speed, acceleration and turn rate."
  - "cargoModWords is the single source of the cargo lines; the Eltheric crossing repeats them under its own mid-screen text."
traps:
  - "Testing the classic refusal before shards refused every found Magic piece."
  - "Made pieces still salvage for their tier; only the maker is refused ('self')."
dfu: []
tags:
  - salvage
  - cargo
  - ether-strand
  - decoy-thief
  - dfu-quest
---

# Reforge Classic Refusal, Boat Cargo, Companion Yield, and Legacy Seat

This overview covers classic magic salvage refusal, boat cargo load scaling, decoy thief placement, companion activation yield, and legacy family seat movement (`DECOY-THIEF`, `ALLY-YIELDS`, `SALVAGE-CLASSIC`, `ETHER-STRAND`, `HEIR-CLONE`, `BIRTH-START`, `SEAT-HOME`, `UNION-CHILDREN`, and `ALLY-RACE`).

- **Classic Salvage Refusal:** In `src/items/reforge.js`, `src/ui/reforgeWindow.js`, and `src/ui/enhancedInventory.js`, `salvageRefusal` evaluates `salvageShards` first (`SALVAGE_SHARDS` awards `1` shard for `magic`, `3` for `rare`, `8` for `legendary`, and `15` for `exalted`). Crafted items yield their tier shards unless salvaged by their own maker (`'self'`). Only an unmade item with zero shards whose `rarityOf` is `'magic'` returns `'classic'`. Checking `'classic'` before `salvageShards` previously blocked every found `magic` drop.
- **Boat Cargo Scaling (`ETHER-STRAND`):** In `src/systems/naval/comeSailAway.js` and `src/systems/naval/etherCrossWorld.js`, `Cargo.CargoThreshold` defaults to `500` multiplied by the hull `modifierCargoThreshold` (`CARGO_HOLD_MISSING` when a hull lacks one on the responsive helm) and the Hold refit. `boatCargoMod = clamp(2 - load/threshold, 0, 1)` drops to zero at twice the threshold and scales all oar and sail speeds, accelerations, and turn rates. `cargoModWords` provides the warning strings (`"You're going to need a bigger boat"` below `0.5`, and `"The boat draws a little lower than usual"` below `1`), which the Eltheric crossing repeats beneath its mid-screen prompt.
- **Decoy Thief (`DECOY-THIEF`):** In `vendor/dfu-quests/Quests/A0C00Y12.txt` and `src/systems/quest/person.js`, `_thiefFoe_` spawns by player presence at the house (`00:00` to `08:00`), store (`08:01` to `16:01`), or inn (`16:02` to `23:59`).
- **Subcards:** `companion-activation-yield-and-own-person` and `legacy-online-birth-seat-and-heir-guard`.
