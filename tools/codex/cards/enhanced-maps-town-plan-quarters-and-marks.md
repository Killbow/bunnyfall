---
slug: enhanced-maps-town-plan-quarters-and-marks
title: "Enhanced Town Plan: Traced FLD Bytes, Quarters, Nameplates and Marks"
domain: ui
kind: subcard
parent: enhanced-maps-overview
files:
  - src/ui/townSheet.js
  - src/ui/inkTown.js
  - src/ui/townQuarters.js
  - src/ui/townMapMarks.js
  - src/ui/nameplateLayout.js
  - src/ui/townMapDoor.js
  - src/ui/exteriorAutomapWindow.js
  - src/world/rmbLayout.js
routes: []
tables: []
replacesBible:
  - "10-UI/Enhanced-Maps-Arc.md"
related:
  - enhanced-maps-overview
  - held-map-ink-cartography-and-zoom-bands
  - town-economy-overview
invariants:
  - "The town plan traces FLD `autoMapData` bytes of each RMB block into outlines (`boundarySegments` and `linkSegments`) instead of rotating a bitmap (`src/ui/inkTown.js`)."
  - "SHOWALL_SET = [25, 117, 224, 250, 251]; 0xfb (251) is a ground flat, scenery not architecture."
  - "QUARTERS = temple, shop, tavern, house; quarterOfType maps a building byte to its quarter for both skins (src/ui/townQuarters.js)."
  - "Grid rows run against +Z; sheetY = (fieldH - 1) - anchorY puts plan, nameplates, quest rings and caret in one space (EM-BUG3)."
  - "Plates the collision solver drops letter as STAR_PLATE = '*' with the full name kept for hover (src/ui/nameplateLayout.js)."
  - "FIND_ME_BLOCKS = 2: Find me zooms to street level on the caret."
traps:
  - "Apply the zoom clamp first (NAME_SIZE_MIN 9 .. NAME_SIZE_MAX 20 around NAME_SIZE 13), then the landmark/shop weight, or the hierarchy flattens at the cap."
  - "Notice Board marks are model 41739 boards that are not bounty boards, shown only while the board is open online."
dfu:
  - "ExteriorAutomap.cs"
tags:
  - town-map
  - nameplates
  - quarters
  - town-marks
  - findme-town
---

# Enhanced Town Plan: Traced FLD Bytes, Quarters, Nameplates and Marks

The enhanced town sheet (`src/ui/townSheet.js`, `src/ui/inkTown.js`) traces RMB block `autoMapData` bytes into vector building outlines, quarter washes, collision-solved nameplates, and interactive town marks.

- **FLD Byte Tracing, Quarters, and Coordinate Space (`src/ui/inkTown.js`, `src/ui/townQuarters.js`, `src/ui/townMapDoor.js`, `src/ui/exteriorAutomapWindow.js`, `src/world/rmbLayout.js`):** `townSheetBag` feeds the streets tab from building summaries and the discovery record. Instead of rotating a bitmap, `src/ui/inkTown.js` traces FLD `autoMapData` bytes into `boundarySegments` and `linkSegments`, treating `SHOWALL_SET = [25, 117, 224, 250, 251]` (where `0xfb` / `251` is a scenery ground flat rather than architecture) and coloring buildings via `quarterOfType` across `QUARTERS` (`temple`, `shop`, `tavern`, `house`), shared by both skins. Because grid rows run against `+Z`, `sheetY = (fieldH - 1) - anchorY` aligns the plan, nameplates, quest rings, and player caret in one space, and `FIND_ME_BLOCKS = 2` zooms Find me to street level around the caret.
- **Nameplate Hierarchy and Town Marks (`src/ui/nameplateLayout.js`, `src/ui/townMapMarks.js`, `src/ui/townSheet.js`):** Labels draw only when `view.scale >= NAME_ZOOM_MIN` (`0.55`), clamping zoom size (`NAME_SIZE_MIN = 9` to `NAME_SIZE_MAX = 20` around `NAME_SIZE = 13`) before applying landmark or shop weights so the visual hierarchy does not flatten at the cap. Plates dropped by the collision solver render as `STAR_PLATE = '*'` while preserving the full name on hover. `src/ui/townMapMarks.js` places markers with a `TOWN_MARK_REACH = 12` paper-pixel hit radius for `TOWN_HOUSE_LABEL = 'Your house'` and `TOWN_BOARD_LABEL = 'Notice Board'` (with unread count, restricted to non-bounty model `41739` boards while open online).
