---
slug: held-map-overview
title: "Held Map: Runtime-Inked Parchment Replacing the Relief Overworld Map"
domain: ui
kind: overview
parent: null
files:
  - src/ui/heldMap.js
  - src/ui/travelMapDoor.js
  - src/ui/mapSkin.js
  - src/ui/townMapDoor.js
  - src/ui/automapDoor.js
  - src/ui/windowStack.js
  - src/player/mwView.js
  - public/art/held-map.png
routes: []
tables: []
replacesBible:
  - "10-UI/Held-Map-Arc.md"
related:
  - held-map-ink-cartography-and-zoom-bands
  - held-map-sprite-and-hands-lanes
  - held-map-travel-options-and-filter-key
  - tamriel-held-map-ink
  - ui-arc-overview
invariants:
  - "The enhanced skin's travel door builds HeldMapWindow only when heldMapWorn() (isEnhanced() && getPref('heldMap') && a DOM). Otherwise it builds the classic TravelMapWindow, or null without TRAV0I00 art (src/ui/travelMapDoor.js createTravelMapWindow)."
  - "travelMapDoorReady() is heldMapChosen() || travelMapArtLoaded(). The held map reads no ARENA2 art, so it is ready wherever it is chosen."
  - "The only picture shipped is the port's own sprite, public/art/held-map.png, resolved as HELD_MAP_URL against APP_ROOT from appRootFrom(import.meta.url) (src/platform/appRoot.js) so /play/index.html resolves it correctly."
  - "The window sets holdsScreen = true and hidesHud = true. windowStack.hidesHud hides the vitals without pausing the world."
  - "Hosts call mwViewFirstPerson() before the window's first tick so the Morrowind arm can take the sheet. Close does not restore third person."
  - "The three map doors (travel, town, automap) share one switch: heldMapWorn in src/ui/mapSkin.js (MAP-TOGGLE, Features 'enhanced-map', pref 'heldMap', on by default)."
traps:
  - "src/ui/overworldMap.js (the 3D relief map) was retired. Do not resurrect its render pass, cloud veil, camera flight or region picker."
  - "isTravelMap initializes false and derives as this._slot.ids.includes('world'); screen-holding questions read holdsScreen (EM-BUG1)."
dfu: []
tags:
  - held-map
  - travel-map
  - enhanced
  - ui
  - map-toggle
---

# Held Map: Runtime-Inked Parchment Replacing the Relief Overworld Map

The Held Map replaces the retired 3D relief overworld map (`src/ui/overworldMap.js`) with a runtime-inked parchment sheet held in first person, requiring no `ARENA2` travel-map raster art.

- **Shared Map Skin Switch and Door Readiness (`src/ui/mapSkin.js`, `src/ui/travelMapDoor.js`, `src/ui/townMapDoor.js`, `src/ui/automapDoor.js`):** Travel, town, and dungeon automap doors share `heldMapWorn()` (`isEnhanced() && getPref('heldMap')` with a DOM, controlled by the `'enhanced-map'` feature toggle and `'heldMap'` preference, enabled by default). `createTravelMapWindow` builds `HeldMapWindow` when `heldMapWorn()` is true, falls back to classic `TravelMapWindow` when `TRAV0I00` art is loaded, or returns `null`. `travelMapDoorReady()` evaluates `heldMapChosen() || travelMapArtLoaded()`.
- **Lifecycle, Raise Animation, and HUD State (`src/ui/heldMap.js`, `src/ui/windowStack.js`, `src/player/mwView.js`):** `HeldMapWindow` moves through phases `'opening'`, `'map'`, and `'closing'` (`OPEN_S = 0.42` s, `CLOSE_S = 0.36` s) across either the `'sprite'` or `'hands'` lane. In the sprite lane, `_setRaise` eases the stage with smoothstep `translateY` while the chrome fades; in the hands lane nothing slides. Hosts call `mwViewFirstPerson()` before the first tick (returning whether the view moved and preserving the remembered zoom distance; closing does not restore third person). The window sets `holdsScreen = true`, `hidesHud = true` (read by `windowStack.hidesHud` to hide vitals without pausing the world), and `isTravelMap = this._slot.ids.includes('world')`.
- **Bundled Sprite Asset and Probe (`src/ui/heldMap.js`, `public/art/held-map.png`):** `public/art/held-map.png` resolves as `HELD_MAP_URL` against `APP_ROOT` (`appRootFrom(import.meta.url)`). Opening installs `globalThis.__heldMap` (`_probeFn`) and disposing removes it.
