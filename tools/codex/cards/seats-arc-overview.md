---
slug: seats-arc-overview
title: "Seats Arc: Guild Charters over Palace and Crown Seats"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/townSeatLaw.js
  - src/guilds/townSeats.js
  - server-account/src/townSeats.js
  - server-account/src/seatInfluence.js
  - server-account/src/seatTurning.js
  - server-account/src/seatHolding.js
  - server-account/src/seatPolitics.js
  - server-account/src/seatBattles.js
  - server-account/src/seatSiege.js
  - server-account/src/seatForts.js
  - server-account/src/cron.js
  - server-account/src/index.js
  - src/net/siegeRef.js
  - src/net/fortLaw.js
  - selfhost/accounts.toml
routes:
  - /v1/seats/list
  - /v1/seats/standings
  - /v1/seats/records
  - /v1/seats/forts
tables:
  - world_witness
  - town_seat_holds
  - town_seat_history
  - town_seat_weeks
replacesBible:
  - "11-Multiplayer/Seats-Arc.md"
related:
  - seats-witness-registry-and-influence
  - seats-weekly-turning-and-holding
  - seats-siege-referee-and-battlefield
  - seats-fortifications-and-seasons
  - homes-camps-guilds-and-territories
  - economy-ledger-and-item-judge
  - room-engine-and-hub-sharding
invariants:
  - "Seats are online only: the `SEATS_OPEN` environment switch accepts `'off'`, `'dev'`, or `'on'` (`SEATS_SWITCH` in `src/net/townSeatLaw.js`), leaving offline Daggerfall play untouched."
  - "Every location with a palace is a seat, and `CROWN_SEAT_REGIONS` designates the crown seats (`17` Daggerfall, `23` Wayrest, and `20` Sentinel) across `SEAT_TIERS` (`['palace', 'crown']`)."
  - "All seat fees, tributes, bounties, and payouts use Marks rather than character purse gold."
  - "Guild charters layer over classic NPC palace courts, which remain intact for standard quests and faction interactions."
  - "Whenever a weekly Turning is pending, every `/v1/seats/` endpoint outside `SEAT_READS` returns HTTP `503` (`seats-settling`)."
traps:
  - "No `town_seats` table exists in D1; discovered seats live as `world_witness` rows with `kind = 'seat'`."
  - "Always read `CLAIM_THRESHOLD` from `src/net/townSeatLaw.js` (`1200` palace, `5000` crown), never from legacy documentation."
dfu: []
tags:
  - seats
  - guilds
  - territory
  - pvp
  - marks
---

# Seats Arc: Guild Charters over Palace and Crown Seats

The Seats system lets online guilds compete for weekly charters over palace towns and the three Iliac Bay kingdoms without altering offline play or NPC palace courts. Shared rules live in `src/net/townSeatLaw.js`, `src/net/siegeRef.js`, and `src/net/fortLaw.js`, while `server-account/src/index.js` dispatches `/v1/seats/*` routes across `server-account/src/townSeats.js` and the `server-account/src/seat*.js` modules.

- **Switch, tiers, and witness storage:** `SEATS_OPEN` (`selfhost/accounts.toml`, validated against `SEATS_SWITCH` as `'off'`, `'dev'`, or `'on'`) gates all seat routes and the `'seats'` (`settleDueOnce`) and `'seat-facts'` (`keepSeatFacts`) jobs in `server-account/src/cron.js`. Client discovery (`src/guilds/townSeats.js`) populates `world_witness` (`kind = 'seat'`) across `SEAT_TIERS` (`'palace'` and `'crown'`, where `CROWN_SEAT_REGIONS` maps `17` Daggerfall, `23` Wayrest, and `20` Sentinel).
- **Marks economy and weekly cycle:** Guilds pledge and accumulate influence (`server-account/src/seatInfluence.js`) toward `CLAIM_THRESHOLD` (`1200` palace, `5000` crown), paying `CLAIM_FEE` (`8000` palace, `80000` crown Marks) and weekly `SEAT_UPKEEP` (`2500` palace, `15000` crown Marks). `server-account/src/seatTurning.js` settles `town_seat_weeks`, `town_seat_holds`, and `town_seat_history` while blocking non-`SEAT_READS` writes with `503 seats-settling`.
- **Governance, sieges, and works:** Ruling guilds manage edicts, tithes, fealty, and pacts (`server-account/src/seatHolding.js`, `server-account/src/seatPolitics.js`), defend charters in relay-refereed battles (`server-account/src/seatBattles.js`, `server-account/src/seatSiege.js`), and fund persistent seat works (`server-account/src/seatForts.js`). Read endpoints include `/v1/seats/list`, `/v1/seats/standings`, `/v1/seats/records`, and `/v1/seats/forts`.
