---
slug: "water-exhaustion-drain-and-net-fatigue"
title: "Water Exhaustion Drain (SWIM-SPENT) and Net Fatigue Floor (FISH-TIRED)"
domain: "player"
kind: "subcard"
parent: "player-death-kept-and-arrival-holds"
files:
  - "src/player/rest.js"
  - "src/professions/fishHost.js"
  - "src/scenes/world.js"
  - "src/scenes/exterior.js"
  - "src/scenes/dungeonContext.js"
  - "src/scenes/shared.js"
  - "src/world/worldTick.js"
  - "src/professions/foragingInstall.js"
  - "src/professions/gatherHost.js"
  - "src/ui/profPages.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-09-30b.md"
related:
  - "player-death-kept-and-arrival-holds"
  - "foraging-online-wait-and-profession-tools"
  - "professions-gathering-nodes-and-motherlodes"
  - "deep-waters-swim-driver-and-forge"
invariants:
  - "`exhaustionOutcome({ swimming: true })` (`src/player/rest.js`) returns `{ kind: 'drown', damage, line: EXHAUSTED_SWIMMING_LINE, inWater: true }`, draining `Math.max(1, Math.ceil(maxHealth * EXHAUSTED_SPENT_SHARE))` (`EXHAUSTED_SPENT_SHARE = 0.1`) once per game minute."
  - "`NET_TIRED_SHARE = 0.25` (`src/professions/fishHost.js`): `tooTiredForTheWater` blocks net casts below `25%` max fatigue and aborts active casts if fatigue drops below that floor (`NET_TIRED_WORDS`)."
  - "All exterior, world, and dungeon hosts apply `drown` and `spent` outcomes, and tool activation from hotbar or quickslots invokes `gatherHost.useTool` at matching resource nodes."
traps:
  - "Never restore instant `SetHealth(0)` drowning on water exhaustion; only the periodic `10%` health drain can kill a swimmer."
  - "`EXHAUSTED_SPENT_SHARE` is shared with dry-land combat collapse (`EXHAUSTED_FIGHTING_LINE`), and `FATIGUE-IDLE` spares only dry ground so treading water still spends fatigue."
dfu: []
tags:
  - "fatigue"
  - "swimming"
  - "fishing"
  - "exhaustion"
  - "professions"
---

# Water Exhaustion Drain (SWIM-SPENT) and Net Fatigue Floor (FISH-TIRED)

Swimming fatigue exhaustion (`SWIM-SPENT`), fishing net fatigue gates (`FISH-TIRED`), and hotbar profession tool routing coordinate across `src/player/rest.js`, `src/professions/fishHost.js`, and `src/professions/gatherHost.js`.

- **Periodic water exhaustion drain:** When a swimming player runs out of fatigue, `exhaustionOutcome({ swimming: true })` (`src/player/rest.js`) returns `{ kind: 'drown', damage, line: EXHAUSTED_SWIMMING_LINE, inWater: true }` rather than killing the swimmer outright. Each game minute (`src/world/worldTick.js`), it drains `Math.max(1, Math.ceil(maxHealth * EXHAUSTED_SPENT_SHARE))` health with `EXHAUSTED_SPENT_SHARE = 0.1` (shared with dry-land combat collapse under `EXHAUSTED_FIGHTING_LINE`), giving a full-health swimmer roughly fifty real seconds to reach dry land. All host scenes (`src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/dungeonContext.js`, and `src/scenes/shared.js`) apply both `drown` and `spent` outcomes, and `FATIGUE-IDLE` exempts only dry ground so treading water continues to spend fatigue.
- **Fishing net fatigue floor:** In `src/professions/fishHost.js`, `tooTiredForTheWater` enforces `NET_TIRED_SHARE = 0.25`, refusing new net casts below `25%` of maximum fatigue and aborting active casts with `NET_TIRED_WORDS` if fatigue falls below that floor.
- **Hotbar tool activation and hints:** Online with professions open (`src/professions/foragingInstall.js`), activating a Wood-Axe, Pick-Axe, Sickle, Basket, or Fishing-Net from the hotbar or quickslots invokes `gatherHost.useTool` at a matching node (throwing the shortest net cast on tap), while `GATHER_HOW` and `STORES_EMPTY_LINE` (`src/ui/profPages.js`) explain node gathering.
