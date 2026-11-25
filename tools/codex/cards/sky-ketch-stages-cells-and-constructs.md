---
slug: sky-ketch-stages-cells-and-constructs
title: "Sky-Ketch Stages, Aether Cells, and Enemies"
domain: multiplayer
kind: subcard
parent: sky-ketch-raid-overview
files:
  - src/net/ketch/ketchBrain.js
  - src/net/ketch/ketchDeck.js
  - src/net/ketch/ketchConstructs.js
  - src/net/ketch/ketchJudge.js
  - src/systems/ketch/ketchClient.js
  - src/systems/ketch/ketchDeckHost.js
  - src/world/ketch/ketchModel.js
  - server/src/index.js
replacesBible:
  - "11-Multiplayer/Sky-Ketch.md#stages"
  - "11-Multiplayer/Sky-Ketch.md#engine"
  - "11-Multiplayer/Sky-Ketch.md#constructs"
related:
  - sky-ketch-raid-overview
  - tonal-warden-fight-and-downed-crew
  - enemy-ai-navmesh-and-combat-tactics
invariants:
  - "Stage `'watch'` runs `KT_WATCH_WAVES` (`5`) waves starting when a player enters the waist or `KT_WATCH_WAIT_MS` (`12 s`) after first boarding; subsequent waves spawn `KT_WAVE_GAP_MS` (`3 s`) after the previous wave clears."
  - "Stage `'gallery'` cycles hammers and steam vents on the shared clock (`hazardsBetween`) and wakes two Hammer Wardens past `KT_WARDEN_WAKE_Z` or on damage, advancing once both reach zero health."
  - "Carrying an Aether cell sheaths weapons and caps movement speed at `KT_CARRY_PACE` (`0.72`); taking a hit, dying, drawing a weapon, or releasing drops the cell for `KT_CELL_LIES_MS` (`15 s`), whereas leaving the floor or disconnecting destroys it."
  - "Relay step validation rejects cell pickups, banking, or bridge unbarring faster than `KT_FAST_RUN_MPS` (scaled by `KT_CARRY_PACE` while carrying) minus `KT_STEP_SLACK` (`0.15`), and re-picking a dropped cell preserves its original pickup origin and timestamp."
traps:
  - "Arc-coil shocks check segment intersection between consecutive player poses (`crossesLane` in `src/net/ketch/ketchJudge.js`) rather than point radius, so moving across a live arc between updates still drops a carried cell."
  - "Deck enemy IDs start at `KT_BODY_ID0` (`1000`) to avoid colliding with the Tonal Warden (`KW_ID = 1`) or tuning forks (`KW_FORK_ID0 = 200` through `215`)."
tags:
  - multiplayer
  - sky-ketch
  - aether-cells
  - enemies
  - hazards
  - anti-cheat
---

The raid progresses through four deck stages in `src/net/ketch/ketchBrain.js` before the boss fight. In `'watch'`, `watchWave(w, n)` spawns 5 enemy waves (adding the Watch-Captain on wave 5) with a 1.2-second rise (`KT_RISE_MS`) and 3-second corpse retention (`KT_DOWN_KEEP_MS`). Opening `'gallery'` runs deterministic hazards from `src/net/ketch/ketchDeck.js`: `KT_HAMMER` (6 rows by 3 lanes, 3.0 s cycle) and `KT_STEAM` (4.0 s cycle), guarding two Hammer Wardens that wake when struck or when a player crosses `KT_WARDEN_WAKE_Z`.

## Engine Cells and Step Validation

In `'engine'`, six cradles respawn Aether cells every `KT_CRADLE_BACK_MS` (`28 s`, or `12 s` on the bridge) while `KT_ARCS` cycles three arc-coil pairs every 5.0 seconds and four vents spawn `KT_SPIDERS_AT_ONCE` (`2`) spiders every `KT_SPIDER_EVERY_MS` (`6 s`) up to `spidersMaxFor(n) = 5 + crew`. Advancing requires banking `engineNeeds(n) = min(7, 5 + ceil(n / 2))` cells (6 for 1–2 crew, 7 for 3+).

Carriers move at `KT_CARRY_PACE` (`0.72`) with weapons stowed. Dropping a cell leaves it on the deck for `KT_CELL_LIES_MS` (`15 s`); picking it back up retains the original pickup position and time so relay travel checks cannot be bypassed by drop-relaying. In `'sailwalk'`, minimum traversal timers (`KT_SAILWALK_LEAST_MS` and `KT_CROSS_LEAST_MS`) and pose freshness (`KT_POSE_FRESH_MS = 25 s`) gate unbarring the `'bridge'` door.

## Enemy Health Scaling

In `src/net/ketch/ketchConstructs.js`, `constructHp` multiplies `hpS` seconds by `dpsRef(meanLevel)`: spheres (`16`), sentries (`24`), and spiders (`5`) scale by mean level alone, whereas Hammer Wardens (`72`, `crewX = 0.7`) and the Watch-Captain (`100`, `crewX = 0.8`) also multiply by crew count.
