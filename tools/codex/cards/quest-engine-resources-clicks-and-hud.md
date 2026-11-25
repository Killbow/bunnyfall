---
slug: quest-engine-resources-clicks-and-hud
title: "Quest Resources, NPC Clicks, Notebook, and Escort Faces"
domain: quests
kind: subcard
parent: quest-engine-overview
files:
  - src/systems/quest/resourceBehaviour.js
  - src/systems/quest/place.js
  - src/systems/quest/person.js
  - src/systems/quest/item.js
  - src/characters/staticNpc.js
  - src/player/activate.js
  - src/world/streamingWorld.js
  - src/ui/notebook.js
  - src/ui/hudEscortFaces.js
  - src/ui/guildServiceWindows.js
  - src/ui/questJournal.js
  - src/systems/quest/questsWorld.js
  - src/saves/save.js
  - src/ui/midScreenText.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Quest-Arc.md"
related:
  - quest-engine-overview
  - quest-sites-and-homed-reseating
  - quests-macros-and-main-spine
invariants:
  - "QuestResourceBehaviour.doClick ignores destroyed components, shelved quests and ended quests, then broadcasts to Individual-faction NPCs (resourceBehaviour.js:229)."
  - "Place p1 === 50000 binds MantellanCrux and throws if it has no spawn marker (place.js:966-976)."
  - "isInLocationRect pads the rect by WORLD_MAP_RMB_DIM (4096) (streamingWorld.js:94-98)."
traps:
  - "Click reach comes from activate.js (DEFAULT_ACTIVATION_DISTANCE 128, STATIC_NPC_ACTIVATION_DISTANCE 256, each times GLOBAL_SCALE), not from resourceBehaviour.js."
dfu:
  - "Assets/Scripts/Game/Questing/Components/QuestResourceBehaviour.cs"
  - "Assets/Scripts/Game/Player/PlayerNotebook.cs"
  - "Assets/Scripts/Game/UserInterface/HUDEscortingNPCFaces.cs"
tags:
  - quests
  - resources
  - npc-click
  - notebook
  - escort-faces
  - hud
---

# Quest Resources, NPC Clicks, Notebook, and Escort Faces

Quest resources (`Place`, `Person`, and `Item`) connect script state to world geometry, NPC click activation, the player notebook, and HUD escort portraits.

- **Resource Clicks and Place Bounds (`src/systems/quest/resourceBehaviour.js`, `src/systems/quest/place.js`, `src/systems/quest/person.js`, `src/systems/quest/item.js`, `src/characters/staticNpc.js`, `src/player/activate.js`, `src/world/streamingWorld.js`):** `QuestResourceBehaviour.doClick` skips destroyed components, shelved quests, and ended quests before broadcasting to Individual-faction NPCs; activation reach lives in `src/player/activate.js` (`DEFAULT_ACTIVATION_DISTANCE = 128` and `STATIC_NPC_ACTIVATION_DISTANCE = 256`, each multiplied by `GLOBAL_SCALE`). `ZERO_NPC_DATA` lives in `src/characters/staticNpc.js`, and `QuestMachine.isNPCDataEqual` hooks into `WhenNpcIsAvailable`. In `src/systems/quest/place.js`, `p1 === 50000` binds `MantellanCrux` and throws without a spawn marker, while `isInLocationRect` (`src/world/streamingWorld.js`) pads bounds by `WORLD_MAP_RMB_DIM` (`4096`).
- **Notebook, Dialog Boxes, and Escort HUD (`src/ui/notebook.js`, `src/ui/midScreenText.js`, `src/ui/questJournal.js`, `src/ui/guildServiceWindows.js`, `src/systems/quest/questsWorld.js`, `src/ui/hudEscortFaces.js`, `src/saves/save.js`):** The notebook (`src/ui/notebook.js`, alongside `src/ui/midScreenText.js` and `src/ui/questJournal.js`) keeps `MAX_MESSAGE_COUNT = 50` entries wrapped at `MAX_LINE_LENGTH = 70`, and online quest boxes use `ServiceFlowWindow` with `graceMs: 600` (`src/systems/quest/questsWorld.js`). Escort portraits (`src/ui/hudEscortFaces.js`, persisted as `escortingFaces` in `src/saves/save.js`) hide shelved quests and apply `ESCORT_MAX_FACES = 3`, `ESCORT_START_X = 8`, `ESCORT_START_Y = 36`, `ESCORT_TOUCH_AIR = 8`, and `ESCORT_MEASURE_EVERY = 30`.
