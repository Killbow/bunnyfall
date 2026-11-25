---
slug: "snowless-climates-yards-and-house-signs-overview"
title: "Snowless Climates, Yard Footprints, House Signs, and Spell Recasts"
domain: "world"
kind: "overview"
parent: null
files:
  - "src/world/climateSwaps.js"
  - "src/mods/dfmodTextures.js"
  - "src/weather/weatherSim.js"
  - "src/weather/snowfallHost.js"
  - "src/homes/homeYards.js"
  - "src/magic/effects.js"
  - "src/world/houseSigns.js"
  - "src/systems/naval/comeSailAwayPeers.js"
  - "src/world/rmbLayout.js"
  - "src/scenes/world.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-09.md"
related:
  - "travel-view-beyond-bay-and-load-stagger"
  - "homes-camps-guilds-and-territories"
  - "horse-care-keep-stables-and-yards"
invariants:
  - "groundWearsSnow consults winterGroundSnowless (add-on snowless climates), not the archive law alone."
  - "overGround turns winter rain into snow over snowy ground and drifted snow into rain over snowless ground."
  - "poseAhead returns null when the peer word has no boat at the index or names a different hull."
  - "yardLot bounds lots by modelFootRects/footRectsAt ground footprints, not the model bounding box."
  - "A shop sign attaches to the nearest door within SIGN_REACH_M (8 m); a sign whose door is a residence (House1-House4) does not stand."
  - "Re-casts renew rounds (renewRounds in src/magic/effects.js) rather than stacking them."
traps:
  - "Snowless Swamps/Jungles add-on: snowfallHost must treat these climates like desert and deploy no snow tier."
  - "DFU IncumbentEffect.AddState stacks rounds; Bunnyfall deliberately diverges (STACK-CAP)."
dfu: []
tags:
  - "snow"
  - "weather"
  - "homes"
  - "yards"
  - "signs"
  - "effects"
---

# Snowless Climates, Yard Footprints, House Signs, and Spell Recasts

Snowless climate handling, residential yard footprints, shop sign placement, naval peer alignment, and spell duration renewals work together across world rendering, weather simulation, and magic systems.

- **Snowless Climates and Precipitation (`src/world/climateSwaps.js`, `src/mods/dfmodTextures.js`, `src/weather/weatherSim.js`, `src/weather/snowfallHost.js`):** In `src/world/climateSwaps.js`, `groundIsSnowy` and `groundWearsSnow` consult `winterGroundSnowless` for add-on snowless swamp and jungle climates rather than relying on archive rules alone. `src/weather/snowfallHost.js` treats those snowless climates like desert terrain and deploys no snow accumulation tier, while `overGround` converts winter rain into snow over snowy ground and drifted snow into rain over snowless ground.
- **Yards, Shop Signs, Naval Peers, and Recasts (`src/homes/homeYards.js`, `src/world/houseSigns.js`, `src/world/rmbLayout.js`, `src/systems/naval/comeSailAwayPeers.js`, `src/magic/effects.js`):** `yardLot` bounds home lots using `modelFootRects` and `footRectsAt` ground footprints rather than whole model bounding boxes, splitting the ground between two adjacent houses evenly down the middle. Shop signs attach to the nearest door within `SIGN_REACH_M` (`8` m) and suppress any sign whose nearest door belongs to a residence (`House1` through `House4`). For naval peers, `poseAhead` returns `null` when a peer update lacks a boat at the index before `realign` shrinks the boat array, or when it names a different hull. In `src/magic/effects.js`, recasting an active spell calls `renewRounds` to refresh remaining rounds instead of stacking durations.
