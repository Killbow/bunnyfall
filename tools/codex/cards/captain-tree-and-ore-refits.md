---
slug: captain-tree-and-ore-refits
title: "Captain Star Tree and Ore Refit Tiers"
domain: economy
kind: subcard
parent: naval-refit-overview
files:
  - src/systems/naval/captainTree.js
  - src/systems/naval/captainLedger.js
  - src/ui/captainTreeWindow.js
  - src/systems/naval/fleet.js
  - src/systems/naval/fleetHost.js
replacesBible:
  - "03-World/Naval-Refit.md"
related:
  - naval-refit-overview
  - naval-shot-kinds-and-combat-feedback
  - professions-crafting-provenance-and-master-art
  - economy-ledger-and-item-judge
invariants:
  - "Captain level derives from `captainXpOf(log)` through `levelOf` and caps at `CAPTAIN_LEVEL_MAX` (`30`), with `starPoints(level)` granting `level - 1` points (at most `29`)."
  - "`xpForLevel(L)` evaluates `Math.round(100 * (L - 1) ** 1.6)`."
  - "`CAPTAIN_STARS` defines `38` stars (`1` Helm root, `19` Master stars, and `18` Commander stars), with `CAPTAIN_CROSS` linking neighboring branches."
  - "`refundable(held, id)` permits refunding a star only when `takesBack(held, id).length === 1`, ensuring no remaining held star loses its connection to the Helm."
  - "`meltable(item)` rejects items that are equipped, locked, bound, summoned, quest-flagged, artifacts, sigils, player-crafted (`provenance`), enchanted, magic, non-common, affixed, legendary, or socketed."
traps:
  - "Ore refit tiers sit above `BASE_TIERS`; always index `ORE_TIERS` via `ORE_TIERS[tier - BASE_TIERS]` rather than the raw upgrade tier."
  - "Saved skies store held stars by id and `heldStars` drops ids it does not know, so a star keeps its id even when its stats change."
tags:
  - naval
  - captain
  - skill-tree
  - refit
  - ores
---

Maritime progression pairs a 38-node captain skill constellation driven by logbook deeds with nine ore-melting shipyard refit tiers above standard shipwright upgrades.

## Captain Experience and Star Constellation

`captainXpOf(log)` and `levelOf(xp)` (`src/systems/naval/captainLedger.js`) compute captain rank from recorded naval deeds and trade profit (`CAPTAIN_XP`, `TRADED_GOLD = 40`). Levels follow `xpForLevel(L) = Math.round(100 * (L - 1) ** 1.6)` up to `CAPTAIN_LEVEL_MAX` (`30`), and `starPoints(level)` grants `level - 1` points (`29` maximum).

`CAPTAIN_STARS` (`src/systems/naval/captainTree.js`) arranges `38` nodes around the central Helm root across `19` Master stars (sailing, cargo, repair, and trade) and `18` Commander stars (gunnery, ammunition specialties, and boarding), bridged by `CAPTAIN_CROSS` links. `heldStars` and `starStats` aggregate bonuses across the `15` keys in `CAPTAIN_STATS`: `way`, `oars`, `turn`, `cargo`, `hull`, `repair`, `trade`, `harm`, `reload`, `aim`, `grape`, `chain`, `heated`, `boarders`, and `reach`. In `src/ui/captainTreeWindow.js`, `refundable(held, id)` allows unallocating a star only when `takesBack(held, id).length === 1` so every remaining allocated star stays connected to the Helm.

## Ore Refit Tiers and Melting Rules

Above `BASE_TIERS`, `ORE_TIERS` (`src/systems/naval/fleet.js`) defines nine metallic refit steps from Steel (captain level `3`, `6000` gold, `4` items) through Daedric (captain level `28`, `70000` gold, `8` items), each adding `ORE_PER` (`0.5`) of a base shipwright tier. `refitMetalOf`, `materialCount`, `materialsFor`, `upgradeCost`, and `refitShare` calculate costs and stat scaling. To supply metal pieces, `meltable(item)` accepts only unequipped, unlocked, unbound, unsummoned, non-quest, common, unenchanted, unaffixed, unsocketed loot items without player `provenance`, artifacts, or sigils.
