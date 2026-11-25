---
slug: passage-master-helm-resume-and-step-off
title: "Passage Voyage: Master's Helm, Resume Clock, and Stepping Off"
domain: world
kind: subcard
parent: passage-booked-voyages-overview
files:
  - src/systems/naval/passageHost.js
  - src/systems/naval/passageHelm.js
  - src/systems/naval/passage.js
  - src/systems/naval/seaHelm.js
  - src/travel/travelGovernor.js
  - src/systems/naval/comeSailAway.js
  - src/systems/naval/comeSailAwayBoat.js
routes: []
tables: []
replacesBible:
  - "03-World/Passage.md"
related:
  - passage-booked-voyages-overview
  - passage-quay-tow-and-ferry-clear
  - naval-and-come-sail-away
  - travel-view-routing-and-load-governor
invariants:
  - "passengerHelm: while mastersHelm (a charter is set and journey.live) is true, rudder/oars/sails/trim read only the journey hand. The passenger keeps PASSENGER_KEYS (disembark, Transport, timeScaleUp/Down/Reset)."
  - "When the voyage halts (journey not live), the helm belongs to the passenger again (AUDIT FB1021d PS-2)."
  - "Resume clock: the first try comes after PASSAGE_FIRST_S = 2 s, then every PASSAGE_RESUME_S = 20 s. After PASSAGE_RESUMES = 3 consecutive failures, the interval is multiplied by PASSAGE_SLOW = 3. A failed canGo (enemy near) spends no try."
  - "A journey aimed anywhere but rec.to is stopped, and PASSAGE_TEXT.holds is said."
  - "Passage ends after PASSAGE_OFF_S = 1.5 s spent farther than PASSAGE_LEAVE_M (20) + hullReach(hull) from her root while not aboard. Hold contents go to the pack via remove()."
traps:
  - "aboard() also counts boatInPlay, so boarding another ship does not end the passage."
  - "A null charterRecord (invalid save) never sails, and ends only once the player is off her."
  - "frame() skips while deps.busy() (doors or jumps in flight)."
dfu: []
tags:
  - passage
  - helm
  - resume
  - disembark
  - pace
---

# Passage Voyage: Master's Helm, Resume Clock, and Stepping Off

During an active charter voyage, the shipmaster steers and propels the vessel while a resume clock recovers from interruptions and a distance timer detects disembarkation.

- **Master's Helm and Traveller Pace (`src/systems/naval/passageHelm.js`, `src/systems/naval/seaHelm.js`, `src/travel/travelGovernor.js`):** In `passengerHelm`, while `mastersHelm` (`charter` set and `journey.live`) holds, rudder, oars, sails, and trim read only the journey hand while the player retains `PASSENGER_KEYS` (`disembark`, `Transport`, `timeScaleUp`/`Down`/`Reset`) and sees `passengerCard` (hull, ship name, port, and time dial). If wanted sails cannot be raised, `seaHelm.js` rows. When the journey halts, helm control returns to the passenger. `travellerPace = max(player.speed, boat.way)` tracks helm velocity and zeroes when off the helm, warped, or beached.
- **Destination Guard and Resume Clock (`src/systems/naval/passageHost.js`, `src/systems/naval/passage.js`):** `frame()` skips ticks while `deps.busy()` holds. Any journey aimed outside `rec.to` is stopped with `PASSAGE_TEXT.holds`. When halted, the resume clock retries after `PASSAGE_FIRST_S = 2` s and then every `PASSAGE_RESUME_S = 20` s, multiplying the interval by `PASSAGE_SLOW = 3` after `PASSAGE_RESUMES = 3` failures; a failed `canGo` (enemy near) spends no try.
- **Stepping Off (`src/systems/naval/passageHost.js`, `src/systems/naval/comeSailAway.js`, `src/systems/naval/comeSailAwayBoat.js`):** A null `charterRecord` never sails and ends once off the ship. `aboard()` counts `boatInPlay` so boarding another ship does not end the passage. Passage ends after `PASSAGE_OFF_S = 1.5` s unaboard beyond `PASSAGE_LEAVE_M` (`20`) + `hullReach(hull)` from her root, moving hold items to the pack via `remove()`.
