---
slug: tamriel-imperial-city-and-capital-shapes
title: "Imperial City Grid, Landmarks, and Capital Shapes"
domain: world
kind: subcard
parent: tamriel-continent-frame-overview
files:
  - src/world/imperialCity.js
  - src/world/capitalImperial.js
  - src/world/capitalShapes.js
  - src/ui/introCity.js
routes: []
tables: []
replacesBible:
  - "03-World/Arena-Provinces.md"
related:
  - tamriel-continent-frame-overview
  - tamriel-streamed-landmass
  - pixel-streaming-and-origin-shift
invariants:
  - "`IMPERIAL_SPAN = 7` spans 7 x 7 map pixels (`IMPERIAL_CELLS = 56`, 5.73 km across) anchored at the center grid point, flattening every slice to the center elevation."
  - "`CAPITAL_ARCHIVE = 38400` reserves a procedural pseudo-archive (`CAPITAL_ART` records 0 through 20, with record 13 retired) built via `MeshBuilder` without shipping external game meshes."
  - "Cells holding shores, walls, landmarks, or Green Emperor Way emit custom `I<row><column>` base-36 blocks so landmarks never overlap procedural Daggerfall city blocks."
traps:
  - "`IMPERIAL.lake` (`2720` m) must stay inside the city block boundary (`2764.8` m) and inside the capital rim inner edge (`2796.8` m) so Lake Rumare never spills water into surrounding terrain."
dfu: []
tags:
  - tamriel
  - imperial-city
  - capitals
  - landmarks
---

# Imperial City Grid, Landmarks, and Capital Shapes

`src/world/imperialCity.js`, `src/world/capitalImperial.js`, and `src/world/capitalShapes.js` build the multi-pixel Imperial City and procedural capital landmark geometry using `MeshBuilder` primitives (`CAPITAL_ARCHIVE = 38400`) with zero external mesh assets.

- **Seven-by-Seven City Plan (`src/world/imperialCity.js`, `src/ui/introCity.js`):** `IMPERIAL_SPAN = 7` (`IMPERIAL_CELLS = 56`, `5.73` km across) divides City Isle in Lake Rumare (`IMPERIAL.isle = 2200` m, `IMPERIAL.lake = 2720` m) into 49 map-pixel locations (`IMPERIAL_SLICE_NAMES`) flattened to the center ground. Six walled sectors (`IMPERIAL_SECTORS`, `IMPERIAL_MIX`: Market, Arena, Arboretum, Temple, Talos Plaza, and Elven Gardens) surround Green Emperor Way (`r0 = 548` m, `r1 = 574` m) and the palace wall (`r = 650` m) inside the outer city wall (`r = 1950` m) with six watch towers (`watchTowersAt`), plus the Imperial Prison, Arcane University, Waterfront, and Talos Bridge outside the wall. Cells touching shores, walls, or landmarks use base-36 `I<row><column>` custom blocks; remaining cells hash district-appropriate Daggerfall blocks (`SALT = 0x1c11`).
- **Procedural Shapes and Landmarks (`src/world/capitalShapes.js`, `src/world/capitalImperial.js`):** `capitalShapes.js` provides `taper`, `cap`, `ring`, `ledge`, `wallRun`, `merlons`, `gatedRun`, `roundTower`, `squareTower`, `hall`, `dome`, and `entranceDoor` over `CAPITAL_ART`. `buildImperialTower` builds the octagonal White-Gold Tower (`plinthR = 172` m, `spireTop = 1360` m) with an east-facing palace door.
