---
slug: elite-breach-look-wreck-sky-and-air
title: "Elite Breach Wreck, Underside, Painted Sky, Motes, and Halos"
domain: rendering
kind: subcard
parent: elite-breach-look-overview
files:
  - src/world/eliteGates/egVista.js
  - src/world/eliteGates/egUndersideModel.js
  - src/world/eliteGates/egUnderside.js
  - src/render/eliteGates/egSkyMap.js
  - src/render/eliteGates/egSkyPass.js
  - src/render/eliteGates/egMotes.js
  - src/render/eliteGates/egMistPass.js
  - src/render/sdHalo.js
  - src/world/eliteGates/egLights.js
  - src/systems/eliteGates/egLookDraw.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Elite-Gates-Look.md"
related:
  - elite-breach-look-overview
  - super-dungeon-look-hour-sky-islands-and-steps
  - super-dungeon-look-rift-return-and-veil
invariants:
  - "`EG_VISTA_BUDGET`: 8000 triangles, each wing 200-1500, 6 draws. Wings sit 120-450 m out and 30-160 m above or below the floors."
  - "Wings turn slowly via `egVistaTurn(i)`; this is the only motion in environment geometry."
  - "The Spire's underside is a model (`buildEgUndersideModel` in `egUndersideModel.js`, laid by `buildEgVista` as `under`). The sky never paints it: one underside, never two."
  - "`EG_SKY_MAP` is 512, an octahedral NEAREST map painted one quadrant per call by the band's fragment shader (lite: one quadrant every fourth call). `egSkyPass.js` fetches it with one triangle at the far plane, depth-tested LEQUAL."
  - "Motes draw 600-1000 points in one additive draw, under L2 except the hottest embers and sparks (L3). They fade within `EG_MOTE_FLOOR.clear` (3 m) of any floor top."
  - "`egHalosInto` keeps at most `EG_HALO.max` (48) halos per frame, none beyond `EG_HALO.far` (120 m)."
traps:
  - "`egUnderside.js` is the stair-fall camera law (`EG_FALL`, `egFallEye`, `egFallCamera`), not the underside mesh. Edit `egUndersideModel.js` for geometry."
  - "`SD_HALO_MAX` (64) is the shared renderer buffer; the Spire's own cap is `EG_HALO.max` 48."
dfu: []
tags:
  - elite-gates
  - eg-look
  - sky
  - wreck
  - motes
  - halos
---

# Elite Breach Wreck, Underside, Painted Sky, Motes, and Halos

`src/world/eliteGates/egVista.js`, `src/render/eliteGates/egSkyMap.js`, and `src/render/eliteGates/egMotes.js` render the distant Wreck, the Sealed Spire underside, the octahedral sky map, and atmospheric particles.

- **Distant Wreck and Underside Mesh:** `buildEgVista` lays out distant wings within `EG_VISTA_BUDGET` (`8000` total triangles, `200-1500` per wing, and `6` draw calls; `EG_VISTA_LITE` is `4` on phones), positioned `120-450` m out and `30-160` m above or below the floors. Wings rotate slowly via `egVistaTurn(i)` as the only moving environment geometry. `buildEgVista` also places `under` from `buildEgUndersideModel` (`src/world/eliteGates/egUndersideModel.js`), while `egUnderside.js` governs the stair-fall camera (`EG_FALL`, `egFallEye`, and `egFallCamera`).
- **Octahedral Painted Sky:** `EG_SKY_MAP` is a `512` px NEAREST octahedral map painted one quadrant per update (one quadrant every fourth call in lite mode) by the band fragment shader, omitting the Spire underside so it is never doubled. `egSkyPass.js` samples the map using a single far-plane triangle with `LEQUAL` depth testing.
- **Motes, Rim Mist, and Halos:** `egMotes.js` renders `600-1000` points in one additive pass, capped under luminance tier L2 except for hot embers and sparks at L3, fading within `EG_MOTE_FLOOR.clear` (`3` m) of any floor top. Band `1` adds up to `8` rim mists (`EG_RIM_MIST`) per frame via `egMistPass.js`. `egHalosInto` limits frame halos to `EG_HALO.max` (`48`, within `SD_HALO_MAX` `64`) and culls past `EG_HALO.far` (`120` m). `airState()` in `egLookDraw.js` exposes counts for `tools/spireLabProbe.mjs` and `spire.html`.
