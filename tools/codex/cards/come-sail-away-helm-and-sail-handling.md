---
slug: "come-sail-away-helm-and-sail-handling"
title: "Helm Ladder, HELM-WAY, SAIL-FREE, and the Time Scale"
domain: "world"
kind: "subcard"
parent: "come-sail-away-overview"
files:
  - "src/systems/naval/helmWay.js"
  - "src/systems/naval/seaHelm.js"
  - "src/systems/naval/comeSailAway.js"
  - "src/systems/naval/comeSailAwayActions.js"
  - "src/ui/enhancedHelm.js"
  - "src/ui/inputActions.js"
  - "src/mods/features.js"
routes: []
tables: []
replacesBible:
  - "03-World/Come-Sail-Away.md"
related:
  - "come-sail-away-overview"
  - "naval-voyage-hold-berth-still-and-sail-wind"
  - "naval-traffic-captain-ai-and-online-sea"
invariants:
  - "`HELM_WAY` = { sailAccel 3.5, coast 3, turnAccelSail 2.4, steerFloor 3, steerPeak 14, steerPeakV 4.5 }; applies only when prefs `naval-handling` is not 'classic' (`isResponsive`)."
  - "`SAIL_FREE` = { pace 1.2, gain 1.643 }; per-hull gains come from `SAIL_FREE_GAINS` via `sailFreeGain`, and the rowboat gets 1."
  - "`POINT_OF_SAIL` = { run 0.9, quarter 45, head 0.55 }; `SAIL_CREST_DEG` = 135 for lateen/gaff/stay sails."
  - "`TIME_SCALES` = [1, 5, 10, 15, 30] offline; online (HELM-TIME-ONLINE) the dial stays at 1."
traps:
  - "`CARGO_HOLD_MISSING` (3) is the fallback cargo threshold only under responsive handling when a hull has no `modifierCargoThreshold` (the Carrack); classic keeps the mod behavior."
  - "NPC captains do not use SAIL-FREE; they keep HELM-WAY pace and `navalAI.js` windFactor."
dfu: []
tags:
  - "come-sail-away"
  - "helm"
  - "sailing"
  - "handling"
---

# Helm Ladder, HELM-WAY, SAIL-FREE, and the Time Scale

Player helm controls, responsive handling curves, point-of-sail gains, and time acceleration are coordinated across `src/systems/naval/helmWay.js`, `src/systems/naval/seaHelm.js`, `src/systems/naval/comeSailAway.js`, `src/systems/naval/comeSailAwayActions.js`, `src/ui/enhancedHelm.js`, `src/ui/inputActions.js`, and `src/mods/features.js`.

- **Helm ladder, oars, and responsive steering:** `W/S` and `Up/Down` step a single propulsion ladder: `-1` oars backing, `0` rest, `1` ahead, `2` raise sails, and `3` more (square) sail. Rowing without crew drains `OAR_FATIGUE` (`11`) every `OAR_MODE_TIME`. When preference `naval-handling` is not `'classic'` (`isResponsive`), `HELM_WAY` (`{ sailAccel: 3.5, coast: 3, turnAccelSail: 2.4, steerFloor: 3, steerPeak: 14, steerPeakV: 4.5 }`) governs acceleration and turning, `HULL_HELM` scales turn rate by `[1, 1, 0.75, 0.25, 0.75]` across hulls while `steerage(v)` eases from `steerFloor` to `steerPeak` at `steerPeakV`, and `CARGO_HOLD_MISSING` (`3`) supplies the fallback `modifierCargoThreshold` for the Carrack.
- **Sail wind, SAIL-FREE, and time scale:** Outdoor `seaWind` multiplies `WIND_RATED` (`1.5`) by `windShare` clamped to `WIND_SHARE` (`[0.3, 2]`), with zero wind indoors. `SAIL_FREE` (`{ pace: 1.2, gain: 1.643 }`) and `SAIL_FREE_GAINS` via `sailFreeGain` (`1` for the Rowboat) combine with `POINT_OF_SAIL` (`{ run: 0.9, quarter: 45, head: 0.55 }`) and `SAIL_CREST_DEG` (`135`); NPC captains exclude `SAIL-FREE`. Offline helm time scale steps through `TIME_SCALES` (`[1, 5, 10, 15, 30]`), stays at `1` online (`HELM-TIME-ONLINE`), and resets on `OnPreJump` (`HELM-JUMP`).
