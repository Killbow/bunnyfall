---
slug: wagons-open-wagon-riders-and-seats
title: "Open Wagon Riders: Ride Asks, Seats, Group Travel, and Getting Down"
domain: travel
kind: subcard
parent: wagons-kinds-and-hitching-overview
files:
  - src/travel/wagonSeats.js
  - src/travel/wagon/wagonRiders.js
  - src/travel/horseCartWire.js
  - src/travel/horseCartPool.js
  - src/ui/duelPrompt.js
  - src/party/partyTravel.js
  - src/systems/naval/crewAshore.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Wagons.md"
related:
  - wagons-kinds-and-hitching-overview
  - wagons-bench-team-and-harness
invariants:
  - "The owner's `hv.ps` list (`[[peer, seat], ...]`, at most MAX_SEATS = 4 entries) is the only record of who sits where. A rider is seated only when the owner's word names them."
  - "The rider says `wr: { a: owner }` on its enemies frame while asking, then `wr: { s: [owner, seat] }` once seated."
  - "`hv.pn` lists the peers the owner just turned away, so the rider learns of a refusal at once instead of waiting for the ask to expire."
traps:
  - "DFU billboards have no seated sprites, so riders and companions are drawn standing in the wagon bed."
  - "The parked box collider leaves out bodies that are still inside the footprint (capsuleInBox, bodyCapsules, playerCapsule) until they walk out. Its contact skin is CAPSULE_BOX_SKIN = 0.05."
dfu: []
tags:
  - wagons
  - riders
  - seats
  - multiplayer
  - companions
---

# Open Wagon Riders: Ride Asks, Seats, Group Travel, and Getting Down

Open Wagons carry up to `MAX_SEATS` (`4`) passengers across online peers and offline or party companions, with seat assignments governed exclusively by the wagon owner (`src/travel/wagonSeats.js`, `src/travel/wagon/wagonRiders.js`, `src/travel/horseCartWire.js`).

- **Ride asks, wire sync, and refusals (`src/travel/wagon/wagonRiders.js`, `src/travel/horseCartWire.js`, `src/ui/duelPrompt.js`):** A peer within `RIDE_ASK_REACH` (`6` m) requests a seat by broadcasting `wr: { a: owner }` on its enemies frame (`RIDE_ASK_TTL_MS` `30` s timeout) and prompting the owner. The owner records seated riders in `hv.ps` (`[[peer, seat], ...]`, capped at `MAX_SEATS` `4`), which is the sole source of truth; once named there, the rider sends `wr: { s: [owner, seat] }`. If the owner declines, `hv.pn` lists the refused peer identifiers immediately, and `RIDE_REASK_MS` (`15` s) blocks repeat requests.
- **Group travel, getting down, and colliders (`src/party/partyTravel.js`, `src/systems/naval/crewAshore.js`, `src/travel/wagonSeats.js`, `src/travel/horseCartPool.js`):** Fast travel with riders aboard broadcasts `hv.go` and waits `GO_LEAD_MS` (`1200` ms), coordinating departure and arrival across `GO_HOLD_MS` (`30` s) and `ARRIVE_WAIT_MS` (`15` s). `getDownPoint` steps a dismounting rider `GET_DOWN_STEP` (`1.6` m) off the seat. Companions fill unoccupied seats (`GET_DOWN_REACH` `6` m max reach) and alight at heel on park. Because classic billboards lack seated sprites, passengers render standing in the bed. The parked collider (`CAPSULE_BOX_SKIN` `0.05`) excludes overlapping bodies (`capsuleInBox`, `bodyCapsules`, `playerCapsule`) until they step clear.
