---
slug: reforge-kept-names-road-sparing-and-crown-glints-overview
title: "Reforge Kept Names, Road Bystander Sparing, Broker Marks, and Crown Glints"
domain: items
kind: overview
parent: null
files:
  - src/items/lootRarity.js
  - src/items/reforge.js
  - src/saves/save.js
  - src/systems/livingWorld/roadStrike.js
  - src/systems/livingWorld/roadStands.js
  - src/characters/cityGuards.js
  - src/characters/encounters.js
  - src/characters/exteriorFoes.js
  - src/scenes/world.js
  - src/scenes/exterior.js
  - src/worldEvents/sigilBroker.js
  - src/render/nodeGlint.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-25i.md"
related:
  - quest-item-clones-decor-draft-journal-and-dupe-lift
  - hung-shop-signs-body-pass-and-fence-rail-headroom
  - loot-ii-reforge-honing-scry-and-sockets
  - living-world-roads-trips-and-encounters
  - sigil-broker-daily-stock-and-dismantle
  - professions-gathering-nodes-and-motherlodes
invariants:
  - "`reforgeAffix` builds names via `linesName(item, tier, was)` (`src/items/lootRarity.js`), rebuilding affix words around the base name only on standard tier names while preserving custom or Masterwork names; `repairCraftedNames` runs on save load."
  - "`src/systems/livingWorld/roadStrike.js` checks `cityGuards.playerSparesPerson` for road travelers and returns `ROAD_SPARED` (zero damage, no crime report, no door damage), while `roadStands.js` records slayings only when `killedBy` (`src/characters/exteriorFoes.js`) names the player."
  - "`fightNear` (`src/characters/encounters.js`) counts nearby combat in the spawn band toward bystander protection, and dismantling a Sigil Broker ware (`wareName` in `src/worldEvents/sigilBroker.js`) retains its once-per-day purchase mark."
  - "In `src/render/nodeGlint.js`, tree crown height equals `t.run.size[1] * row[4]`, with `glintCrownGrowth` capped at `GLINT_CROWN_GROWTH = 2` (`GLINT_COUNT` `6` to `12`, `GLINT_PX` `14` to `28` at `GLINT_REF_ROWS = 1080`)."
traps:
  - "Player-given names lost to the old law cannot be recovered; repairCraftedNames only fixes crafted base names."
  - "Broker UI strings remain hardcoded English (AUDIT A9)."
dfu:
  - Assets/Scripts/SettingsManager.cs
  - Assets/Scripts/Utility/AssetInjection/MeshReplacement.cs
tags:
  - reforge
  - bystanders
  - sigil-broker
  - glints
---

# Reforge Kept Names, Road Bystander Sparing, Broker Marks, and Crown Glints

Reforging (`src/items/reforge.js`, `src/items/lootRarity.js`) updates item display names through `linesName(item, tier, was)`, while road traveler protection (`src/systems/livingWorld/roadStrike.js`, `src/systems/livingWorld/roadStands.js`), Sigil Broker stock (`src/worldEvents/sigilBroker.js`), and tree glints (`src/render/nodeGlint.js`) govern exterior hits, daily vendor limits, and foliage particle bounds.

## Reforge Name Preservation and Broker Marks

- **Affix naming (`src/items/lootRarity.js`, `src/saves/save.js`):** `reforgeAffix` calls `linesName(item, tier, was)` to rebuild prefix and suffix words around the base name only when the item still bears a standard generated tier name. Custom player names and Masterwork titles remain untouched. On save load, `repairCraftedNames` restores crafted base names overwritten by earlier reforge passes, though lost custom names cannot be recovered.
- **Sigil Broker stock (`src/worldEvents/sigilBroker.js`):** Buying a daily ware records its purchase mark by `wareName`; dismantling that item does not clear the once-per-day purchase record.

## Road Bystander Sparing and Crown Glints

- **Road protection (`src/systems/livingWorld/roadStrike.js`, `src/characters/cityGuards.js`, `src/characters/encounters.js`):** Following the DFU `MeleeAttackFriendlyProtection` (`Assets/Scripts/SettingsManager.cs`) model, `roadStrike.js` checks `cityGuards.playerSparesPerson` (with `fightNear` in `encounters.js` detecting active combat across the spawn band) and returns `ROAD_SPARED` in `src/scenes/world.js` and `src/scenes/exterior.js`, blocking damage, crime reports, and spillover door hits. `roadStands.js` logs traveler deaths only when `killedBy` (`src/characters/exteriorFoes.js`) identifies the player.
- **Crown glints (`src/render/nodeGlint.js`):** Using low-poly crown prototypes from `readLowPolyTrees` and shader `glintLife`, tree crown height is `t.run.size[1] * row[4]`, and `glintCrownGrowth` scales particle count (`GLINT_COUNT` `6` to `12`) and size (`GLINT_PX` `14` to `28` at `GLINT_REF_ROWS = 1080`) up to `GLINT_CROWN_GROWTH = 2`.
