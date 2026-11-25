---
slug: passage-quay-tow-and-ferry-clear
title: "Passage Arrival and Clearance: PASSAGE-QUAY Tow and FERRY-CLEAR"
domain: world
kind: subcard
parent: passage-booked-voyages-overview
files:
  - src/systems/naval/passageQuay.js
  - src/systems/naval/seaClearance.js
  - src/systems/naval/quays.js
  - src/systems/naval/shipLife.js
  - src/systems/naval/navalRams.js
  - src/systems/naval/seaHelm.js
  - src/travel/travelViewWorld.js
routes: []
tables: []
replacesBible:
  - "03-World/Passage.md"
related:
  - passage-booked-voyages-overview
  - harbor-quays-docking-and-gangways
  - naval-ramming-and-grapple-boarding
  - naval-traffic-captain-ai-and-online-sea
invariants:
  - "bringIn (quay.begin) fires when the harbor named by rec.to has its mouth within BRING_IN_M = 700 m and a free berth. The path is planned over beamWater (halfWidth + TOW_CLEAR_M = 3 m)."
  - "Tow speed is TOW_WAY = 4 m/s, easing to TOW_SLOW = 1.5 within TOW_EASE_M = 60 m. She advances only with her head within TOW_SWING (10 degrees) of the path, and is otherwise turned at TOW_TURN."
  - "A hull within TOW_FOUL_M = 25 m ahead holds her. A still hull (or land) gives up after TOW_FOUL_S = 40 s. A moving hull (way >= HULL_LEAD_MIN_MPS = 0.5) counts only toward TOW_WAIT_S = 120 s. When the quay is given up, state 'foul' is returned and the landfall stands."
  - "FERRY-CLEAR: hullAlong stops looks HULL_CLEAR_M = 6 m off other hulls. ledHulls projects moving hulls every HULL_LEAD_STEP_S = 2 s out to HULL_LEAD_S = 8 s. Piers are handled by quays.js pierAlong. All are combined in tvSeaLandAlong."
traps:
  - "A refused harbor key stays refused for that passage. A harbor with no path is retried only after TOW_RETRY_S = 10 s."
  - "footprintClear blocks a tow step that would lay her over land unless she is already over land."
dfu: []
tags:
  - passage
  - quay
  - tow
  - ferry-clear
  - collision
---

# Passage Arrival and Clearance: PASSAGE-QUAY Tow and FERRY-CLEAR

Open-water clearance steers voyages around piers and traffic via `hullAlong` and `pierAlong`, while `passageQuay.js` tows an arriving ship into a berth at her destination harbor.

- **Quay Approach Planning (`src/systems/naval/passageQuay.js`, `src/systems/naval/shipLife.js`):** `navalHost` exposes `bringIn: quay.begin` and `berthing: quay.state` (`'in' | 'fast' | 'foul' | null`). `bringIn` fires when `rec.to` has its harbor mouth within `BRING_IN_M = 700` m and an open berth (`BERTH_SPACING = 1.25`). The tow path plans across `beamWater` (`halfWidth + TOW_CLEAR_M = 3` m). A refused harbor key stays refused for that passage, while a harbor with no path retries after `TOW_RETRY_S = 10` s.
- **Tow Motion and Foul Timeouts (`src/systems/naval/passageQuay.js`):** The vessel tows at `TOW_WAY = 4` m/s, easing to `TOW_SLOW = 1.5` within `TOW_EASE_M = 60` m, advancing only with her head within `TOW_SWING` (`10` deg) of the path and otherwise turning at `TOW_TURN`. `footprintClear` blocks any step onto land unless already over land. A hull within `TOW_FOUL_M = 25` m ahead holds her: a still hull or land times out after `TOW_FOUL_S = 40` s, while a moving hull (`way >= HULL_LEAD_MIN_MPS = 0.5`) counts toward `TOW_WAIT_S = 120` s before returning `'foul'` and leaving the landfall standing.
- **FERRY-CLEAR Avoidance (`src/systems/naval/seaClearance.js`, `src/systems/naval/quays.js`, `src/systems/naval/seaHelm.js`, `src/systems/naval/navalRams.js`, `src/travel/travelViewWorld.js`):** `createSeaHulls` exposes `hullAlong`, stopping look rays `HULL_CLEAR_M = 6` m off other hulls and projecting traffic via `ledHulls` every `HULL_LEAD_STEP_S = 2` s out to `HULL_LEAD_S = 8` s. `tvSeaLandAlong` combines `hullAlong` and `pierAlong` (`RAM_COOLDOWN_S = 3`).
