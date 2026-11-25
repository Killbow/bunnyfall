---
slug: tamriel-continent-frame-overview
title: "Tamriel Continent Frame and Switches"
domain: world
kind: overview
parent: null
files:
  - src/world/tamrielFrame.js
  - src/world/tamrielGeography.js
  - src/world/tamrielLand.js
  - src/mods/features.js
  - src/scenes/shared.js
  - src/ui/mapSkin.js
  - src/scenes/world.js
  - src/net/wire.js
  - tools/tamrielFitProbe.mjs
routes: []
tables: []
replacesBible:
  - "03-World/Tamriel.md"
related:
  - tamriel-streamed-landmass
  - tamriel-runtime-trace-and-fit
  - tamriel-held-map-ink
  - tamriel-imperial-city-and-capital-shapes
  - pixel-streaming-and-origin-shift
invariants:
  - "One grid, one offset: a Tamriel pixel is the same 819.2 m as a Bay map pixel (KM_PER_PIXEL = 0.8192). Bay coordinates map to Tamriel through bayToTamriel/tamrielToBay with an offset only; the Bay is never rescaled."
  - "The continent is authored on the 320 x 200 picture grid (PICTURE_W/PICTURE_H). Default PIXELS_PER_PICTURE_UNIT = 18.75 gives TAMRIEL_W x TAMRIEL_H = 6000 x 3750, with BAY_ORIGIN {862, 975}."
  - "Every consumer converts through the live fit (tamrielFit, tamrielSize, pictureToBay, bayToPicture, inBay, tamrielFrameInBay). setTamrielFit(null) restores the authored defaults."
  - "No TMAP00I0.IMG or TAMRIEL2.IMG bytes ship. The trace runs locally from the player's own ARENA2 files."
traps:
  - "Do not import PIXEL_M from src/net/gateLaw.js or anything from net/ into tamriel world modules. The terrain worker reads them, and a net/ import froze the world (TAMRIEL2-WORKER)."
  - "Comments cite world/tamriel/*.js paths, but the files live flat in src/world/."
dfu: []
tags:
  - tamriel
  - frame
  - continent
  - feature-switch
  - kill-door
---

# Tamriel Continent Frame and Switches

The Tamriel continent extends the Iliac Bay grid (`BAY_W = 1000`, `BAY_H = 500`) across all nine provinces at the same `819.2` m per pixel scale (`KM_PER_PIXEL = 0.8192`, `pixelsToKm`) without rescaling Bay coordinates or shipping game bitmap data.

- **Picture Grid and Live Fit (`src/world/tamrielFrame.js`):** The continent is authored on the `320 x 200` picture grid (`PICTURE_W`, `PICTURE_H`). Default `PIXELS_PER_PICTURE_UNIT = 18.75` yields `TAMRIEL_W = 6000` and `TAMRIEL_H = 3750` with `BAY_ORIGIN` at `{ x: 862, y: 975 }`. Runtime fitting installs a live `{ ox, oy, ppu }` pair via `setTamrielFit` (`setTamrielFit(null)` restores defaults). Consumers convert coordinates exclusively through `tamrielFit`, `tamrielSize`, `bayToTamriel`, `tamrielToBay`, `pictureToBay`, `bayToPicture`, `inBay`, `bayPictureRect`, and `tamrielFrameInBay`.
- **Feature Switches and Kill Doors (`src/mods/features.js`, `src/ui/mapSkin.js`, `src/scenes/shared.js`, `src/scenes/world.js`):** Two feature rows govern the continent: `tamriel-map` (group `interface`, prefs key `tamrielMap`, initial `true`, enhanced only; checked when opening the map via `tamrielMapOn`, with URL kill door `?tamriel=off` via `tamrielUrlOff`) and `tamriel-land` (group `world`, prefs key `tamrielLand`, initial `true`; checked at world mount via `tamrielLandOn`, disabled on the classic skin or via `?tamrielland=off`). Passing `?tamrieltrace=off` (`tamrielTraceOn`) keeps the authored geography from `src/world/tamrielGeography.js` instead of tracing `src/world/tamrielLand.js`.
- **Wire Bounds and Local Probe (`src/net/wire.js`, `tools/tamrielFitProbe.mjs`):** `WORLD_PIXEL_BOUND = 8192` (`worldPixelOk`, `POSE_BOUND = WORLD_PIXEL_BOUND * PIXEL_UNITS`) lets poses, cells, and marks beyond the Bay cross the wire. `tools/tamrielFitProbe.mjs` compares Bay edge land and water runs against the continent shape.
