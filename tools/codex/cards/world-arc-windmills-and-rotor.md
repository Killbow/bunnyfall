---
slug: "world-arc-windmills-and-rotor"
title: "Windmills: Vendored Placements and the Integrated Rotor"
domain: "world"
kind: "subcard"
parent: "world-arc-classic-port-overview"
files:
  - "src/world/windmills.js"
  - "src/world/windmillMesh.js"
  - "scripts/bakeWindmill.mjs"
  - "scripts/bakeWindmillInterior.mjs"
  - "tools/windmillProbe.mjs"
  - "vendor/windmills-kamer/placements.json"
  - "vendor/windmills-kamer/variants.json"
  - "vendor/windmills-kamer/interior.json"
  - "vendor/windmills-kamer/machinery.json"
  - "vendor/windmills-kamer/README.md"
routes: []
tables: []
replacesBible:
  - "03-World/World-Arc.md"
related:
  - "world-arc-classic-port-overview"
  - "world-modes-and-transitions"
invariants:
  - "Classic Daggerfall places no windmills; the 7 vendored FARMAA placements in placements.json are the only mills."
  - "Rotor angle is integrated per frame by advanceRotor(state, dt, wind), never angle = rate * elapsed."
  - "Rotor turns about ROTOR_AXIS 'z' with ROTOR_SIGN = -1 at ROTOR_HUB [3.96, 6.01, -5.5]; fair weather runs CALM_ROTOR_DEG_PER_SEC = 13."
traps:
  - "Vendored meshes are Unity left-handed; X must be negated on bake or the blades spin and face mirrored."
  - "Mills are gated by windmillsOn() (a pref); hosts must not mount rotors or MILL_SOUND when it is off."
  - "FARMAA00/FARMAA01 RMB JSON declare fewer subrecords than they carry; read every record, not NumBlockDataRecords."
dfu:
  - "Assets/Scripts/Utility/RMBLayout.cs"
  - "Assets/Scripts/Internal/DaggerfallStaticDoors.cs"
tags:
  - "windmills"
  - "vendor"
  - "rotor"
  - "wind"
  - "farms"
---

# Windmills: Vendored Placements and the Integrated Rotor

Classic Daggerfall places no windmills; the seven vendored `FARMAA` placements in `vendor/windmills-kamer/placements.json` provide the only exterior and interior mills (`src/world/windmills.js`, `src/world/windmillMesh.js`).

- **Bake handedness, skins, and RMB subrecords (`scripts/bakeWindmill.mjs`, `scripts/bakeWindmillInterior.mjs`, `vendor/windmills-kamer/variants.json`):** Vendored windmill meshes originate in Unity left-handed space, so the bake pipeline must negate `X` or the blades face and spin mirrored. At runtime, `skinnedBody(climateBase, isWinter)` selects the climate and winter body variant from `variants.json`. When scanning `FARMAA00` and `FARMAA01` RMB JSON, readers must iterate every record in the array rather than trusting `NumBlockDataRecords`, which declares fewer subrecords than the block carries.
- **Preference gate, integrated rotor, and interior machinery (`src/world/windmills.js`, `vendor/windmills-kamer/interior.json`, `vendor/windmills-kamer/machinery.json`):** Hosts gate all mill placement on `windmillsOn()` and must not mount rotors or loop `MILL_SOUND` (`SOUND.ArenaFireDaemon` at `millSoundPosition(modelMatrix)`) when the preference is disabled. The exterior rotor integrates its angle per frame via `advanceRotor(state, dt, wind)` rather than computing `rate * elapsed`, rotating around `ROTOR_AXIS = 'z'` with `ROTOR_SIGN = -1` at `ROTOR_HUB` (`[3.96, 6.01, -5.5]`). Fair weather turns at `CALM_ROTOR_DEG_PER_SEC = 13`, whereas gale-force wind furls the sails at `FURL_DEG_PER_SEC = 40` instead of overspinning. Inside the mill, `advanceMachinery` drives model `41601`, `Plank_Gear`, and `Roller`.
