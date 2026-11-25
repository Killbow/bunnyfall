---
slug: held-map-travel-options-and-filter-key
title: "Held Map Travel Options, Travel Laws, and Filter Key"
domain: ui
kind: subcard
parent: held-map-overview
files:
  - src/ui/heldMap.js
  - src/ui/travelMapOptions.js
  - src/ui/travelPopUp.js
  - src/ui/travelMapWindow.js
  - src/travel/travelMapState.js
  - src/travel/travelPorts.js
  - src/ui/inkMap.js
  - src/ui/pointerCapture.js
  - src/ui/eventMapMarks.js
  - src/ui/oreMapTip.js
routes: []
tables: []
replacesBible:
  - "10-UI/Held-Map-Arc.md"
related:
  - held-map-overview
  - held-map-ink-cartography-and-zoom-bands
  - travel-view-overworld-overview
invariants:
  - "Both skins call the same pure travel laws: isPlayerControlledTravel, enforceShipRestriction, shipTravelRefusal and scaleTripCost from src/ui/travelPopUp.js. Travel Options additions use portsFilterAllows, locationInfoRows, resumePrompt and teleportCost from src/ui/travelMapOptions.js, so the skins cannot drift."
  - "The PORTS filter hides places without a harbor. The held map imports hasPortFor as hasPort, which also counts a members' Harbor at a seat."
  - "The mark is travelMapMarkedMapId in the shared store (src/travel/travelMapState.js), inked in the 'RoadsIntegration.MarkLocationColor' setting at every band."
  - "The filter key is built from mapKeyGroups(). A toggle calls the classic flipTravelMapFilter on travelMapFilters(), the same live store the classic window uses."
  - "Key and dot hues are the classic FMAP_PAL.COL colors (travelMapDotColors) blended toward ink by markInks/quarterInk at MARK_INK_MIX = 0.58. No palette numbers are hardcoded."
traps:
  - "Every pointer capture and release goes through capturePointer/releasePointer. A gamepad's synthetic pointerId 1 throws NotFoundError in Firefox (RPT1026)."
  - "A coordinates (bare pixel) click refuses a teleport visit. Saying No to the teleport fee closes the map."
dfu: []
tags:
  - held-map
  - travel-options
  - filters
  - ports
  - gamepad
---

# Held Map Travel Options, Travel Laws, and Filter Key

The Held Map shares travel validation, Travel Options rules, filter state, and `FMAP_PAL.COL` marker hues with the classic travel map window so the two map skins never drift.

- **Shared Travel Laws and Prompts (`src/ui/heldMap.js`, `src/ui/travelPopUp.js`, `src/ui/travelMapOptions.js`):** Both map skins call `isPlayerControlledTravel`, `enforceShipRestriction`, `shipTravelRefusal`, and `scaleTripCost` from `src/ui/travelPopUp.js`, plus `portsFilterAllows`, `locationInfoRows`, `resumePrompt`, and `teleportCost` from `src/ui/travelMapOptions.js`. On the first tick with a pending destination, `resumePrompt` asks whether to resume (lowering the sheet on Yes, staying on the map on No). Walked trips show hours and minutes with no fare, and the host's `onTravelToCoords` honors bare-pixel coordinate clicks (which refuse teleport visits; declining a teleport fee closes the map). Pressing `I` opens a `locationInfoRows` box and `H` opens help; any key or click dismisses them.
- **Filter Key, Ports Filter, and Palette Ink Blending (`src/ui/heldMap.js`, `src/ui/travelMapWindow.js`, `src/travel/travelMapState.js`, `src/travel/travelPorts.js`, `src/ui/inkMap.js`):** `_renderKey` builds the foot-row filter key from `mapKeyGroups()`, and toggling a group calls `flipTravelMapFilter` on `travelMapFilters()` in `src/travel/travelMapState.js`. The `PORTS` filter checks `hasPortFor` (aliased as `hasPort` from `src/travel/travelPorts.js`, counting both base harbors and a members' Harbor at a seat). `travelMapMarkedMapId` is inked at every zoom band using `'RoadsIntegration.MarkLocationColor'`. Key and dot colors come from `travelMapDotColors` (`FMAP_PAL.COL`) blended toward ink by `markInks` and `quarterInk` at `MARK_INK_MIX = 0.58`, alongside overlays from `src/ui/eventMapMarks.js` and `src/ui/oreMapTip.js`.
- **Safe Pointer Capture (`src/ui/pointerCapture.js`):** All pointer capture and release calls go through `capturePointer` and `releasePointer` so a gamepad's synthetic `pointerId = 1` does not throw `NotFoundError` in Firefox.
