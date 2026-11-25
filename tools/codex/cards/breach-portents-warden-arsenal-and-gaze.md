---
slug: breach-portents-warden-arsenal-and-gaze
title: "Warden Arsenal: Chains, Wheel, and Burning Gaze"
domain: multiplayer
kind: subcard
parent: breach-portents-overview
files:
  - src/net/gateBrain.js
  - src/net/wire.js
  - src/worldEvents/gateCourt.js
  - src/ui/gateGroundView.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Breach-Portents.md"
related:
  - breach-portents-overview
  - breach-boss-brain-and-courts
  - enemy-telegraphs-poise-and-punish
invariants:
  - "Every grounded telegraph in `ATTACKS` gives a fighter running at `7.6` m/s enough wind-up time to clear the zone, whereas Burning Gaze projects no ground marker and must be dodged by turning the camera away."
  - "Burning Gaze hits any challenger within `GAZE_RANGE_M` (`60` m) whose view cone holds the boss within `GAZE_HALF_DEG` (`50` degrees) when the cast lands, applying a `GAZE_BLIND_MS` (`2000` ms) blind."
  - "Chains grab targets within `CHAIN_HOLD_M` (`16` m) and drag them toward `CHAIN_PULL_TO_M` (`4` m) by at most `CHAIN_PULL_MAX_M` (`12` m), with each client resolving its own pull displacement."
traps:
  - "`WHEEL_PERIL_MS` (`1000` ms) is a client-side danger window in `src/worldEvents/gateCourt.js`, not a relay brain constant."
  - "Wire coordinate clamping uses `GATE_COURT_BOUND` (`160`) in `src/net/wire.js`, whereas court layouts and radii live in `COURTS`, `WALKS`, and `COURT_R` (`24`) in `src/net/gateBrain.js`."
dfu: []
tags:
  - portents
  - telegraphs
  - boss
  - attacks
---

Valkynaz Ruhn's attack catalog (`ATTACKS` in `src/net/gateBrain.js`) combines ground-marked telegraphs with line-of-sight and pull hazards evaluated on the client (`src/worldEvents/gateCourt.js` and `src/ui/gateGroundView.js`).

## Telegraph Timing, Chains, and Wheel Peril

The relay schedules boss actions from `ATTACKS` and broadcasts `atk` sub-words over the `gate` room frame. Grounded wind-ups allow a fighter running at `7.6` m/s to clear the telegraph before impact. Struck clients report hits back via `hit` sub-words while the relay stays authoritative over boss state.

Chains grab any challenger within `CHAIN_HOLD_M` (`16` meters) and pull them toward `CHAIN_PULL_TO_M` (`4` meters) by at most `CHAIN_PULL_MAX_M` (`12` meters), with each client resolving its own pull displacement. Wheel hazards use a client-side danger window `WHEEL_PERIL_MS` (`1000` ms) in `src/worldEvents/gateCourt.js`.

## Burning Gaze and Wire Geometry Bounds

Unlike ground telegraphs drawn by `src/ui/gateGroundView.js`, Burning Gaze has no ground marker and is dodged by looking away. When the cast lands, any fighter within `GAZE_RANGE_M` (`60` meters) whose camera view holds Ruhn within `GAZE_HALF_DEG` (`50` degrees) takes the strike and is blinded for `GAZE_BLIND_MS` (`2000` ms).

Court platforms and bridges are defined by `COURTS`, `WALKS`, and `COURT_R` (`24` meters) in `src/net/gateBrain.js`, while wire position packets clamp coordinates to `GATE_COURT_BOUND` (`160`) in `src/net/wire.js`.
