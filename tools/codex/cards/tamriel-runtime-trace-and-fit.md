---
slug: tamriel-runtime-trace-and-fit
title: "Tracing the Player's Tamriel Picture and Fitting the Bay"
domain: world
kind: subcard
parent: tamriel-continent-frame-overview
files:
  - src/ui/tamrielTrace.js
  - src/world/tamrielLand.js
  - src/world/tamrielFrame.js
  - src/ui/provinceMap.js
  - src/characters/races.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "03-World/Tamriel.md"
related:
  - tamriel-continent-frame-overview
  - tamriel-streamed-landmass
  - tamriel-held-map-ink
invariants:
  - "Lifecycle: the authored shape stands until preloadTamrielTrace resolves. The world host then calls fitBayToPicture, setTamrielTrace/setTamrielFit (also on the worker) and resets StreamingWorldState.frame. A missing IMG, a null trace or ?tamrieltrace=off leaves the authored continent and logs a warning."
  - "src/world/tamrielLand.js is pure (typed arrays in, answers out). Only src/ui/tamrielTrace.js reads the IMG files."
  - "Trace law: TAMRIEL2.IMG palette index = race id = province (PROVINCE_OF_ID 1..8). The Imperial Province (IMPERIAL_ID = 9) is the enclosedRemainder inside the masks plus the blue coastline of TMAP00I0 (read on MAP.PAL)."
traps:
  - "On the real painting the sea is parchment and only the coastline is blue. Treating blue as sea left the eight masks as islands."
  - "The barrier in enclosedRemainder grows claimed and coast pixels by 1 before the flood fill, so one-pixel gaps in the painted shoreline do not leak the Imperial Province."
  - "Fitting inside-Bay area alone pushed the painted west coasts 100-200 Bay pixels off. The fit scores seam/edge + FIT_AREA_WEIGHT (0.25) * inside agreement."
dfu:
  - Assets/Scripts/Game/UserInterfaceWindows/CreateCharRaceSelect.cs
tags:
  - tamriel
  - trace
  - fit
  - arena2
  - port-doctrine
---

# Tracing the Player's Tamriel Picture and Fitting the Bay

At world boot, Bunnyfall traces the player's local `TAMRIEL2.IMG` and `TMAP00I0.IMG` bitmaps on their own `MAP.PAL` palette and fits the Iliac Bay rectangle against the traced shoreline.

- **Runtime Bitmap Trace (`src/ui/tamrielTrace.js`, `src/ui/provinceMap.js`, `src/characters/races.js`):** `preloadTamrielTrace` loads `TMAP00I0.IMG` (using its `MAP.PAL` via `paletteReader`) and `TAMRIEL2.IMG`, then calls `traceTamrielPicture`. For each entry in `RACE_TEMPLATES`, connected components (`pieces`) of the picker mask off the image border with at least `SPECK_PX = 12` pixels claim provinces `1..8`. Blue coastline pixels (`seaIndices`) and claimed pixels are dilated by `1` pixel to form a flood-fill barrier in `enclosedRemainder`; the largest unreached inland region touching a mask becomes the Imperial Province (`IMPERIAL_ID = 9`).
- **Border Line Closure and Hole Filling (`src/ui/tamrielTrace.js`):** `closeBorderLines` runs up to `4` passes turning unclaimed one-pixel border lines with different provinces on opposite cardinal sides into majority-neighbor land so borders do not become `15` km straits. `fillSpecks` then converts enclosed non-land holes smaller than `HOLE_PX = 6` pixels into rim-majority land while keeping real lakes of `10` or more pixels.
- **Land State and Seam-First Bay Fit (`src/world/tamrielLand.js`, `src/world/tamrielFrame.js`, `src/scenes/world.js`):** Pure `src/world/tamrielLand.js` maps `PROVINCE_OF_ID` (`1..9`), builds `seaDistanceField`, installs traces via `setTamrielTrace` (`tamrielTrace`, bumping `tamrielLandVersion()`), and answers `provinceKeyAt` and `coastDistanceAt`. `fitBayToPicture` searches `25` quarter-step scales in `FIT_PPUS` (`15..21`) within `span = 24` around `{ ox: 46, oy: 52 }`, scoring `seam / edge + FIT_AREA_WEIGHT * (score / cells)` (`FIT_AREA_WEIGHT = 0.25`) before the world host updates `setTamrielFit` and the worker.
