---
slug: parkour-ledge-sensing-mantle-vault-and-geometry
title: "Ledge Sensing, Mantle, Clamber, Vault and Hostile Geometry"
domain: world
kind: subcard
parent: parkour-enhanced-climbing-overview
files:
  - src/player/parkour.js
  - src/player/motor.js
  - src/player/collider.js
routes: []
tables: []
replacesBible:
  - "03-World/Parkour-Arc.md"
related:
  - parkour-enhanced-climbing-overview
  - parkour-hang-grip-free-climb-and-leaps
invariants:
  - "Walkable tops and landings need normal Y >= PARKOUR_TOP_MIN_NY (cos 50 deg). PARKOUR_WALL_MAX_NY reuses the same bound, so nothing steeper than 50 deg is stood, landed, or mantled on."
  - "Trajectory clearance is checked every PARKOUR_PATH_STEP = 0.08 m (`pathClear`, `capsuleFits`, `bandsClear`)."
  - "A failed sense waits PARKOUR_QUIET_STEPS = 3 steps before querying again."
  - "A vault needs ground behind within PARKOUR_SAFE_DROP = 5 m. PARKOUR_VAULT_MAX = 1.2 m and PARKOUR_VAULT_DEPTH = 0.9 m."
  - "Cracks under PARKOUR_CRACK = 0.03 m are not hand holds."
traps:
  - "Landing probes nudge laterally by PARKOUR_NUDGE [0, +/-0.15, +/-0.3] near corners. Do not reduce this to a single probe."
  - "Overhead jambs route around via a sidestep search up to PARKOUR_SIDESTEP_MAX = 0.45 m (`_fcSidestep`)."
  - "Eaves up to PARKOUR_EAVE_OUT = 0.8 m are found by `senseEave`/`senseEaveAhead`/`senseEaveLedge`."
  - "`capsuleFits` needs the upward ray as well as `penetrationAt`, because the collider reverts instead of depenetrating a body up into a ceiling, so a standing body inside a slab reads clear."
dfu: []
tags:
  - parkour
  - mantle
  - vault
  - clamber
  - ledge-sensor
  - collision
---

# Ledge Sensing, Mantle, Clamber, Vault and Hostile Geometry

`src/player/parkour.js` probes world colliders (`src/player/collider.js`) to plan mantle, clamber, vault, and drop moves run by `PlayerMotor` (`src/player/motor.js`).

## Surface Bounds, Reach, and Sensors

- **Slopes and cracks:** Walkable tops and landings require normal Y at or above `PARKOUR_TOP_MIN_NY` (`cos(50 deg)`). `PARKOUR_WALL_MAX_NY` reuses that bound so nothing steeper than `50 deg` is stood, landed, or mantled on. Wall seams under `PARKOUR_CRACK` (`0.03` m) are ignored.
- **Reach and clearance:** `parkourReach(skill, load)` lerps `PARKOUR_REACH_MIN` (`1.5` m) to `PARKOUR_REACH_MAX` (`2.1` m), minus up to `PARKOUR_LOAD_CUT` (`0.3` m) above half load. Paths from `senseLedge`, `senseOver`, `senseVault`, `senseDrop`, and `senseEdge` check clearance every `PARKOUR_PATH_STEP` (`0.08` m) via `pathClear`, `capsuleFits`, and `bandsClear`. Failed queries wait `PARKOUR_QUIET_STEPS` (`3`) steps.
- **Hostile geometry:** Landing probes fan across `PARKOUR_NUDGE` (`[0, +/-0.15, +/-0.3]` m) near corners. Eaves out to `PARKOUR_EAVE_OUT` (`0.8` m) resolve via `senseEave`, `senseEaveAhead`, and `senseEaveLedge`, while overhead jambs route around up to `PARKOUR_SIDESTEP_MAX` (`0.45` m) via `_fcSidestep`.

## Planners and Move Timing

`planMantle`, `planClamber`, `planVault`, `planLower`, and `planOverHang` build moves sampled by `movePoint`, begun by `_parkourBegin`, stepped by `_parkourStep` and `_parkourAdvance`, and carried on moving platforms by `carryMove`. Vaults require obstacles within `PARKOUR_VAULT_MAX` (`1.2` m) high and `PARKOUR_VAULT_DEPTH` (`0.9` m) deep with ground within `PARKOUR_SAFE_DROP` (`5` m). `mantleDuration` is `(0.25 + 0.22 * rise) * (1.3 - 0.5 * skill / 100)` and `vaultDuration` is `(0.22 + 0.12 * rise) * (1.2 - 0.3 * jumping / 100)`.
