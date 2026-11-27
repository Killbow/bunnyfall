---
slug: sky-ketch-voyage-clock-and-boarding
title: "Sky-Ketch Voyage Clock, Rooms, and Boarding"
domain: multiplayer
kind: subcard
parent: sky-ketch-raid-overview
files:
  - src/net/ketch/ketchLaw.js
  - src/net/ketch/ketchBrain.js
  - src/net/ketch/ketchHerald.js
  - src/net/relayCfg.js
  - src/systems/ketch/ketchSky.js
  - src/systems/ketch/ketchClient.js
  - src/world/ketch/ketchModel.js
  - src/systems/ketch/ketchWords.js
  - src/worldEvents/eventTimers.js
  - server/src/index.js
replacesBible:
  - "11-Multiplayer/Sky-Ketch.md#voyage"
  - "11-Multiplayer/Sky-Ketch.md#boarding"
related:
  - sky-ketch-raid-overview
  - world-events-and-signed-receipts
  - room-engine-and-hub-sharding
  - identity-tokens-and-relay-seam
invariants:
  - "Voyage `n` arrives at `KT_EPOCH_MS + n * KT_EVERY_MS` on real UTC time rather than the in-game calendar: `'sighted'` starts `KT_SIGHT_MS` before arrival, `'docked'` lasts `KT_STATION_MS`, `'departing'` runs `KT_LAST_MS`, and `'away'` fills the remainder."
  - "`ketchAdmits` readmits existing crew while `ketchHolds` is true, admits new crew with owner, party, or staff authority only while `'docked'` (`ketchBoards`), and rejects a ninth account with `'full'`; hidden staff spectators do not consume a crew slot."
  - "When a ship is full, `_ktFreePlace` evicts only a non-captain member unseen for `KT_PLACE_KEEP_MS` (`5 min`) who dealt no Warden participation and is no longer in the captain's party."
  - "The client stores its active room and party ID under `KT_SHIP_KEY`, rejoining the same vessel until the player switches parties."
  - "A terminal refusal equal to `KT_TEXT.refuse.crew` clears `KT_SHIP_KEY`, so the next ride up boards the ship of the party leader, or else the ship of the player."
  - "`ketchSkyPose` derives the ship's place, turn, and lift only from the shared clock through `ketchVoyageAt`, so every client shows one ship in one place without exchanging messages."
traps:
  - "At `endAt`, the relay closes active sockets and deletes the room state, but finishes retrying `/internal/ketch/rc` receipt deliveries to the hub first; `_ktTick` reloads the voyage key from storage on alarm wakeups so empty rooms still clean up."
  - "`ketchRefusal` translates `KT_TEXT.refuse` strings (`closed`, `gone`, `crew`, `full`) into `KT_REFUSE_WORDS` by exact English text match, so changing `KT_TEXT.refuse.closed` in `ketchLaw.js` without updating `ketchWords.js` leaks raw relay strings."
tags:
  - multiplayer
  - sky-ketch
  - clock
  - instances
  - boarding
  - herald
---

Sky-Ketch voyages run on a real-time 10-hour UTC cycle (`KT_EVERY_MS = 36000000`) anchored at `KT_EPOCH_MS` (`Date.UTC(2026, 9, 25)`). In `src/net/ketch/ketchLaw.js`, `KT_PHASES` (`['away', 'sighted', 'docked', 'departing']`) divide each cycle into a 1-hour sighting window (`KT_SIGHT_MS`), a 7-hour docked boarding window (`KT_STATION_MS`, where `ketchBoards` is true for `at <= now < departAt`), a 45-minute departure window (`KT_LAST_MS`, where `ketchHolds` remains true until `endAt`), and 1 hour 15 minutes away.

## Boarding and Crew Slots

The ship stations at `KT_STATION` (`{ x: 700, z: -140 }`) with `KT_GROUND.y = -260` below deck (`src/world/ketch/ketchModel.js`). Players board by remaining within `KT_LIFT_NEAR_M` (`14 m`) of the lowered anchor-lift for `KT_BOARD_HOLD_MS` (`2.5 s`) in `src/systems/ketch/ketchSky.js`.

`ketchAdmits` allows returning crew to re-enter until `endAt`, while newcomers with captain, party, or staff access can join only before `departAt` up to `KT_CREW_MAX` (`8`). Hidden staff spectators occupy no slot. If full, `idlePlaces` and `freePlace` (`src/net/ketch/ketchBrain.js`, called by `_ktFreePlace` in `server/src/index.js`) reclaim a slot only from a non-captain absent for `KT_PLACE_KEEP_MS` (`5 min`) who has left the captain's party and has not fought the Warden. Clients cache their boarded ship and party ID in `KT_SHIP_KEY` to return to the same instance across reconnects.

## Herald Notifications

`src/net/ketch/ketchHerald.js` dispatches Discord webhooks across `KT_HERALD_MOMENTS` (`sighted`, `arrived`, and `departing`), pinging `KT_DISCORD_ROLE` (or the gate role fallback) in `KT_DISCORD_THREAD` (`src/net/relayCfg.js`).
