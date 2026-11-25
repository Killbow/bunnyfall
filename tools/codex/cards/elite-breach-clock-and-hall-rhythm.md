---
slug: elite-breach-clock-and-hall-rhythm
title: "Breach Clock, Count, Respite, and Hall Stages"
domain: multiplayer
kind: subcard
parent: elite-breach-spire-overview
files:
  - src/net/eliteGates/egLaw.js
  - src/net/eliteGates/egBrain.js
  - src/net/eliteGates/egDurable.js
  - src/net/eliteGates/egClock.js
  - src/systems/eliteGates/egSwap.js
  - src/ui/eliteGates/egHud.js
routes:
  - /internal/eg/stage
  - /internal/eg/called
  - /internal/eg/void
  - /internal/eg/rcpt
replacesBible:
  - "11-Multiplayer/Elite-Gates.md"
related:
  - elite-breach-spire-overview
  - elite-breach-hall-generator-and-span-solver
  - room-engine-and-hub-sharding
invariants:
  - "One game minute equals `EG_GAME_MIN_MS` (5,000 real ms); the arch rises for `EG_RISE_MS` (20 s), stays sealed for `EG_RISE_MIN` (60 game min), and admits players for at most `EG_ADMIT_MAX_MIN` (60 game min)."
  - "The Count starts at `EG_COUNT_START_MIN` (360 game min, 30 real min), gains `EG_REDOUBT_HOLD_MIN` (180) per Redoubt up to `EG_COUNT_CAP_MIN` (360), and stops at `EG_LAST_WORD_MIN` (2,160 game min, 3 real h)."
  - "Overflow above `EG_COUNT_CAP_MIN` converts into Surplus up to `EG_SURPLUS_MAX` (3); Respite starts at `EG_RESPITE_BUDGET_MS` (15 min), adds `EG_RESPITE_VALK_MS` (10 min) per Valkynaz Redoubt, and spends in `EG_RESPITE_STEP_MS` (2 min) increments."
  - "Hall transitions enforce `EG_GATHER_MS` (8 s, waking by `EG_ARRIVE_MAX_MS` 30 s), closing timers of `EG_CLOSING_FIGHT_MS` (20 s) or `EG_CLOSING_SPAN_MS` (45 s), `EG_DOOR_REACH_M` (3 m), and Redoubt rest `EG_REST_S` (90 s)."
traps:
  - "During a closing phase, the Count ticks for only `EG_CLOSING_COUNT_S` (15 s) and then pauses until the next hall."
  - "An absent member counts as fallen after `EG_ABSENT_TRIAL_MS` (180 s) of trial time; Durable Object restarts refund gaps over `EG_GAP_MS` (2 s) and hold up to `EG_REJOIN_MS` (180 s)."
  - "Void tombstones persist for `EG_VOID_MAX_S` (7 days); the hub retries opens `EG_OPEN_HUB_TRIES` (3) times and retains `EG_RC_KEEP` (16) receipts."
tags:
  - clock
  - timers
  - stages
  - durable-object
---

`src/net/eliteGates/egClock.js`, `src/net/eliteGates/egLaw.js`, `src/net/eliteGates/egBrain.js`, and `src/net/eliteGates/egDurable.js` pace Spire runs across arch admission, the Count, Respite pauses, and hall transitions.

## Arch Admission, Count, Surplus, and Respite

One game minute is `EG_GAME_MIN_MS` (5,000 real ms). At open, the arch rises for `EG_RISE_MS` (20 s), stays sealed for `EG_RISE_MIN` (60 game min), and admits roster members for up to `EG_ADMIT_MAX_MIN` (60 game min).

The Count starts at `EG_COUNT_START_MIN` (360 game min, 30 real min) under a hard ceiling of `EG_LAST_WORD_MIN` (2,160 game min, 3 real h). Each Redoubt adds `EG_REDOUBT_HOLD_MIN` (180) up to `EG_COUNT_CAP_MIN` (360); excess converts into Surplus up to `EG_SURPLUS_MAX` (3). Companies also hold an `EG_RESPITE_BUDGET_MS` (15 min) Respite pool, gaining `EG_RESPITE_VALK_MS` (10 min) per Valkynaz Redoubt and spending in `EG_RESPITE_STEP_MS` (2 min) steps (`src/ui/eliteGates/egHud.js`).

## Hall Stages, Swaps, and Durable Recovery

Halls report through `/internal/eg/stage`, `/internal/eg/called`, `/internal/eg/void`, and `/internal/eg/rcpt`. Door reach (`EG_DOOR_REACH_M` 3 m) triggers an `EG_GATHER_MS` (8 s) gather (`EG_ARRIVE_MAX_MS` 30 s wake cap; late wakers across `EG_LATE_HALLS` 2 halls cut gather to `EG_LATE_ARRIVE_MS` 10 s). Stragglers enter closing (`EG_CLOSING_FIGHT_MS` 20 s or `EG_CLOSING_SPAN_MS` 45 s), where the Count ticks for only `EG_CLOSING_COUNT_S` (15 s). Redoubts grant `EG_REST_S` (90 s) rest, and circle swaps (`src/systems/eliteGates/egSwap.js`) wait `EG_SWAP_WAIT_MS` (1.5 s) before veiled re-entry.

Absent members fall after `EG_ABSENT_TRIAL_MS` (180 s). Durable Object restarts refund gaps over `EG_GAP_MS` (2 s) and hold `EG_REJOIN_MS` (180 s). Tombstones last `EG_VOID_MAX_S` (7 days), with `EG_OPEN_HUB_TRIES` (3) open retries and `EG_RC_KEEP` (16) cached receipts.
