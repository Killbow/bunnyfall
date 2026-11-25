---
slug: enhanced-maps-overview
title: "Enhanced Maps: One Held Window, Three Sheets"
domain: ui
kind: overview
parent: null
files:
  - src/ui/heldMap.js
  - src/maps/mapTabs.js
  - src/ui/mapStrip.js
  - src/ui/mapSkin.js
  - src/ui/travelMapDoor.js
  - src/ui/automapDoor.js
  - src/ui/townMapDoor.js
  - src/maps/exteriorAutomapToggle.js
  - src/combat/weaponRig.js
  - src/ui/inputActions.js
routes: []
tables: []
replacesBible:
  - "10-UI/Enhanced-Maps-Arc.md"
related:
  - held-map-overview
  - held-map-ink-cartography-and-zoom-bands
  - held-map-sprite-and-hands-lanes
  - enhanced-maps-automap-storeys-and-sheets
  - enhanced-maps-town-plan-quarters-and-marks
invariants:
  - "MAP_SHEETS = ['automap','town','world']; MAP_CONTEXTS = dungeon, building, town, wilderness. AVAILABLE: dungeon->[automap], building->[automap], town->[town, world], wilderness->[world] (src/maps/mapTabs.js)."
  - "Context order is law: insideDungeon wins over insideBuilding, then inLocation ? 'town' : 'wilderness'."
  - "The window slot narrows offered tabs to registered sheets (`createSheetSlot` `has: [...this._sheets.keys()]`)."
  - "holdsScreen = true is constant on HeldMapWindow; isTravelMap is derived as this._slot.ids.includes('world') (EM-BUG1)."
  - "Close fires on 'Escape' or the TravelMap or AutoMap action (EM-BUG2)."
  - "Every sheet must satisfy SHEET_MEMBERS in src/ui/mapStrip.js (isSheet checks each is a function, id a string)."
  - "Find me delegates to the up sheet: this._sheet.findMe(limits, view), then blinks sheet.me() for _findMeT = 3 seconds (FINDME-TOWN)."
traps:
  - "Do not let the weapon rig read isTravelMap for screen-holding; it reads sheetWindowUp, fed from holdsScreen by each host."
  - "Tab-strip grabs resolve through grabHit (nearest ink wins), not the top row of overlapping touch bands."
dfu:
  - "DaggerfallExteriorAutomapWindow.cs"
  - "ExteriorAutomap.cs"
tags:
  - enhanced-map
  - held-map
  - map-tabs
  - sheet-contract
  - ui
---

# Enhanced Maps: One Held Window, Three Sheets

Enhanced Maps unifies the dungeon automap, town plan, and overworld travel map inside one `HeldMapWindow` (`src/ui/heldMap.js`) that switches between three sheets (`MAP_SHEETS = ['automap', 'town', 'world']`).

- **Context Ordering and Tab Slots (`src/maps/mapTabs.js`, `src/ui/mapStrip.js`, `src/ui/heldMap.js`):** Context priority evaluates `insideDungeon` before `insideBuilding`, and otherwise checks `inLocation ? 'town' : 'wilderness'` across `MAP_CONTEXTS`. `AVAILABLE` maps `dungeon` and `building` to `['automap']`, `town` to `['town', 'world']`, and `wilderness` to `['world']`. `createSheetSlot` intersects available tabs with registered sheets (`has: [...this._sheets.keys()]`), and tab-strip hits resolve through `grabHit` so nearest ink wins over overlapping touch bands.
- **Sheet Contract and Find-Me (`src/ui/mapStrip.js`, `src/ui/heldMap.js`):** `isSheet` verifies `SHEET_MEMBERS` (`id`, `size`, `ensure`, `staticKey`, `paintStatic`, `paintOverlay`, `pickAt`, `hoverLabel`, `mark`, `key`, `tick`, `mount`, `unmount`, `homeView`, `context`). With `FOCUS_SCALE = 6`, clicking Find me calls `this._sheet.findMe(limits, view)` and blinks `sheet.me()` for `_findMeT = 3` seconds.
- **Actions, Doors, and Rig Handover (`src/ui/inputActions.js`, `src/combat/weaponRig.js`, `src/ui/travelMapDoor.js`, `src/ui/automapDoor.js`, `src/ui/townMapDoor.js`, `src/maps/exteriorAutomapToggle.js`):** `TravelMap` remains bound to `KeyV` and opens the `world` tab where available, while `'Escape'`, `TravelMap`, or `AutoMap` closes the window. `HeldMapWindow` keeps `holdsScreen = true` constant (deriving `isTravelMap = this._slot.ids.includes('world')`), and `src/combat/weaponRig.js` reads `sheetWindowUp` and `sheetHolderOf` (`holdsScreen`) so `M`-key sheets take the Morrowind hands.
