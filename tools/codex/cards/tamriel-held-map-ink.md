---
slug: tamriel-held-map-ink
title: "Tamriel Ink on the Held Map and Intro Pull-Back"
domain: ui
kind: subcard
parent: tamriel-continent-frame-overview
files:
  - src/ui/tamrielInk.js
  - src/ui/heldMap.js
  - src/ui/inkMap.js
  - src/ui/mapSkin.js
  - src/ui/introTamriel.js
  - src/world/tamrielGeography.js
routes: []
tables: []
replacesBible:
  - "03-World/Tamriel.md"
related:
  - tamriel-continent-frame-overview
  - tamriel-runtime-trace-and-fit
  - ui-arc-front-door-intro-and-brand
invariants:
  - "No cost on the Bay: tamrielInkFor builds once per data set (keyed by the Bay coast array). The ink paints only on the kept static layer and only when viewLeavesBay holds; inside the Bay the only cost is one rectangle test."
  - "The Bay is a hole in the ink. Chains go through clipOutsideRect and dropEdgeRuns, and their cut ends stitchToBay to the data's coast ends within STITCH_REACH = 64."
  - "Authored geography: classifyEdges counts each ring edge as coast (unshared) or border (shared by exactly two province rings)."
  - "INTRO4 (src/ui/introTamriel.js buildTamrielField) is data-free and deterministic. It uses the authored geography only, never TMAP00I0 or WOODS.WLD, and writes no world state."
traps:
  - "A traced coast that runs along the Bay frame is the frame, not a shore. dropEdgeRuns removes it."
  - "Authored cities snap up to CITY_SNAP_PX = 10 onto the traced land of their province, or are left off the sheet."
dfu: []
tags:
  - tamriel
  - held-map
  - ink
  - intro
  - performance
---

# Tamriel Ink on the Held Map and Intro Pull-Back

The held map inks the continent around the Iliac Bay rectangle on its cached static canvas layer, while the front-door intro pull-back renders a deterministic field from the authored vector topology.

- **Authored Topology and Traced Contours (`src/world/tamrielGeography.js`, `src/ui/tamrielInk.js`):** In `src/world/tamrielGeography.js`, `PROVINCES`, `COAST`, `ISLANDS`, `BORDERS`, `MOUNTAIN_RANGES`, `RIVERS`, `SEAS`, and `CITIES` share named vertices `V` validated by `classifyEdges`. When a runtime trace is active, `tracedChains` extracts `0.5`-level marching-squares shore segments via `contourSegments`, snaps border endpoints to the coast within `BORDER_SNAP_PX = 1.5` (`snapEnds`), and smooths chains with `chaikinCapped` (`SMOOTH_PASSES = 3`, `COAST_SIMPLIFY_PX = 0.4`, `COAST_CUT_PX = 0.75`). Without a trace, `fretRing` perturbs rings outside `FRET_CALM = 3`.
- **Bay Hole Clipping, Stitching, and Static Layer Paint (`src/ui/tamrielInk.js`, `src/ui/heldMap.js`, `src/ui/inkMap.js`, `src/ui/mapSkin.js`):** `buildTamrielInk` (`tamrielInkFor`, keyed by `bayModel.coast` and `tamrielLandVersion()`) cuts chains outside the Bay via `clipOutsideRect`, strips frame-hugging segments with `dropEdgeRuns`, and joins cut ends to `bayCoastEnds` within `STITCH_REACH = 64` (`stitchToBay`). `placeCity` snaps authored cities up to `CITY_SNAP_PX = 10` onto traced province land. `src/ui/heldMap.js` reads `tamrielMapOn()` on open and calls `paintTamrielInk` (reusing `penOf` and `spacedName` with Bay `ZOOM_BANDS`) only when `viewLeavesBay` holds. When `onContinent(scale, bayFit)` (`CONTINENT_BELOW = 0.85`) is true, carets thin to `CARET_STEP.continent = 12` and the `62` Bay region names hide. `tamrielPlaceAt` resolves hover hits within `CITY_HIT_PX = 9`.
- **Data-Free Intro Field (`src/ui/introTamriel.js`):** `buildTamrielField` rasterizes the authored rings (`FIELD_PX = 4`, `1280 x 800`) without reading `TMAP00I0.IMG` or `WOODS.WLD`.
