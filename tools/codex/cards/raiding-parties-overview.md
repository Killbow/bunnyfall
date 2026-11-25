---
slug: raiding-parties-overview
title: "Raiding Parties: Town Raids World Event"
domain: world
kind: overview
parent: null
files:
  - src/worldEvents/raidingParties.js
  - src/net/raidLaw.js
  - src/world/raidShared.js
  - src/worldEvents/raidKinds.js
  - server/src/world/raid.js
  - server-account/src/raids.js
routes:
  - "/v1/raid/claim"
  - "/internal/raid/clean"
  - "/internal/raid/day"
tables:
  - raid_cleanses
  - raid_spoils
replacesBible:
  - "03-World/Raiding-Parties.md"
related:
  - raiding-parties-day-roll-and-spawning
  - raiding-parties-relay-ledger-and-receipts
  - raiding-parties-kinds-and-held-towns
  - world-events-and-signed-receipts
  - room-engine-and-hub-sharding
invariants:
  - "Every client and the relay derive the same day's raids from raidDayRandom(day) (mulberry32, RAID_DAY_SALT 5), never Math.random."
  - "Online, the relay ledger alone decides the count and the cleanse; peer words only elect the runner."
  - "A raid's kind is derived from its rolled tuple (raidKindOf), never from a new random draw."
traps:
  - "There is no fixed daily raid count; it is raidsPerDay(regionCount)."
  - "Gated by the mod setting `world-events-raiding-parties` Enabled (raidingPartiesOn)."
dfu: []
tags:
  - world-events
  - raids
  - towns
  - multiplayer
  - renown
---

# Raiding Parties: Town Raids World Event

Raiding Parties ports the Kamer World Events - Raiding Parties 1.1 mod (`src/worldEvents/raidingParties.js`) across five stages: offline port (`RAID1`), peer runner (`RAID2`), relay ledger (`RAID3`), Renown and Aetheric rewards (`RAID4`), and objective kinds (`RAID5`). The feature is gated by the `world-events-raiding-parties` setting (`raidingPartiesOn`) and stores save state under `installRaidingParties`.

- **Schedule and keys (`src/net/raidLaw.js`):** With `RAID_REGION_REAL_HOURS` set to `4` and a two-hour game day at TimeScale `12`, `raidsPerDay(regionCount)` rolls `round(regions / 2)` raids per day using `raidDayRandom(day)` (`mulberry32` with `RAID_DAY_SALT` `5`). Each raid runs for `RAID_DURATION_MINUTES` (`120` game minutes) from a start minute between `0` and `RAID_START_LAST` (`1320`), keyed by `raidKey` (`region:locationIndex:day`) and signed by `raidSig` (`st.tg.ty.px.py`).
- **Map marks and runner (`src/world/raidShared.js`):** Active raids draw a crimson ring with crossed blades on the travel map (`paintRaidMark` in `src/ui/inkMap.js` and `src/ui/eventMapMarks.js`). Online peer words elect a single runner to spawn raiders and defenders while the cell ledger (`server/src/world/raid.js`) tracks kills and mints `w1` cleanse receipts for `POST /v1/raid/claim` (`server-account/src/raids.js`).
- **Subcards:** `raiding-parties-day-roll-and-spawning` covers the deterministic roll, spawns, and faction reputation; `raiding-parties-relay-ledger-and-receipts` covers election, cell ledgers, and D1 claims; `raiding-parties-kinds-and-held-towns` covers `raidKindOf` objectives (`src/worldEvents/raidKinds.js`), held bonuses, and Aetheric spoils.
