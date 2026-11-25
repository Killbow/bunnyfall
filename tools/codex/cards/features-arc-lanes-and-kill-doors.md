---
slug: features-arc-lanes-and-kill-doors
title: "Features Arc: Condensed Lanes and Kill Doors"
domain: ui
kind: subcard
parent: features-arc-registry-overview
files:
  - src/mods/features.js
  - src/mods/featureLanes.js
  - src/world/landView.js
  - src/world/outdoors.js
  - src/render/waterSurface.js
  - src/combat/combatVisuals.js
  - src/weather/weatherSim.js
  - src/weather/windDrive.js
  - src/weather/windAudio.js
  - src/render/windWisps.js
  - src/audio/enhancedSounds.js
  - src/render/orderedDither.js
  - src/world/smallerDungeons.js
routes: []
tables: []
replacesBible:
  - "10-UI/Features-Arc.md"
related:
  - features-arc-registry-overview
  - sky-weather-and-lighting
  - dungeon-sizing-and-online-quest-relay
  - blood-marks-overview
invariants:
  - "A condensed row names control.lane; its owning module calls registerFeatureLane(name, {tiers, default?, read, write}) at load and readers use resolveControl(f) to merge it."
  - "Lanes: landView (src/world/landView.js), outdoors (src/world/outdoors.js), wind, quickSlots, blood (src/mods/featureLanes.js)."
  - "landViewWrite stores the pref (LAND_VIEW_MIN 1..LAND_VIEW_MAX 6) and writes Experimental/TerrainDistance capped at LAND_VIEW_DFU_MAX 4."
  - "Outdoors tiers: off / dome ('Port sky') / dynamic ('Dynamic Skies'); write sets enhancedEnvironments and dynamic-skies Enabled."
traps:
  - "A lane module not imported before checkFeature makes the row fail with \"lane is not registered\"."
  - "Grass draws only with isEnhanced, enhancedEnvironments and grassDensity > 0 (src/weather/worldWeather.js)."
dfu:
  - "Assets/Scripts/Terrain/StreamingWorld.cs"
tags:
  - features
  - lanes
  - kill-doors
  - land-view
  - wind
  - water
---

# Features Arc: Condensed Lanes and Kill Doors

Multi-store feature rows condense related switches into named lanes registered via `registerFeatureLane(name, { tiers, default?, read, write })` and merged by `resolveControl(f)` in `src/mods/features.js`. Every lane module must load before `checkFeature` runs.

## Registered Feature Lanes

- **`landView` (`src/world/landView.js`):** `landViewWrite` stores `landViewDistance` (`LAND_VIEW_MIN = 1` through `LAND_VIEW_MAX = 6`) and clamps DFU `Experimental/TerrainDistance` (`Assets/Scripts/Terrain/StreamingWorld.cs`) at `LAND_VIEW_DFU_MAX = 4`.
- **`outdoors` (`src/world/outdoors.js`):** Exposes `off`, `dome` (`'Port sky'`), and `dynamic` (`'Dynamic Skies'`), writing both `enhancedEnvironments` and the `dynamic-skies` `Enabled` mod setting (`ringSnap` and `bayer4` in `src/render/orderedDither.js` handle Dynamic Skies dithering).
- **`wind`, `quickSlots`, and `blood` (`src/mods/featureLanes.js`):** The `wind` lane drives `floraSway` (`src/weather/windDrive.js`) and covers `windWisps` (`src/render/windWisps.js`), while `quick-slots` drives `quickbarStyle` (`off`, `diamond`, `hotbar`, `gems`) and covers `quickslots` and `hotbarShape`.

## URL Kill Doors and Layout Stamps

URL query gates override active preferences for debugging: `?water=off` (`waterSwitchOn` in `src/render/waterSurface.js`), `?combatvisuals=off` (`combatVisualsOn` in `src/combat/combatVisuals.js`), `?wxfield=off` (`weatherFieldOn` in `src/weather/weatherSim.js`), `?wisps=off`, `?sway=off`, and `?windaudio=off` (in `src/weather/windAudio.js`, also gated by `enhancedSoundsOn` in `src/audio/enhancedSounds.js`). In `src/world/smallerDungeons.js`, `smallerDungeonsStamp` and `needsStartWarp` stamp saves by built dungeon layout.
