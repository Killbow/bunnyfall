---
slug: witches-festival-town-dressing
title: "Regional Town Dressing and Wyrd Sister Placement"
domain: world
kind: subcard
parent: witches-festival-overview
files:
  - src/world/witchesDecor.js
  - src/world/pixelBuild.js
  - src/world/festivalArt.js
  - src/worldEvents/siegeField.js
  - src/world/cityNavigation.js
  - src/net/festivalLaw.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Witches-Festival.md"
related:
  - witches-festival-overview
  - witches-festival-hearth-offerings
  - npc-populations-wardrobe-and-creatures
invariants:
  - "Town dressing spawns whenever `festivalOpen(nowMs)` is true according to the local clock, so decorations appear offline without an account service connection while still respecting `CONTENT.witchesFestival`."
  - "`witchCulture(climateIndex, region)` selects one of the regional `WITCH_KITS` palettes: High Rock, Hammerfell, mountains, fens/jungles, or haunted woodlands."
  - "Every candidate spot must pass three clearance checks: `dryGround` (inside the location RMB bounds and not on water according to `tileWeight`), no wall obstruction between the door front and the spot (`colliderBlocked`), and at least one pace of clearance from existing flats and NPCs."
  - "Placement is deterministic (`witchStepSide` and `seeded(mapId, key, ...)`), ensuring every client dresses the exact same buildings."
  - "Props are placed outside tavern doors (with the Wyrd Sister on one side and the kit centerpiece on the other), outside temple doors, and on selected house steps while leaving home offering positions unobstructed."
traps:
  - "Door prop orientation is derived from `doorFront` and `doorFace` outward vectors (`src/worldEvents/siegeField.js`), not from mesh surface normals."
  - "Live town builds must call `witchesDressingBreathing` (`src/world/pixelBuild.js`) so the generator yields between buildings instead of blocking the frame with synchronous `witchesDressing`."
dfu: []
tags:
  - witches-festival
  - decorations
  - town-build
  - wyrd-sister
  - flats
---

# Regional Town Dressing and Wyrd Sister Placement

During the active festival calendar (`festivalOpen(nowMs)` in `src/net/festivalLaw.js`), town builds add regional Witches' Festival decorations and Wyrd Sister vendors through `src/world/witchesDecor.js`, `src/world/festivalArt.js`, and `src/world/pixelBuild.js`.

## Regional Kits, Seeding, and Clearance Rules

- **Culture kits (`WITCH_KITS` in `src/world/witchesDecor.js`):** `witchCulture(climateIndex, region)` maps each settlement to High Rock, Hammerfell, mountains, fens/jungles, or haunted woodlands. Kits combine classic lights (`TEXTURE.210`), bone flats (`TEXTURE.100`), and custom painted festival art (`src/world/festivalArt.js`: turnip lantern, effigy, and ward-staff).
- **Deterministic placement and door layout:** `seeded(mapId, key, ...)` and `witchStepSide` pick which house steps receive props and which side of each tavern door hosts the Wyrd Sister (`WYRD_SISTER_FLAT`, archive `179`, record `2`, `'mysterious woman'` in `FLATS.CFG`) opposite the kit centerpiece. Temple doors also receive regional pieces, while home Hearth Offering spots remain reserved and clear.
- **Ground and ray clearance (`src/world/cityNavigation.js`, `src/worldEvents/siegeField.js`):** Each prop is oriented along `doorFront` (built on `doorFace` outward vectors) and placed only when `dryGround` confirms dry land inside the RMB block grid (`tileWeight`), `colliderBlocked` confirms no wall blocks the ray from the door front, and neighboring flats or people are at least a pace away.

## Build Pipeline Integration

In `src/world/pixelBuild.js`, `witchesDressingBreathing` yields across buildings during town construction, batching and lighting festival props alongside standard block flats with solid collision bodies.
