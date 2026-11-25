---
slug: quest-guide-show-on-map-and-marks
title: "Quest Show-on-Map Door, Held-Map Diamonds, and Compass Mark"
domain: quests
kind: subcard
parent: quest-guide-arc-overview
files:
  - src/ui/questMarks.js
  - src/ui/heldMap.js
  - src/ui/inkMap.js
  - src/ui/enhancedHud.js
  - src/ui/enhancedMenu.js
  - src/ui/enhancedChronicle.js
  - src/ui/travelMapDoor.js
  - src/ui/travelMapWindow.js
  - src/travel/travelMapWorld.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Quest-Guide-Arc.md"
related:
  - quest-guide-arc-overview
  - quest-guide-herald-and-tracker
  - held-map-overview
  - dungeon-exploration-aids-overview
invariants:
  - "A quest mark is drawn only for a target with a valid `find`: onMap === true and not underfoot. A mark never uses quest-debugger knowledge on the journal tier."
  - "toggleTravelMap returns true only when the map actually opened and false on every refusal. Indoors (when mode is not 'exterior') it says cannotTravelIndoors and refuses."
  - "The compass quest mark is outdoor street-mode only (scenes/world.js)."
traps:
  - "Show on map must close the journal before calling the host door gotoPlace / toggleTravelMap({ siteDetails: find }), matching DFU's FindPlace_OnButtonClick."
  - "Hit-test a held-map quest diamond at its lifted position (QUEST_MARK_LIFT / QUEST_RAID_LIFT), or a click travels to the bare pixel beneath it."
  - "Memoize quest map pixels with placePixelMemo (src/ui/travelMapDoor.js) instead of re-parsing MapsFile every tick."
dfu: []
tags:
  - quests
  - quest-marks
  - held-map
  - compass
  - travel-map
  - GUIDE2
  - GUIDE5
---

# Quest Show-on-Map Door, Held-Map Diamonds, and Compass Mark

Quest target actions and spatial markers connect the journal and pause views to the travel map, held map, and outdoor compass while respecting journal-tier discovery rules.

- **Show-on-Map Door and Refusal Rules (`src/ui/enhancedMenu.js`, `src/ui/enhancedChronicle.js`, `src/ui/travelMapDoor.js`, `src/ui/travelMapWindow.js`, `src/travel/travelMapWorld.js`):** The pause Quests tab and chronicle surface `entryTarget` where-lines and `Show on map` buttons. Matching `FindPlace_OnButtonClick` in DFU, clicking `Show on map` closes the journal before calling `gotoPlace` or `toggleTravelMap({ siteDetails: find })`. `toggleTravelMap` returns `true` only when the map opens and `false` on any refusal, reporting `cannotTravelIndoors` whenever the active mode is not `'exterior'`.
- **Held-Map Diamonds and Lifted Hit-Testing (`src/ui/questMarks.js`, `src/ui/inkMap.js`, `src/ui/heldMap.js`, `src/ui/travelMapDoor.js`):** A quest mark renders only when `find` is valid (`onMap === true` and not underfoot), memoizing coordinates via `placePixelMemo` rather than re-parsing `MapsFile` every tick. `paintQuestMark` draws an ink-outlined `#c9962c` (`QUEST_MARK_CSS`) gold diamond, filled for the tracked quest and hollow for others. Hit-testing checks `QUEST_HIT_PX = 16` at the lifted height (`QUEST_MARK_LIFT = 17`, or `QUEST_RAID_LIFT = 42` over raided towns) so clicks do not fall through to the bare pixel below.
- **Outdoor Compass Diamond and Shared Follow Gate (`src/ui/enhancedHud.js`, `src/scenes/world.js`):** In outdoor street mode, `drawQuestMark` renders one hollow gold diamond edged in dark ink for the tracked quest, clamped via `compassMarkerLerp`. `followOn()` enables the shared look whenever `quest-tracker` or `quest-marks` is active or the guidance tier is not `'journal'`.
