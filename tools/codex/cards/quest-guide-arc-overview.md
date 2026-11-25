---
slug: quest-guide-arc-overview
title: "Quest Guide Arc: the Read-Only Quest Lens over the DFU Machine"
domain: quests
kind: overview
parent: null
files:
  - src/ui/questLens.js
  - src/ui/questRail.js
  - src/ui/questJournal.js
  - src/systems/quest/questBridge.js
  - src/mods/features.js
  - src/scenes/world.js
  - src/scenes/worldModes.js
  - src/scenes/dungeonContext.js
  - src/scenes/exterior.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Quest-Guide-Arc.md"
related:
  - quest-guide-herald-and-tracker
  - quest-guide-show-on-map-and-marks
  - quests-macros-and-main-spine
  - questlines-arc-overview
  - dungeon-exploration-aids-overview
invariants:
  - "The machine never knows: guide faces only read the quest machine and never write to it."
  - "One walk: questRail orders entries and QuestLens is the single read-only view. createQuestBridge builds exactly one lens per bridge, and no host builds its own."
  - "Faces show only journal text and places that DFU logbook Find Place would reach, never invented checkbox objectives."
  - "Classic skin stays 1:1 with DFU; every guide face is gated on isEnhanced()."
traps:
  - "Never call Message.getTextTokens loudly from a face. Use quietTokens, which keeps the reveal off and restores LastResourceReferenced, LastPlaceReferenced, CurrentLogMessageId, the DFRandom seed and roll draws."
  - "entryTarget follows GetLastPlaceMentionedInMessage (the last Place named by any macro), not LastPlaceReferenced."
  - "Order entries by writtenOrder, not by step key, or superseded steps show as the latest."
dfu:
  - "DaggerfallQuestJournalWindow.cs"
tags:
  - quests
  - quest-guide
  - quest-lens
  - enhanced-skin
  - accessibility
  - overview
  - GUIDE1
---

# Quest Guide Arc: the Read-Only Quest Lens over the DFU Machine

The Quest Guide Arc exposes active quests to enhanced-skin surfaces through one read-only `QuestLens` instance without mutating the DFU quest machine or altering classic skin parity.

- **Single Bridge Lens and Walk (`src/systems/quest/questBridge.js`, `src/ui/questLens.js`, `src/ui/questRail.js`):** `createQuestBridge` instantiates one `new QuestLens({ questLog: () => bridge.questLog({ windows: false }) })`, calls `lens.reset()` after a stretch without a look (such as a restore), and runs `lens.rereadText()` once per game hour so day countdown macros stay fresh. `lens.look(questWhere)` returns `{ quests, events }` with `started`, `updated`, `urgent`, `completed`, and `ended` events (`clockSeconds < QUEST_URGENT_SECONDS`, `86400` in `src/ui/questRail.js`), ordering entries by `writtenOrder` rather than step key.
- **Side-Effect-Free Token Reading (`src/ui/questLens.js`, `src/ui/questJournal.js`):** `quietTokens` suppresses reveal side effects and restores `LastResourceReferenced`, `LastPlaceReferenced`, `CurrentLogMessageId`, the `DFRandom` seed, and roll draws; `%god` in a templeless region resolves to the first divine.
- **Target Resolution and Feature Defaults (`src/ui/questLens.js`, `src/mods/features.js`):** `entryTarget` tracks `GetLastPlaceMentionedInMessage` under the said law (buildings when named; towns and regions when named, on the map, or underfoot) and sets `onMap` to `null` when `canFindPlace` is absent. Feature rows `quest-herald`, `quest-tracker`, and `quest-marks` default on for `isEnhanced()`, while `quest-guidance` defaults to the journal tier.
