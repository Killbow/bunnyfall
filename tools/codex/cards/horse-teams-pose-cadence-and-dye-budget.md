---
slug: horse-teams-pose-cadence-and-dye-budget
title: "Horse Teams: Pose Cadence, Harness Rest, and Dye Budget"
domain: rendering
kind: subcard
parent: performance-priority-overview
files:
  - src/travel/horseCartPool.js
  - src/travel/horseCoats.js
  - src/world/horseView.js
  - src/world/standingHorses.js
  - src/world/roadTeams.js
  - src/net/peerBodies.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Performance-Priority.md"
related:
  - performance-priority-overview
  - npc-lanes-frame-budget-and-build-gate
  - peer-range-and-distant-ship-hulls
invariants:
  - "horsePoseDue measures distance from the camera eye (cam.eye) scaled by lens (lensOf) via cadenceD2, not from the player head."
  - "HORSE_DYE_PICTURES = 5 coat pictures dyed per frame across all pending looks (_dyeBudget)."
  - "Harness sleeps once both ends stay within HARNESS_STILL_M = 1e-4 m for HARNESS_REST_S = 3 s (harnessStill)."
traps:
  - "poseWhereSeen poses at once a horse that just came into view (wasOut), even off-cadence."
  - "Zooming (spyglass) shrinks effective distance, so zoomed horses pose every frame."
dfu: []
tags:
  - horses
  - wagons
  - cadence
  - dye
  - culling
---

# Horse Teams: Pose Cadence, Harness Rest, and Dye Budget

Mounted horses, peer teams, and road wagons throttle skeletal posing, harness simulation, and coat texture dyeing by camera-scaled distance and per-frame budgets.

## Camera-Scaled Pose Cadence and Team Culling

- **Lens-scaled posing (`horseView.js`, `standingHorses.js`, `peerBodies.js`):** `horsePoseDue` computes squared distance from the camera eye (`cam.eye`) scaled by `lensOf` through `cadenceD2` rather than measuring from the player's head. Narrowing the field of view (such as looking through a spyglass) shrinks the effective distance so zoomed horses pose every frame. When a horse enters the frustum from off-screen (`wasOut`), `poseWhereSeen` poses it immediately even on an off-cadence frame.
- **Team draw limits (`horseCartPool.js`, `roadTeams.js`):** Peer horse teams cull via `peerTeamBox` and `teamVerdict` at `PEER_TEAM_DRAW_M = 400` meters with `PEER_TEAM_DRAW_SLACK_M = 25` meters of hysteresis. Ambient road traffic in `src/world/roadTeams.js` draws at most `WAGONS_DRAWN = 6` road wagons at once.

## Harness Sleep and Coat Dye Budget

- **Harness rest (`horseCartPool.js`):** Wagon harnesses stop solving once both attachment ends remain within `HARNESS_STILL_M = 1e-4` meters for `HARNESS_REST_S = 3` seconds (`harnessStill`).
- **Per-frame dye budget (`horseCoats.js`):** `hideOf` memoizes detected horse hide regions, and `_dyeBudget` processes at most `HORSE_DYE_PICTURES = 5` dyed coat pictures per frame across all pending looks.
