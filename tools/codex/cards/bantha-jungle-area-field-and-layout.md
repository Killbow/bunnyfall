---
slug: bantha-jungle-area-field-and-layout
title: "Jungle Depth Field and Four-Story Layout"
domain: world
kind: subcard
parent: bantha-jungle-overview
files:
  - src/world/jungle/banthaArea.js
  - src/world/jungle/jungleRegion.js
  - src/world/jungleNature.js
  - src/world/natureWire.js
  - src/world/terrainGen.js
replacesBible:
  - "03-World/Bantha-Jungle.md"
related:
  - bantha-jungle-overview
  - bantha-jungle-trails-and-roadside-pairs
  - bantha-jungle-floor-carpet
invariants:
  - "jungleField evaluates on demand rather than sweeping the map: the signed distance for each pixel (in pixels, positive inside) is computed on first read within JUNGLE_FIELD_REACH (6) and cached in a Float32Array."
  - "Each terrain worker job receives only the 3x3 distance neighborhood for that pixel (jungleNine), and jungleDepthAt perturbs the border with JUNGLE_WANDER (octaves at 64 tiles/150 meters and 8 tiles/40 meters, salt 467) so boundaries never follow pixel edges."
  - "Layout weight jungleShare uses a smoothstep across JUNGLE_EDGE (60 meters outside to 480 meters inside), whereas atmospheric weight uses JUNGLE_AIR_EDGE (2,000 meters outside to 4,000 meters inside)."
  - "Canopy positions use a quincunx grid (canopySite, JUNGLE.cell of 2 tiles, inset 0.25 to 0.75) so trunks never place closer than 9 meters."
  - "Young understory trees maintain JUNGLE.underClear (4.5 meters times trunk scale) from canopy trunks, and floor cover maintains coverClear (2.2 meters)."
  - "Canopy and young trees never place above JUNGLE.maxSteep (34 degrees), whereas palms and floor cover place up to floorSteep (50 degrees)."
  - "Understory trees, palms, and floor cover skip location rectangles, POI clearings, dirt tracks, and beaches."
traps:
  - "Tree placement weights ground by tile record JUNGLE.ground ({1: 0.7, 2: 1, 3: 0.2}), allowing stone tiles (record 3) at reduced weight even though the floor carpet rejects stone."
  - "JUNGLE.grove.cell (32) must evenly divide 128 or species groves reset along every map pixel edge."
tags:
  - jungle
  - layout
  - terrain-worker
  - canopy
  - determinism
---

# Jungle Depth Field and Four-Story Layout

`src/world/jungle/jungleRegion.js` computes signed pixel distances lazily on first query (`jungleField`) within `JUNGLE_FIELD_REACH` (`6` pixels, positive inside `banthaArea.js`) and caches them as `Float32Array` values. Terrain worker jobs (`src/world/terrainGen.js`) receive only the 3x3 distance neighborhood (`jungleNine`). At world coordinates, `jungleDepthAt` adds two-octave value noise (`JUNGLE_WANDER`, 64-tile/150 m and 8-tile/40 m octaves, salt `467`), feeding `jungleShare` (`JUNGLE_EDGE`, `60` m outside to `480` m inside) and `JUNGLE_AIR_EDGE` (`2000` m outside to `4000` m inside).

## Four Stories and Species Selection

`src/world/jungleNature.js` populates four vertical stories on a quincunx lattice (`canopySite`, `JUNGLE.cell` `2` tiles, inset `0.25-0.75`, minimum `9` m trunk spacing) with patchy border groves (`jungleStandNoise`):

- **Emergents and canopy:** Emergent crowns (`emergent` `0.08`, scale `1.28-1.55`) and main canopy trees (`canopy` `0.9`, scale `0.8-1.18`) filter by `JUNGLE.maxSteep` (`34` degrees) and `JUNGLE.ground` weights (`{1: 0.7, 2: 1, 3: 0.2}`). `canopySpecies` combines `JUNGLE.base`, 32-tile grove noise (`JUNGLE.grove.cell`), elevation above beach (`low` `25` m, `high` `120` m), and glade light (`gladeField`).
- **Understory and floor cover:** Young trees (`under` `0.16`, `gapUnder` `0.42`, keeping `JUNGLE.underClear` `4.5` m scaled from canopy trunks), archive `500` palms (`palm` `0.05` up to `floorSteep` `50` degrees), and `JUNGLE_COVER` (`coverClear` `2.2` m) skip towns, POIs, tracks, and beaches. `withJungle` returns `jungleLayout(...).flats`, serialized across `src/world/natureWire.js` (`packNature` and `unpackNature` columns `jungle` and `js`).
