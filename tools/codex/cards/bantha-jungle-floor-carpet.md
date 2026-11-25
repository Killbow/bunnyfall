---
slug: bantha-jungle-floor-carpet
title: "Jungle Floor Carpet and Meadow Hand-off"
domain: rendering
kind: subcard
parent: bantha-jungle-overview
files:
  - src/world/jungle/jungleFloorHost.js
  - src/render/jungleFloorArt.js
  - src/render/labGrass.js
  - src/render/grassMeadow.js
  - src/world/jungle/jungleRegion.js
replacesBible:
  - "03-World/Bantha-Jungle.md"
related:
  - bantha-jungle-overview
  - bantha-jungle-area-field-and-layout
invariants:
  - "jungleFloorDraw(wx, wz) is a pure integer hash on a 0.125-meter grid: points where the hash falls below the local layout share belong to the jungle floor and all other points belong to meadow grass, so the two carpets never overlap."
  - "Floor plants never grow on stone, roads, dirt tracks, water, or snow; eligible surfaces are classified by tile record (floorRecordsOf) rather than texel color because swamp stone tiles appear green."
  - "Jungle floor art sets hue to 0 so plants keep their own sprite colors instead of taking the red terrain tint."
  - "Floor density JUNGLE_FLOOR_PLANTS_M2 equals the meadow grass rate (JUNGLE_FLOOR_GRASS) plus custom jungle flora at JUNGLE_FLOOR_JUDGED (1.8 plants per square meter)."
traps:
  - "Do not hardcode the 760-meter wake radius: JUNGLE_FLOOR.near is computed as LAB_GRASS.range (300) + JUNGLE_EDGE.out (60) + 400."
  - "The shared floorRecordsOf helper in src/render/labGrass.js also admits green non-road tile records >= 4 (excluding road records 46, 47, and 55), so it is not restricted exclusively to records 1 and 2."
tags:
  - jungle
  - grass
  - foliage
  - floor
  - rendering
---

# Jungle Floor Carpet and Meadow Hand-off

`src/world/jungle/jungleFloorHost.js` renders a dense tropical ground carpet that blends smoothly into standard exterior meadow grass (`src/render/grassMeadow.js`) across the Bantha ecotone (`src/world/jungle/jungleRegion.js`).

## Ecotone Partition and Surface Filtering

- **Mutually exclusive hand-off:** At every candidate point on a 1/8-meter lattice, `jungleFloorDraw(wx, wz)` computes a deterministic integer hash (seeded with `'JFLR'`, `0x4a464c52`) and compares it against the local `jungleShare`. Points below the threshold spawn jungle floor plants while the rest spawn meadow blades, ensuring the two systems never double-populate the same coordinate.
- **Derived wake distance:** The floor host activates within `JUNGLE_FLOOR.near`, derived at runtime as `LAB_GRASS.range` (`300`) + `JUNGLE_EDGE.out` (`60`) + `400` (`760` meters total).
- **Tile record classification:** Surfaces are filtered through `floorRecordsOf` (`src/render/labGrass.js`) by tile record rather than texture color so green-tinted swamp stone, roads (`46`, `47`, and `55`), tracks, water, and snow stay bare.

## Density and Sprite Palette

Carpet density (`JUNGLE_FLOOR_PLANTS_M2`) combines the baseline meadow rate (`JUNGLE_FLOOR_GRASS`) with `JUNGLE_FLOOR_JUDGED` (`1.8` plants per square meter). `src/render/jungleFloorArt.js` (`JUNGLE_FLOOR_ARCHIVE` `500`, `JUNGLE_FLOOR_PLANTS`) loads RGBA cutouts via `floorPictures` from the active texture pack or classic palette and sets `hue` to `0` so foliage ignores red ground tinting.
