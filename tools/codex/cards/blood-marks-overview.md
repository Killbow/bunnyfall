---
slug: blood-marks-overview
title: "Blood Marks, Gore Dial, and the Four Hosts"
domain: combat
kind: overview
parent: null
files:
  - src/combat/bloodSwitch.js
  - src/combat/hitEffects.js
  - src/combat/bloodMarks.js
  - src/combat/bloodDecals.js
  - src/mods/features.js
  - src/scenes/world.js
  - src/scenes/exterior.js
  - src/scenes/dungeonContext.js
  - src/scenes/worldModes.js
  - tools/bloodProbe.mjs
routes: []
tables: []
replacesBible:
  - "05-Combat/Blood-Arc.md"
related:
  - blood-spray-overkill-and-gibs
  - blood-bleeding-tracks-and-screen-spatter
  - blood-atlas-drying-and-wet-film
  - combat-formulas-and-power-ceiling
  - arrow-flight-and-conjured-arrows
invariants:
  - "Every host builds its marks with `createBloodMarks({ renderer, collider, settings: bloodDecalDeps })`. The one frozen `bloodDecalDeps` bag keeps the four hosts from each spelling it differently."
  - "`showBloodSplash(bloodIndex, pos, facing, hit)` plays the `TEXTURE.380` splash and then calls `marks.place`. Callers must pass a `bloodHit(...)` blow, or the mark falls to the bottom rung."
  - "The ring is allocated once to the gore tier capacity and never grows. A density change applies immediately; a capacity change applies on reload (a dungeon picks it up on entry)."
traps:
  - "No mod is vendored. DaggerBlood is a feel reference only, and no DLL code or art ships."
  - "The gore tier keys are lowercase, and `bloodGore()` falls back to `'normal'` for any unknown value."
dfu:
  - "Assets/Scripts/Game/EnemyBlood.cs"
  - "Assets/Scripts/Game/EnemyHealth.cs"
tags:
  - blood
  - gore
  - decals
  - hit-effects
  - prefs
---

Surface blood decals, gore capacities, and combat hit splashes run across all four scene hosts (`src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/dungeonContext.js`, and the interior host in `src/scenes/worldModes.js`), with automated inspection in `tools/bloodProbe.mjs`. No external mod is vendored; DaggerBlood serves only as a feel reference.

## Preferences and Gore Tiers

`src/combat/bloodSwitch.js` and `src/mods/features.js` expose four preferences that default to enabled: `blood-marks` (`bloodMarksOn`, also disabled by `?blood=off`), `blood-gore` (`BLOOD_GORE_PREF`), `blood-overkill` (`BLOOD_OVERKILL_PREF`), and `blood-screen` (`BLOOD_SCREEN_PREF`).

`GORE_TIERS` defines four lowercase presets:
- `light`: `{ density: 0.5, capacity: 300 }`
- `normal` (the default fallback in `bloodGore()`): `{ density: 1, capacity: 600 }`
- `heavy`: `{ density: 1, capacity: 1500 }`
- `abattoir`: `{ density: 1, capacity: 4000 }`

Ring buffer capacity is clamped between `50` and `4000` (`src/combat/bloodDecals.js`) and allocated once per host initialization. Changing density takes effect immediately, whereas changing capacity applies on reload or upon entering a dungeon.

## Four-Host Wiring and Hit Splashes

Every host instantiates its decal manager via `createBloodMarks({ renderer, collider, settings: bloodDecalDeps })` in `src/combat/bloodMarks.js`, sharing the single frozen `bloodDecalDeps` bag. When an attack lands, `showBloodSplash(bloodIndex, pos, facing, hit)` in `src/combat/hitEffects.js` plays the classic `BLOOD_ARCHIVE` (`380`, `TEXTURE.380`) splash animation and forwards the blow from `bloodHit(...)` to `marks.place`. Omitting the `bloodHit(...)` payload drops the decal placement to the lowest rate rung. Enemies with `bloodIndex` `2` (`BLOODLESS_INDEX` in `src/characters/enemyBasics.js`: enemy IDs `15`, `18`, `19`, `23`, `32`, and `33`) play their own splash record and leave no surface marks (`marksBlood`).
