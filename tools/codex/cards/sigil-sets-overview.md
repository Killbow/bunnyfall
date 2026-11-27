---
slug: sigil-sets-overview
title: "Sigil Sets: Set Pieces, Tiers, Aetheric Sets, and the Sigil Broker"
domain: items
kind: overview
parent: null
files:
  - src/items/sigil.js
  - src/items/sigilSets.js
  - src/items/sigilSetPowers.js
  - src/items/setReach.js
  - src/items/aetheric.js
  - src/worldEvents/sigilBroker.js
  - src/ui/setCard.js
  - src/net/onlineWorld.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Sigil-Sets.md"
related:
  - sigil-set-pieces-tiers-and-stage-growth
  - aetheric-sets-and-set-powers
  - sigil-broker-daily-stock-and-dismantle
  - breach-rite-broker-and-multi-court
  - dagons-breach-world-boss
invariants:
  - "A set piece is an item whose sigil names one of `SIGIL_SET_IDS` (14 ids) and whose `setPieceKind` is armor, shield, or non-ammunition weapon."
  - "`SET_TIERS` is `[2, 4, 6]`; the active stage for a set is the lowest among its worn pieces, capped by the Renown stage of the player."
  - "Sets wake only when `setsAwake()`: online, Renown known, and not dueling (`setSetsDueling` is driven by duels and arena PvP in src/net/onlineWorld.js)."
traps:
  - "Only the four non-Aetheric sets (`WORLD_SET_IDS`: malacath, dagon, nocturnal, mora) roll from ordinary loot; every other set is Aetheric and source-specific."
  - "Only the local player's own entity is ever awake (`awakeTier` returns null for peers and enemies)."
  - "No tier brief may run past `BRIEF_MAX` (32 characters) at any stage, and nothing in code or tests enforces this."
dfu: []
tags:
  - sigil
  - sets
  - aetheric
  - broker
  - loot
  - online
---

# Sigil Sets: Set Pieces, Tiers, Aetheric Sets, and the Sigil Broker

Sigil Sets add 14 named equipment sets (`SIGIL_SET_IDS`), five-stage Renown scaling, Aetheric boss drops, and the Sigil Broker across `src/items/sigil.js`, `src/items/sigilSets.js`, `src/items/sigilSetPowers.js`, `src/items/aetheric.js`, and `src/worldEvents/sigilBroker.js`.

## Set Architecture and Online Gating

- **Eligible items (`sigil.js`, `sigilSets.js`):** An item is a set piece when its sigil names one of `SIGIL_SET_IDS` and `setPieceKind` is armor, shield, or a non-ammunition weapon. `RARITY_ORDER` runs `common`, `magic`, `rare`, `legendary`, `aetheric`, `artifact`, and `gilded`. Only the four world sets (`WORLD_SET_IDS`: `malacath`, `dagon`, `nocturnal`, and `mora`) roll from ordinary loot; the other ten are Aetheric sets.
- **Tiers and wake gate (`sigilSets.js`, `sigilSetPowers.js`, `onlineWorld.js`):** Wearing `SET_TIERS` (`[2, 4, 6]`) pieces activates bonuses in `src/items/sigilSetPowers.js` (folds, blow mods, combat listeners, and death saves). The active stage is the lowest stage among worn pieces of that set, capped by the Renown stage of the player. Sets wake only for the local player (`awakeTier` returns `null` for peers and enemies) while `setsAwake()` holds (online, Renown known, and not dueling via `setSetsDueling`).
- **UI and currency (`setCard.js`, `world.js`, `sigilBroker.js`):** Views render via `setCardView`, `setLines`, `setStrip`, `markSetFrame`, and `setHudSetChips`. Currency displays as Deadlands Embers (`stonesText`).

## Subcards

- `sigil-set-pieces-tiers-and-stage-growth`: sigil validation, slot counting, stages, and catch-up XP.
- `aetheric-sets-and-set-powers`: stamped Aetheric catalogs, drop odds, and combat proc guards.
- `sigil-broker-daily-stock-and-dismantle`: UTC daily stock, bound wares, and dismantle refunds.
