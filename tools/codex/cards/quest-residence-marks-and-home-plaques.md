---
slug: "quest-residence-marks-and-home-plaques"
title: "Quest Residence Ring, Guaranteed Map Mark, and Residence Plaques"
domain: "quests"
kind: "subcard"
parent: "player-death-kept-and-arrival-holds"
files:
  - "src/ui/exteriorAutomapWindow.js"
  - "src/maps/exteriorAutomapToggle.js"
  - "src/maps/discovery.js"
  - "src/ui/townSheet.js"
  - "src/talk/answerPipeline.js"
  - "src/talk/talkTopics.js"
  - "src/homes/onlineHomes.js"
  - "src/scenes/worldModes.js"
  - "src/scenes/exterior.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-09-30b.md"
related:
  - "player-death-kept-and-arrival-holds"
  - "enhanced-maps-automap-storeys-and-sheets"
  - "quest-guide-show-on-map-and-marks"
  - "questor-pool-and-nameless-quest-sites"
  - "economy-arc-online-home-pricing"
invariants:
  - "`stampResidenceQuestNames` (`src/ui/exteriorAutomapWindow.js`) sets `b.questMarked` before the `rec.isOverrideName` early continue so override-named quest houses still draw a quest ring in `src/ui/townSheet.js`."
  - "Outdoors, `src/talk/answerPipeline.js` guarantees marking an asked quest-resource building (`_resourceInfo`) on the map while keeping `CHANCE_TO_REVEAL_LOCATION_ON_MAP = 0.35` for non-quest buildings."
  - "`homeDoorName(name, hasVerbs)` (`src/homes/onlineHomes.js`) returns `name || (hasVerbs ? 'Residence' : '')` so nameless houses with door actions show a plaque."
traps:
  - "Indoors, or when `lettersOnMap` is off, `answerPipeline.js` gives directions without marking the map."
  - "`Residence` comes from `Internal_Strings` `50`; quest residences format as `The <surname> Residence` and are excluded from `homePurchasable` in `src/scenes/worldModes.js`."
dfu: []
tags:
  - "quests"
  - "automap"
  - "talk"
  - "homes"
  - "town-sheet"
---

# Quest Residence Ring, Guaranteed Map Mark, and Residence Plaques

Quest residence automap rings, guaranteed map marks from townsfolk directions, and door plaques for nameless homes run across `src/ui/exteriorAutomapWindow.js`, `src/talk/answerPipeline.js`, and `src/homes/onlineHomes.js`.

- **Quest residence ring (`RES-RING`):** In `src/ui/exteriorAutomapWindow.js` (with `src/maps/exteriorAutomapToggle.js` and `src/maps/discovery.js`), `stampResidenceQuestNames` sets `b.questMarked` before the `rec.isOverrideName` early continue. Even when a quest site carries an override name, `src/ui/townSheet.js` reads `questMarked` and `questName` to render the quest ring on the town map.
- **Guaranteed map mark outdoors (`RES-MARK`):** When the player asks townsfolk outdoors for directions to a building (`src/talk/answerPipeline.js`, `src/talk/talkTopics.js`), a quest-resource building (`_resourceInfo`) always marks the map and triggers `LocationWasMarkedOnMap`, bypassing `CHANCE_TO_REVEAL_LOCATION_ON_MAP = 0.35` used for ordinary buildings. When the conversation takes place indoors or `lettersOnMap` is disabled, `answerPipeline.js` gives verbal directions without marking the automap.
- **Door plaques for nameless houses:** `homeDoorName(name, hasVerbs)` in `src/homes/onlineHomes.js` returns `name || (hasVerbs ? 'Residence' : '')` (using `Internal_Strings` `50` in `src/scenes/exterior.js` and `src/scenes/worldModes.js`), ensuring nameless houses with door interactions display a `'Residence'` plaque. Active quest houses format as `'The <surname> Residence'` and are excluded from `homePurchasable` in `src/scenes/worldModes.js`.
