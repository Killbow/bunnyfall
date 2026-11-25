---
slug: "gifted-shield-merge-and-cast-level-cap-overview"
title: "Gifted Spell Incumbent Merging, Cast Level Cap, and Exact Quest Marks"
domain: "magic"
kind: "overview"
parent: null
files:
  - "src/magic/effects.js"
  - "src/magic/allyCast.js"
  - "src/net/wire.js"
  - "src/characters/playerEntity.js"
  - "src/systems/quest/questBridge.js"
  - "src/ui/questMarks.js"
  - "src/ui/questTracker.js"
  - "src/scenes/worldModes.js"
  - "src/travel/travelViewMarks.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-22d.md"
related:
  - "peer-art-lru-sweep-and-boat-arc-glide"
  - "doorless-graveyard-check-and-revenant-lair-mending"
  - "online-coop-party-quest-trade-and-ally-cast"
  - "come-sail-away-online-peer-boats-and-aboard"
  - "revenant-lairs-thefts-and-companions"
invariants:
  - "In `applySpell` (`src/magic/effects.js`), a cast identifies entries added during the current invocation against a `prior` Set captured before execution rather than array length."
  - "`findInc` merges into an entry created by the current cast only when `bundleAlly` and `bundleDuel` tags match, folding multi-Shield ally gifts into one `damageShieldPool` (`src/characters/playerEntity.js`)."
  - "Ally and gifted cast levels clamp to `CAST_LEVEL_MAX = 30` (`src/net/wire.js`) on both sender and receiver."
  - "`questMapMarks` (`src/ui/questMarks.js`) feeds from `questTracker` views, showing dungeon quest markers only at the Exact guidance tier (`dungeonQuestMarksHere` in `src/scenes/worldModes.js`)."
traps:
  - "A Cure effect inside a multi-effect bundle rebuilds `activeEffects` (`cureAllOfKind`), shifting array indices and breaking length-based slice tracking."
  - "`questBridge` logs lens failures once per session (`warnNewsOnce`) while keeping the quest machine ticking."
dfu:
  - "Assets/Scripts/Game/MagicAndEffects/EntityEffectManager.cs"
  - "Assets/Scripts/Game/Entities/DaggerfallEntity.cs"
tags:
  - "magic"
  - "ally-cast"
  - "shield"
  - "quest-marks"
---

# Gifted Spell Incumbent Merging, Cast Level Cap, and Exact Quest Marks

Gifted spell bundling, cast level clamping, and quest marker filtering coordinate across `src/magic/effects.js`, `src/magic/allyCast.js`, `src/net/wire.js`, and `src/ui/questMarks.js`, alongside peer sprite bounds (`peer-art-lru-sweep-and-boat-arc-glide`) and revenant lair relocation (`doorless-graveyard-check-and-revenant-lair-mending`).

- **Incumbent merging and prior set (`src/magic/effects.js`, `src/characters/playerEntity.js`):** In `applySpell`, a cast identifies entries added during the current invocation against a `prior` Set captured before execution rather than array length, because a Cure effect (`cureAllOfKind`) rebuilds `activeEffects` and shifts array indices. `findInc` merges into an entry created by the current cast only when `bundleAlly` and `bundleDuel` tags match, folding multi-Shield ally gifts into one `damageShieldPool`.
- **Cast level clamping (`src/net/wire.js`, `src/magic/allyCast.js`):** Outgoing and incoming ally and gifted cast levels clamp to `CAST_LEVEL_MAX = 30`, matching `recipeLaw` and `DUEL_LEVEL_MAX`.
- **Quest lens safety and exact dungeon marks (`src/systems/quest/questBridge.js`, `src/ui/questMarks.js`, `src/ui/questTracker.js`, `src/scenes/worldModes.js`, `src/travel/travelViewMarks.js`):** `questBridge` catches lens inspection failures with `{ windows: false }` and logs once per session via `warnNewsOnce` while keeping the quest machine ticking. `questMapMarks` reads `questTracker` views and renders dungeon quest markers (`dungeonQuestMarksHere`) only at the Exact guidance tier.
