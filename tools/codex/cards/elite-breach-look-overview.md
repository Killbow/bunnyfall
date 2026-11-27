---
slug: elite-breach-look-overview
title: "Elite Breach Look: Five Layers, Band Atmospheres, and the Visual-Only Law"
domain: rendering
kind: overview
parent: null
files:
  - src/world/eliteGates/egLook.js
  - src/world/eliteGates/egAtmos.js
  - src/world/eliteGates/egHall.js
  - src/world/eliteGates/egBandArt.js
  - src/world/eliteGates/egKit.js
  - src/systems/eliteGates/egLookDraw.js
  - src/scenes/worldModes.js
  - src/render/renderer.js
  - src/render/enhancedLighting.js
  - spire.html
  - tools/spireLabProbe.mjs
  - src/world/eliteGates/egGround.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Elite-Gates-Look.md"
related:
  - elite-breach-spire-overview
  - elite-breach-spire-client-rules-and-telegraphs
  - super-dungeon-look-overview
  - elite-breach-look-ruin-and-foundations
  - elite-breach-look-wreck-sky-and-air
  - elite-breach-look-lord-presence-and-fall
invariants:
  - "EG-LOOK is visual only: hall specs (`src/net/eliteGates/egLaw.js`), colliders (`egCircleColliderTris`), clamps, and the relay wire stay untouched, and no relay version bump is needed."
  - "Each band (0 Broken Galleries, 1 Soul Cairn, 2 Shade Perilous, 3 Havoc Wellhead) has one `EG_ATMOS` row in `src/world/eliteGates/egAtmos.js` (fog, trilight, key, grade, lamp, motes, sky), read via `egAtmosOf(band)`, clamped to 0-3."
  - "Band grades set `adaptMax` to 1.15, 1.45, 2.0, and 1.6, applied through `renderer.setSceneGrade` (`egHallGrade` in `src/world/eliteGates/egHall.js`)."
  - "`EG_HALL_FOG` is now just `egAtmosOf(0).fog`; per-band fog comes from `egHallFog` and `egHallLighting(c)`."
  - "SD-LOOK pixel law still holds: NEAREST texels, dark void, unlit structure, and light only where it means something."
traps:
  - "`EL_DUNGEON_AMBIENT_SCALE` is 0.35 (`src/render/enhancedLighting.js`), not 1/3."
  - "Telegraphs, edge lines, and white hazards keep their fog floor under every band's fog. Never tint them from `EG_ATMOS`."
  - "Code comments cite `world/superDungeon/...` and `scenes/eliteGates/...` paths that do not exist; the real files are under `src/world/` and `src/systems/eliteGates/`."
  - "`EG_VIGNETTE_BOX` (0.4, 1.0, 1.4) in `egGround.js` is repeated as literals in `egCircleColliderTris` (`src/world/eliteGates/egHall.js`); change both together."
  - "`egFogKept` and the GLSL `uFogFloor` smoothstep in `src/render/gateTelegraph.js`, `src/render/sdStepsPass.js`, and `src/render/eliteGates/egLinePass.js` compute the same fog floor curve; change them together."
dfu: []
tags:
  - elite-gates
  - spire
  - eg-look
  - rendering
  - atmosphere
  - pixel-art
---

# Elite Breach Look: Five Layers, Band Atmospheres, and the Visual-Only Law

`src/world/eliteGates/egLook.js` and `src/systems/eliteGates/egLookDraw.js` dress Elite Breach halls in five visual layers and per-band atmospheres without changing hall colliders, simulation rules, or the relay protocol.

- **Five Visual Layers:** Every hall renders Ground (law floors in `src/world/eliteGates/egHall.js`), Ruin (`egRuin.js`), Wreck (`egVista.js`), Air (`egMotes.js`), and Sky (`egSkyMap.js` with `egSkyPass.js`).
- **Band Atmospheres and Grading:** `egAtmosOf(band)` in `src/world/eliteGates/egAtmos.js` returns the clamped `EG_ATMOS` row for band `0` (Broken Galleries), `1` (Soul Cairn), `2` (Shade Perilous), or `3` (Havoc Wellhead). `egHallGrade` passes the band grade (`adaptMax` values `1.15`, `1.45`, `2.0`, and `1.6`) to `renderer.setSceneGrade`, while `egHallFog` and `egHallLighting(c)` apply per-band fog and lighting (`EG_HALL_FOG` aliases `egAtmosOf(0).fog`).
- **Kit Archives and Styles:** Thirteen `EG_KIT_RECORD` textures (records `60-71` and `81`) pack inside each band archive (`EG_BAND_ARCHIVES`: `38241`, `38251`, `38261`, and `38271`) alongside ground `EG_DRESS` records. `EG_KIT_STYLE[band]` selects the column, capital, cornice, arch, statue, fixture, foundation, sigil, and wreck forms for each band.
- **Brink Transitions and Draw Programs:** Brink halls (`EG_BRINK_HALLS` = `[26, 51, 76]`) blend architectural dress across route thirds between adjacent bands. `egLookDraw.js` runs six render programs: lines, sky, mist (`EgMistPass`), motes, lights, and halos.
