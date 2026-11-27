---
slug: enhanced-lighting-clusters-light-ids-and-pools
title: "Enhanced Lighting Clusters, Light Identity, Cap Fades, and Interior Dimming"
domain: rendering
kind: subcard
parent: enhanced-lighting-lane-overview
files:
  - src/render/lightClusters.js
  - src/render/lightId.js
  - src/world/cityLights.js
  - src/world/interiorLights.js
  - src/render/improvedInteriorLighting.js
  - src/render/enhancedLighting.js
  - src/scenes/worldModes.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Enhanced-Lighting-Arc.md"
related:
  - enhanced-lighting-lane-overview
  - enhanced-lighting-shadow-maps-and-casters
  - sky-weather-and-lighting
invariants:
  - "Clusters: CLUSTER_X/Y/Z = 16 x 9 x 24 exponential frustum cells from CLUSTER_NEAR 0.25 to CLUSTER_FAR 256, read through grid texture unit 9 and list texture unit 10 (CLUSTER_GRID_UNIT, CLUSTER_LIST_UNIT). Those units must stay TEXTURE_2D only."
  - "lightIdOf (lightId.js) gives light records a non-enumerable identity, so a moving caster is redrawn directly without invalidating static caches. Lights must pass through packLight/copyLights/adoptLight/relight to keep it."
  - "Street, dungeon and WOD pools fade the 48-light cap boundary over LIGHT_CAP_FADE = 16 units (capFadeColors, capFadePairs in cityLights.js)."
  - "A light whose sphere reaches nearer than `CLUSTER_NEAR` is listed in every tile of slice `0` (`cellsOfSphere`), because the hosts' near planes sit closer than the slices begin."
traps:
  - "Spreading a light record ({...light}) drops its non-enumerable identity, so the shadow cache treats it as a new light. Use copyLights/adoptLight."
  - "Building lamps under the lane are scaled by EL_INTERIOR_LIGHT_SCALE = 0.5 (interiorLightColor). The scene must also apply EL_INTERIOR_GRADE through setSceneGrade, or rooms read flat."
dfu:
  - Assets/Scripts/Game/PlayerAmbientLight.cs
tags:
  - clustered-lighting
  - light-identity
  - interior
  - lanterns
---

# Enhanced Lighting Clusters, Light Identity, Cap Fades, and Interior Dimming

`src/render/lightClusters.js`, `src/render/lightId.js`, and scene light pools organize point lights across the 48-light lane budget without cache churn or boundary popping.

- **Frustum clustering (`lightClusters.js`):** The view frustum subdivides into `CLUSTER_X = 16`, `CLUSTER_Y = 9`, and `CLUSTER_Z = 24` exponential depth slices from `CLUSTER_NEAR = 0.25` to `CLUSTER_FAR = 256`. Shaders sample the cluster grid on texture unit `CLUSTER_GRID_UNIT = 9` and the `CLUSTER_LIST_W = 256` by `CLUSTER_LIST_ROWS = 256` index list on `CLUSTER_LIST_UNIT = 10` (both strictly `TEXTURE_2D`). Passing `?clusters=off` clears `uClusterOn`.
- **Non-enumerable light identity (`lightId.js`):** `lightIdOf` attaches a hidden identity to each light object so moving casters update their existing shadow slots without flushing static caches. Callers must clone or mutate lights through `packLight`, `copyLights`, `adoptLight`, or `relight`, because object spread (`{...light}`) strips the non-enumerable tag.
- **Pool cap fades and interior dimming (`cityLights.js`, `interiorLights.js`, `improvedInteriorLighting.js`, `worldModes.js`):** Street (`fillLanternPool`, `lanternSlot`), dungeon, and WOD pools ramp intensity across the 48-light cutoff over `LIGHT_CAP_FADE = 16` units via `capFadeColors` and `capFadePairs`. Inside buildings, rooms retain the 0.18 gray DFU `InteriorAmbientLight` (`PlayerAmbientLight.cs`), scale lamp emission by `EL_INTERIOR_LIGHT_SCALE = 0.5` (`interiorLightColor`), and apply `EL_INTERIOR_GRADE = { adaptKey: 0.12, adaptMax: 1.2 }` (`interiorGrade`) through `setSceneGrade`.
