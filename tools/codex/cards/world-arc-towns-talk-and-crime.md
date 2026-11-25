---
slug: "world-arc-towns-talk-and-crime"
title: "Townsfolk, Talk, Where-Is, and the Crime Loop"
domain: "world"
kind: "subcard"
parent: "world-arc-classic-port-overview"
files:
  - "src/world/cityNavigation.js"
  - "src/characters/mobilePerson.js"
  - "src/characters/townPopulation.js"
  - "src/formats/factionFile.js"
  - "src/talk/talk.js"
  - "src/talk/talkSession.js"
  - "src/talk/talkTopics.js"
  - "src/talk/townTalk.js"
  - "src/talk/talkMacros.js"
  - "src/talk/answerPipeline.js"
  - "src/ui/modeWheel.js"
  - "src/ui/talkWindow.js"
  - "src/world/buildingNames.js"
  - "src/maps/discovery.js"
  - "src/characters/cityGuards.js"
  - "src/combat/enemyEquipment.js"
  - "src/justice/court.js"
  - "src/justice/arrestFlow.js"
routes: []
tables: []
replacesBible:
  - "03-World/World-Arc.md"
related:
  - "world-arc-classic-port-overview"
  - "town-watch-defenders-overview"
  - "living-world-census-schedules-and-watch"
  - "plain-words-talk-regard-badge"
invariants:
  - "Town pools cap at clamp(floor(totalBlocks / 16), 1, 4) * POP_PER_16_BLOCKS (24)."
  - "Navgrid is NAV_CELLS_PER_BLOCK = 64 per RMB block, NAV_CELL = 1.6 world units; walkers move at PERSON_MOVE_SPEED 1.3 and idle within PERSON_IDLE_DISTANCE 2.5."
  - "Talk refuses with TEXT.RSC NO_RESPONSE_TEXT_ID 7205 when reaction < REFUSE_TALK_REACTION (-20)."
  - "Where-is knowledge roll: rollToBeat = knowledgeModifiers[qIndex*5 + socialGroup] + 10 (Commoners local building = 15), random 1..20 <= rollToBeat knows."
  - "At most MAX_ACTIVE_GUARD_SPAWNS = 5 city-watch guards stand at once."
traps:
  - "Pickpocketing rolls dice100(33) (Dice100.FailedRoll(33)) in src/talk/talk.js, not townTalk.js."
  - "Info/Grab/Talk activate at 6.4 (256 * GLOBAL_SCALE) but Steal alone at 3.2; a 6.4 pre-gate on Steal is a regression."
  - "Map reveal fires only when the roll is <= CHANCE_TO_REVEAL_LOCATION_ON_MAP (0.35) and the player is outside."
  - "Killed guards drop gear via equipmentItems() from src/combat/enemyEquipment.js, not a loot table key."
dfu:
  - "Assets/Scripts/Game/Utility/PopulationManager.cs"
  - "Assets/Scripts/Game/MobilePersonMotor.cs"
  - "Assets/Scripts/Game/Utility/CityNavigation.cs"
  - "Assets/Scripts/API/FactionFile.cs"
  - "Assets/Scripts/Game/TalkManager.cs"
  - "Assets/Scripts/Game/PlayerActivate.cs"
  - "Assets/Scripts/Game/UserInterfaceWindows/DaggerfallCourtWindow.cs"
  - "Assets/Scripts/Game/Entities/PlayerEntity.cs"
tags:
  - "towns"
  - "talk"
  - "where-is"
  - "guards"
  - "court"
  - "crime"
  - "map-reveal"
---

# Townsfolk, Talk, Where-Is, and the Crime Loop

Town navigation, dialogue, map discovery, and crime response connect civilian walkers, faction talk answers, guard spawns, and court trials.

- **Town navigation and walkers (`src/world/cityNavigation.js`, `src/characters/mobilePerson.js`, `src/characters/townPopulation.js`):** Town pools cap at `clamp(floor(totalBlocks / 16), 1, 4) * POP_PER_16_BLOCKS` (`24`). Walkers traverse a navgrid of `NAV_CELLS_PER_BLOCK = 64` per RMB block (`NAV_CELL = 1.6` world units) at `PERSON_MOVE_SPEED = 1.3` and idle within `PERSON_IDLE_DISTANCE = 2.5`.
- **Talk, macros, and discovery (`src/talk/talk.js`, `src/talk/talkMacros.js`, `src/maps/discovery.js`):** Dialogue refuses with `NO_RESPONSE_TEXT_ID` (`7205`) when reaction falls below `REFUSE_TALK_REACTION` (`-20`). For Where-Is queries, `rollToBeat = knowledgeModifiers[qIndex * 5 + socialGroup] + 10` (`15` for Commoners on local buildings) succeeds when `1..20 <= rollToBeat`, expanding `%hnt`, `%hnt2`, `%hnr`, and `%ra` in `talkMacros.js`. Exterior location map reveals require `roll <= CHANCE_TO_REVEAL_LOCATION_ON_MAP` (`0.35`), and `overrideName` in `DiscoverBuilding` bypasses the already-discovered early exit to stamp `oldDisplayName` and `isOverrideName`.
- **Crime, guards, and court (`src/characters/cityGuards.js`, `src/combat/enemyEquipment.js`, `src/justice/court.js`, `src/justice/arrestFlow.js`):** Info, Grab, and Talk activate at `6.4` (`256 * GLOBAL_SCALE`), whereas Steal activates at `3.2` and rolls `dice100(33)` in `src/talk/talk.js`. Striking a civilian causes one-hit Murder, while striking a wandering guard causes Assault and converts the guard. Up to `MAX_ACTIVE_GUARD_SPAWNS = 5` guards stand at once, dropping `equipmentItems()` on death. In `court.js`, a Not Guilty plea resolves via Debate (`Etiquette`) or Lie (`Streetwise`).
