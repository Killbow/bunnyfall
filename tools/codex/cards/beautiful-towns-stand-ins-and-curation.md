---
slug: "beautiful-towns-stand-ins-and-curation"
title: "Town-Mod Stand-In Models, Curated Classic Towns, and Interior Landing"
domain: "world"
kind: "subcard"
parent: "beautiful-towns-layout-mods-overview"
files:
  - "src/world/townStandIns.js"
  - "src/world/detStandIns.js"
  - "src/world/customModels.js"
  - "src/world/townPictures.js"
  - "src/world/rmbrpHillShapes.js"
  - "src/world/flatFields.js"
  - "src/world/rmbFlats.js"
  - "src/world/rmbLayout.js"
  - "src/world/curatedPlacements.js"
  - "src/systems/quest/markerCuration.js"
  - "src/systems/quest/sceneMount.js"
  - "src/player/enterExit.js"
  - "src/scenes/dataPipeline.js"
  - "src/talk/talkTopics.js"
  - "src/net/decorLaw.js"
  - "tools/rmbrpHills.mjs"
routes: []
tables: []
replacesBible:
  - "03-World/Beautiful-Towns.md"
related:
  - "beautiful-towns-layout-mods-overview"
  - "house-nature-flats-boulder-uvs-and-wod-sea-region"
  - "town-mod-quest-site-fallback-overview"
invariants:
  - "`CURATED_CLASSIC` (src/world/layoutPins.js) keeps Beautiful Villages out of the TVRNAS00/TVRNAS06 tavern blocks (locationType 6) and out of 34 temple locations listed by key."
  - "`installTownStandIns` registers the port's stand-ins. `cityWallFillModel` slices the middle of classic wall 445 so the fill piece is solid. `blockHillSeat`/`blockHillPatch` seat models over drawn hills."
  - "`classicModelIdOf` maps alias models such as the recolored beds 42069-42086 back to classic beds 41000-41002, so rest-in-bed and decor sizing read the classic model."
  - "`interiorLanding` tries doors nearest the entry first, offset `ENTER_DOOR_OFFSET` (0.75) along the door normal, and accepts the first spot `standsAt` approves. A body more than `INTERIOR_VOID_DROP` (10) below the lowest triangle returns to the door."
  - "`UNCARRIED_GUILD_FACTIONS` = {1000} draws no guild hall in talk topics."
traps:
  - "A stand-in texture without an image draws a clear pixel in src/scenes/dataPipeline.js; never throw from an interior load for a missing material."
  - "`DECOR_BASE_KEY_RE` accepts `m<placement>:<model>` and `f<flat>:<archive>.<record>` with up to 5-digit archives; widen it in lockstep with new flat archives."
dfu:
  - "Assets/Scripts/Internal/DaggerfallBillboard.cs"
  - "Assets/Scripts/Utility/RMBLayout.cs"
tags:
  - "stand-ins"
  - "rmb"
  - "curation"
  - "interior-landing"
  - "town-mods"
---

# Town-Mod Stand-In Models, Curated Classic Towns, and Interior Landing

To render modded settlements without proprietary custom mesh bundles, Bunnyfall synthesizes procedural stand-in geometry, curates conflicting classic blocks, and validates interior door landings.

## Stand-In Geometry, Aliases, and Curation

- **Procedural stand-ins and hills:** `installTownStandIns` (`src/world/townStandIns.js`, `src/world/detStandIns.js`, `src/world/customModels.js`, and `src/world/townPictures.js`) registers stand-in meshes and billboard atlases (`ROSYS_PICTURES`, `DET_PICTURES`, `RMBRP_STALL_FRAME` at counter height `1.388`, and `prismZ` dock geometry), while `WINDMILL_MODEL_ID` (`41600`) lives in `src/world/rmbLayout.js`. `cityWallFillModel` slices the center of classic wall `445` into a solid filler, and `blockHillSeat` plus `blockHillPatch` (`src/world/rmbrpHillShapes.js` and `tools/rmbrpHills.mjs`) seat buildings across sculpted hills. Missing stand-in textures resolve to a clear pixel in `src/scenes/dataPipeline.js` rather than throwing during interior load.
- **Model aliases and decor keys:** `classicModelIdOf` maps alias models such as recolored beds `42069` through `42086` back to classic beds `41000` through `41002` for bed rest and furniture sizing. In `src/net/decorLaw.js`, `DECOR_BASE_KEY_RE` validates `m<placement>:<model>` and `f<flat>:<archive>.<record>` up to 5-digit archives (`src/world/flatFields.js` and `src/world/rmbFlats.js`).
- **Curated exclusions and interior landing:** `CURATED_CLASSIC` excludes Beautiful Villages from `TVRNAS00` and `TVRNAS06` tavern blocks (`locationType` `6`) and 34 keyed temple locations (`src/world/curatedPlacements.js`, `src/systems/quest/markerCuration.js`, and `src/systems/quest/sceneMount.js`), while `UNCARRIED_GUILD_FACTIONS` (`{1000}` in `src/talk/talkTopics.js`) omits uncarried guild halls from talk topics. On entry (`src/player/enterExit.js`), `interiorLanding` tests doors nearest the entrance at `ENTER_DOOR_OFFSET` (`0.75`) along the door normal until `standsAt` succeeds, and snaps any body falling more than `INTERIOR_VOID_DROP` (`10`) below the lowest triangle back to the door.
