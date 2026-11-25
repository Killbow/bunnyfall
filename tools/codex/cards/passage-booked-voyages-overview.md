---
slug: passage-booked-voyages-overview
title: "Passage: Booking and Riding a Friendly Moored Ship"
domain: world
kind: overview
parent: null
files:
  - src/systems/naval/passage.js
  - src/systems/naval/passageBerths.js
  - src/systems/naval/passageHost.js
  - src/systems/naval/navalHost.js
  - src/systems/naval/seasWorld.js
  - src/systems/naval/comeSailAway.js
  - src/systems/naval/fleetHost.js
  - src/systems/naval/boatCabinOwnership.js
  - src/systems/naval/sailingCabin.js
  - src/systems/naval/navalWire.js
routes: []
tables: []
replacesBible:
  - "03-World/Passage.md"
related:
  - passage-booking-fare-and-rollback
  - passage-master-helm-resume-and-step-off
  - passage-quay-tow-and-ferry-clear
  - naval-and-come-sail-away
  - harbor-quays-docking-and-gangways
  - travel-view-routing-and-load-governor
invariants:
  - "A voyage is sailed in real time through the Overworld crossing (travelViewRouteTo with voyage: true). It is never a fast-travel jump."
  - "Only a harbor's own ship can be booked: not a liner/packet, prize, or retiring ship. She must be moored (mooredAt), friendly (stanceOf), one of the PASSAGE_HULLS, and pass passageCrosses for the current helm."
  - "The look ray must strike her hull within PASSAGE_RAY_M = 8 m."
  - "A booked boat carries `charter`, has packable = false, is excluded from the Fleet (fleetHost placed() excludes boats where `charter` is set), from bank cabins (bankCabinCandidates), and from sailing cabins (hasSailingCabin)."
traps:
  - "Only one charter at a time: offer/book refuse with PASSAGE_TEXT.booking while charterBoat() exists."
  - "A booked ship's seed is broadcast so peers retire their copies. The `said` list keeps only the last NAVAL_WIRE_GONE (8) seeds."
dfu:
  - "Assets/Scripts/Game/UserInterfaceWindows/DaggerfallTravelPopUp.cs"
tags:
  - passage
  - naval
  - travel
  - charter
  - harbor
---

# Passage: Booking and Riding a Friendly Moored Ship

Passage lets the player book a real-time Overworld sea voyage (`travelViewRouteTo` with `voyage: true`) aboard a friendly ship moored in a harbor, never as an instant fast-travel jump.

- **Eligible Moored Hulls (`src/systems/naval/passage.js`, `src/systems/naval/passageBerths.js`):** `createPassageBerths` exports `passageShip`, `passageHint`, `charter`, `charterSailed`, `goneSeed`, `goneSaid`, and `hearGone`. Only a harbor's own ship can be booked (not a liner/packet, prize, or retiring ship). She must be moored (`mooredAt`), friendly (`stanceOf`), belong to `PASSAGE_HULLS` (`[HULL.LargeBoat, HULL.SmallShip, HULL.Carrack]`; rowboats are excluded and the Large Galley never moors in `BERTH_HULLS`), pass `passageCrosses` for the current helm, and be hit by the look ray within `PASSAGE_RAY_M = 8` m.
- **Host Wiring and Charter Isolation (`src/systems/naval/passageHost.js`, `src/systems/naval/seasWorld.js`, `src/systems/naval/comeSailAway.js`, `src/systems/naval/fleetHost.js`, `src/systems/naval/boatCabinOwnership.js`, `src/systems/naval/sailingCabin.js`):** Built in `src/systems/naval/seasWorld.js`, `createPassageHost` exports `offer`, `book`, `frame`, `end`, `charterBoat`, and `castOff`. While `charterBoat()` exists, `offer` and `book` refuse a second charter with `PASSAGE_TEXT.booking`. A chartered boat carries `charter` (persisted under the Come Sail Away save key `Charter` and reloaded via `charterRecord`), sets `packable = false`, and is excluded from `placed()` in `src/systems/naval/fleetHost.js`, `bankCabinCandidates`, and `hasSailingCabin`.
- **Peer Sync and Outgoing Ram Guard (`src/systems/naval/navalWire.js`, `src/systems/naval/navalHost.js`):** Booking broadcasts the ship seed so peers retire their local copy, tracking the last `NAVAL_WIRE_GONE` (`8`) seeds in `said`. In `src/systems/naval/navalRams.js`, `helm()` returns `null` when `boat.charter` is set so a chartered ship does not initiate outgoing rams.
