---
slug: questlines-arc-overview
title: "Questlines Arc: Layer over the DFU Quest Machine"
domain: quests
kind: overview
parent: null
files:
  - src/systems/questlines/qlLaw.js
  - src/systems/questlines/qlState.js
  - src/systems/questlines/qlLayer.js
  - src/mods/features.js
  - src/ui/enhancedMenu.js
  - src/ui/questlines/qlJournal.js
  - src/systems/quest/questBridge.js
  - src/systems/quest/questData.js
  - src/systems/quest/machine.js
  - src/systems/quest/person.js
  - src/characters/staticNpc.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Questlines-Arc.md"
related:
  - quests-macros-and-main-spine
  - questlines-objective-sheets-and-branches
  - questlines-offers-couriers-and-line-runner
  - questlines-rewards-tiers-and-gear-offers
  - questlines-service-claims-titles-and-weir-key
invariants:
  - "The questlines layer is read-only over the DFU machine: `src/systems/quest/machine.js` never imports `qlLaw.js` and runs every quest itself."
  - "The Features row `questlines` (prefs key `QUESTLINES_PREF`) defaults to on (`initial: true`) and is locked on in online play (`online: true`, shown locked via `lockOnline`)."
  - "`startStamp()` runs once at quest start (`machine.js` `startQuestImmediate` via `deps.questlinesStamp`), saving the stamp on `quest.ql`; `isStamped()` governs that quest for its entire life."
  - "The pause menu Quests tab (`enhancedMenu.js` `pauseQuests`, rendered by `src/ui/questlines/qlJournal.js`) is the single view for active quests, guild ladders, and questlines."
traps:
  - "A quest started while the `questlines` feature switch is off stays DFU-legacy even after the switch is turned on; never re-stamp a quest on save load."
  - "Never add a new wallet currency for questline payouts; rewards reuse gold, faction standing, Weir Keys (`players.eg_keys`), and festival cakes."
dfu:
  - Assets/Scripts/Game/Questing/QuestMachine.cs
  - Assets/Scripts/Game/Questing/QuestListsManager.cs
tags:
  - quests
  - questlines
  - feature-flag
  - stamp
  - overview
---

The Questlines Arc adds objective sheets, branching outcomes, multi-step questlines, guild ladders, and tiered gear rewards as a read-only observation layer over `src/systems/quest/machine.js`. The underlying quest machine never imports `src/systems/questlines/qlLaw.js`; instead, `src/systems/questlines/qlLayer.js` and `src/systems/quest/questBridge.js` observe machine state and drive `src/ui/questlines/qlJournal.js` inside the pause menu Quests tab (`pauseQuests` in `src/ui/enhancedMenu.js`). For macro tables and `S0000999` main-spine startup, see `quests-macros-and-main-spine`.

## Feature Switch and Lifetime Stamp

In `src/mods/features.js`, the `questlines` feature row (`QUESTLINES_PREF`) defaults to enabled (`initial: true`) and is forced on during online play (`online: true`, displayed as locked via `lockOnline`). When a quest starts in `startQuestImmediate`, `deps.questlinesStamp` calls `startStamp()` once and stores the result on `quest.ql` (`src/systems/questlines/qlState.js`). `isStamped()` checks that saved stamp for the rest of the quest's lifetime, so toggling the setting later never alters an in-progress quest.

## Quest Packs and Static Giver Names

`loadQuestPack` (`src/systems/quest/questData.js`) loads the vendored quest scripts, while `defaultActionTemplates` registers script actions including `GivePc`. To keep quest giver names consistent between dialog and objective sheets, `personOwnName` (`src/systems/quest/person.js`) and `staticNpcName` (`src/characters/staticNpc.js`) take a static NPC quest giver's displayed name directly from the quest `Person` resource rather than from a procedural seed.

## Subcards

- `questlines-objective-sheets-and-branches`: binding kinds, one-way objective latches, text patches, and party branch prompts.
- `questlines-offers-couriers-and-line-runner`: opt-in offers, courier letter pacing, shelved steps, and the acts feed.
- `questlines-rewards-tiers-and-gear-offers`: reward tiers, pay profiles, three-choice gear offers, and online failure standing.
- `questlines-service-claims-titles-and-weir-key`: `/v1/ql/claim` receipt verification, account titles, and Weir Key payouts.
