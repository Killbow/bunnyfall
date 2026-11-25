---
slug: house-nature-flats-boulder-uvs-and-wod-sea-region
title: "Roofed Nature-Flat Culling, Box-Mapped Boulder UVs, and WoD Sea Region Check"
domain: world
kind: subcard
parent: held-power-bases-and-relay-health-share-overview
files:
  - src/world/rmbFlats.js
  - src/world/townStandIns.js
  - src/world/wodLocationLoader.js
  - src/world/pixelBuild.js
  - src/formats/mapsFile.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-18f.md"
related:
  - held-power-bases-and-relay-health-share-overview
  - landforms-terrain-shaper-overview
invariants:
  - "`sceneryUnderRoof` (`src/world/rmbFlats.js`) skips RMB nature flats when all four automap cells surrounding the foot belong to architecture within one building footprint."
  - "`boulderMesh` (`src/world/townStandIns.js`) orients faces outward and `boulderUv` box-maps UVs along each face dominant normal axis, while `prismZ` builds dock ramps (`53143`) and dock steps (`53144`)."
  - "`src/world/pixelBuild.js` passes `regionIndex: maps.getRegionIndexAt(px, py)` into `src/world/wodLocationLoader.js`, which treats a pixel as ocean when `WOD_OCEAN_REGIONS` (`[31, 3, 29, 28, 30]`, `WOD_REFUSED_REGION = 31`) contains `regionIndex` and `worldHeight <= 2`."
traps:
  - "Never read location-record region on non-location wilderness pixels (`GetMapPixelData` leaves it unset); always query `maps.getRegionIndexAt(px, py)`."
  - "Planar UV projection smears steep boulder faces; keep dominant-axis box mapping in `boulderUv`."
dfu: []
tags:
  - rmb
  - boulders
  - world-of-daggerfall
  - ocean
---

# Roofed Nature-Flat Culling, Box-Mapped Boulder UVs, and WoD Sea Region Check

Roofed nature-flat culling, box-mapped boulder geometry, and World of Daggerfall sea region checks operate across `src/world/rmbFlats.js`, `src/world/townStandIns.js`, `src/world/wodLocationLoader.js`, `src/world/pixelBuild.js`, and `src/formats/mapsFile.js`.

- **Roofed nature-flat culling:** In `src/world/rmbFlats.js`, `sceneryUnderRoof` samples the four automap cells surrounding a nature flat foot and culls the billboard whenever all four cells belong to architecture inside a single building footprint, preventing trees and bushes from poking through house floors and roofs.
- **Box-mapped boulders and dock prisms:** In `src/world/townStandIns.js`, `boulderMesh` winds triangle faces outward and `boulderUv` projects UVs using dominant-axis box mapping along each face normal so steep boulder sides never smear under planar projection. In the same module, `prismZ` constructs dock ramps (`53143`) and dock steps (`53144`).
- **World of Daggerfall sea region check:** Because non-location wilderness pixels leave the location-record region unset, `src/world/pixelBuild.js` queries `maps.getRegionIndexAt(px, py)` (`src/formats/mapsFile.js`) and passes `regionIndex` into `src/world/wodLocationLoader.js`. The loader classifies a pixel as ocean when `WOD_OCEAN_REGIONS` (`[31, 3, 29, 28, 30]`, where `WOD_REFUSED_REGION = 31` with `politic = 64` represents open sea) contains `regionIndex` and `worldHeight <= 2`.
