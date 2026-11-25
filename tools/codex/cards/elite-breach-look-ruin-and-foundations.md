---
slug: elite-breach-look-ruin-and-foundations
title: "Elite Breach Ruin Layer: Foundations, Bridges, Cornices, Columns, and Lamps"
domain: rendering
kind: subcard
parent: elite-breach-look-overview
files:
  - src/world/eliteGates/egRuin.js
  - src/world/eliteGates/egCircleParts.js
  - src/world/eliteGates/egCircleWorker.js
  - src/world/eliteGates/egHall.js
  - src/world/eliteGates/egKit.js
  - src/world/sdIslandModel.js
  - src/world/sdRealm.js
  - src/net/eliteGates/egLaw.js
  - src/systems/eliteGates/egOcclude.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Elite-Gates-Look.md"
related:
  - elite-breach-look-overview
  - elite-breach-hall-generator-and-span-solver
  - elite-breach-spire-client-rules-and-telegraphs
  - super-dungeon-look-hour-sky-islands-and-steps
invariants:
  - "Nothing in the Ruin is a collider. `buildEgRuinParts(seed, c, geo, { lite })` judges each piece against the hall law (`ruinLaw`: discs, bands, lanes, ramps, passages, ring walls, swept steps) and drops the whole piece if any part would stand above a floor's top inside its footprint."
  - "The Ruin builds in the circle worker (`egCircleBuild` in `egCircleParts.js`) and on the main thread for the first stand, byte for byte the same."
  - "`EG_RUIN` fixes the measures: ring 2.5 m past the rim, column pitch 6-9 m (lite 12), wayPad 4 m, depth 20-40 m, lampTop 2.6-3.4 m, slab 0.6 m, bridge bay 6-8 m (lite 12), tris 20000 (lite 12000)."
  - "`EG_RUIN_CORNICE`: crown 0.002 m under the floor's top, inner gap 0.004 m, reach at most 0.35 m past the edge."
  - "Lamps sit on column tops at most `EG_LAMP_BUDGET` (n 12, r 40) per disc via `egCircleLights`."
traps:
  - "Tall Ruin pieces must be flagged as `model.occluders` so EG-ZN camera dithering (`egOcclude.js`) can fade them."
  - "Foundations reuse the Hour's `hangPlan`/`islandRoot`/`SD_SPIRE` from `src/world/sdIslandModel.js` (3-6 spires under the `SD_LIP` 0.5 slab lip); do not fork them."
  - "Brink thirds are thirds of the hall's route (`egRoute.js`), never of z."
dfu: []
tags:
  - elite-gates
  - eg-look
  - ruin
  - geometry
  - occluders
  - lite
---

# Elite Breach Ruin Layer: Foundations, Bridges, Cornices, Columns, and Lamps

`src/world/eliteGates/egRuin.js` builds non-colliding architectural dress around Elite Breach discs and spans, producing identical geometry in `egCircleWorker.js` and on the main thread.

- **Law Clearance and Ways:** `buildEgRuinParts(seed, c, geo, { lite })` tests every piece against `ruinLaw` (discs, bands, lanes, ramps, passages, ring walls, and swept steps) and discards any piece that rises above a floor top inside its footprint. Access ways stay clear around `egMoltenRim(spec)` ends, step ends, passage mouths, and ring-wall gaps with a `4` m `wayPad`.
- **Measures and Cornices:** `EG_RUIN` sets the outer ring `2.5` m past the rim, foundation depth `20-40` m, slab thickness `0.6` m, and triangle budgets of `20000` (`12000` in lite mode). `EG_RUIN_CORNICE` places crowns `0.002` m below the floor top with a `0.004` m inner gap and up to `0.35` m outward reach.
- **Foundations and Bridges:** Disc foundations reuse `hangPlan`, `islandRoot`, and `SD_SPIRE` (`src/world/sdIslandModel.js`) to hang `3-6` spires (`1` in lite mode) beneath the `0.5` m `SD_LIP` slab lip. Bridges span `6-8` m bays (`12` m in lite mode) with voussoir arches, filled spandrels, and piers dropping `16-28` m.
- **Columns, Lamps, and Static Dress:** Columns space every `6-9` m (`12` m in lite mode); one in three (`wholeEvery: 3`) stands whole under an entablature while others break at seeded heights. `egCircleLights` places up to `EG_LAMP_BUDGET` (`n: 12`, `r: 40`) column-top lamps (`2.6-3.4` m) on both tiers. Banners and chains remain static, and tall pieces set `model.occluders` for `egOcclude.js`.
