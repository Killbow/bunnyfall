---
slug: "town-mod-layout-pins-and-shared-seats"
title: "Town Layout Pins, Sleeping Unpacked Quests, and Shared Quest Seats"
domain: "quests"
kind: "subcard"
parent: "town-mod-quest-site-fallback-overview"
files:
  - "src/world/layoutPins.js"
  - "src/systems/quest/person.js"
  - "src/systems/quest/machine.js"
  - "src/systems/quest/place.js"
  - "src/scenes/world.js"
  - "src/scenes/dungeonContext.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Quest-Audit-II.md"
related:
  - "town-mod-quest-site-fallback-overview"
  - "quest-sites-and-homed-reseating"
  - "online-coop-party-quest-trade-and-ally-cast"
invariants:
  - "When a pinned town-mod pack is absent, `recordHeldBack` (`src/world/layoutPins.js`) puts affected quest records to sleep unseated rather than permanently repinning them (`admitPinnedPacks`, `PINS_DROPPED_LINE`)."
  - "Shared quests mend on arrival (`updateSharedQuest` in `src/systems/quest/machine.js`) only once `townLayoutsKnown()` is not `false`."
  - "Site link fields copy exclusively through `linkSiteOf(place)` so building key and town move together, while a peer missing a partner building retains its own site (`keepOwnSite`) and carries assignments (`_carryAssignments`)."
traps:
  - "`src/scenes/dungeonContext.js` invokes `opts.layoutPinsLoaded?.(extras)` without awaiting `applyLayoutPins`, so early dungeon ticks can briefly observe prior layout pins while packs load."
dfu:
  - "Assets/Scripts/Game/Questing/QuestMachine.cs"
tags:
  - "quests"
  - "layout-pins"
  - "shared-quests"
  - "online"
---

# Town Layout Pins, Sleeping Unpacked Quests, and Shared Quest Seats

`src/world/layoutPins.js` and `src/systems/quest/machine.js` keep quest state intact when saves or co-op peers move across different town-mod packs (`src/systems/quest/place.js`, `src/systems/quest/person.js`, `src/scenes/world.js`).

- **Sleeping unpacked quests and layout pins:** Quest state recorded under one town layout survives loading under another layout once packs settle. When a pinned town-mod pack is absent, `recordHeldBack` (`src/world/layoutPins.js`) puts affected quest records to sleep unseated instead of permanently repinning them (`admitPinnedPacks`, `PINS_DROPPED_LINE`). In `src/scenes/dungeonContext.js`, `opts.layoutPinsLoaded?.(extras)` fires without awaiting `applyLayoutPins`, so early dungeon ticks can briefly observe prior layout pins while packs finish loading.
- **Shared quest mending and site links:** In `src/systems/quest/machine.js`, `updateSharedQuest` mends arriving shared quests only once `townLayoutsKnown()` is not `false`. Site link fields copy exclusively through `linkSiteOf(place)` so building key and town move together as a unit, while a peer missing a partner building keeps its own site (`keepOwnSite`) and carries assignments (`_carryAssignments`).
