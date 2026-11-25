---
slug: sky-ketch-look-state-record-pvs-and-gauges
title: "Sky-Ketch Look: One State Record, Part-Group PVS, and Gauge Pass"
domain: rendering
kind: subcard
parent: sky-ketch-look-overview
files:
  - src/world/ketch/ketchStates.js
  - src/render/ketch/ktGaugePass.js
  - src/render/orderedDither.js
  - src/systems/ketch/ketchDeckHost.js
  - src/worldEvents/sdSteps.js
  - src/net/ketch/ketchDeck.js
  - src/tools/ketchLabViews.js
  - tools/ketchLabProbe.mjs
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Sky-Ketch-Look.md"
related:
  - sky-ketch-look-overview
  - sky-ketch-stages-cells-and-constructs
  - tonal-warden-fight-and-downed-crew
  - super-dungeon-look-hour-sky-islands-and-steps
invariants:
  - "ketchStatesOf(V, t, now, me, out) writes one kept ketchStatesRecord in place. It allocates nothing per frame and reads only link state and the shared clock."
  - "A draw with no PVS group (the static ship, the land, the sky) is never culled. Culled draws issue no draw and record no shadow."
traps:
  - "KT_LAB_BILL pins the GL-draw ceilings per view (waist 74, gallery 92, hold 92, bridge 136, cabin 136). A slice that adds parts must raise them openly."
dfu: []
tags:
  - state-machine
  - pvs
  - culling
  - gauges
  - instanced
  - performance
---

# Sky-Ketch Look: One State Record, Part-Group PVS, and Gauge Pass

Slice `KL3` packs frame state into one record (`src/world/ketch/ketchStates.js`), culls unseen part groups (`src/systems/ketch/ketchDeckHost.js`), and batches gauges into one instanced pass (`src/render/ketch/ktGaugePass.js`).

- **Frame State Record:** `ketchStatesOf(V, t, now, me, out)` writes a kept `ketchStatesRecord` in place from link state and the shared clock. It sets ship mood (`KT_SHIP`: `asleep` before `KT_STAGE.sailwalk`, `awake` from `sailwalk`, and `singing` while the Warden fight is live with `now >= ws.op` and not fell or lost) plus cradle and socket fills, up to `KT_STATES_LOOSE` (`16`) loose cells, appetite, `wakeAge`, lift part (`KT_LIFT_PART`), hazards, sections (`src/net/ketch/ketchDeck.js`), resonators, forks, stun, ends, and chest.
- **Part-Group PVS and Draw Ceilings:** `KT_PVS` maps views to `KT_GROUP` lists. `pvsGroupsAt` holds a view for `KT_PVS_HOLD_M` (`4` m) and joins both sides within `KT_PVS_DOOR_M` (`6` m) of a doorway (`14` m at the Watch hatch). Static ship, land, and sky draws have no PVS group and never cull; culled draws issue no draw and record no shadow, and `createSdSteps` (`src/worldEvents/sdSteps.js`) accepts a host `seen` flag. `KT_LAB_BILL` (`src/tools/ketchLabViews.js` and `tools/ketchLabProbe.mjs`) pins GL draw ceilings: `waist = 74`, `gallery = 92`, `hold = 92`, `bridge = 136`, and `cabin = 136`.
- **Instanced Gauge Pass:** `ktGaugePass` draws up to `KT_GAUGE_MAX` (`96`) instanced faces (`12` floats each) across `dial`, `glass`, `lamps`, `ring`, and `pulse` (coded as `kind + 10 * meaning`). The shader and its JS twin `ktGaugeAt` posterize `32`-texel faces via `SD_PIXEL_GLSL` (`src/render/orderedDither.js`) in `10` lane or `8` classic steps (`KT_GAUGE_LOOK.steps`).
