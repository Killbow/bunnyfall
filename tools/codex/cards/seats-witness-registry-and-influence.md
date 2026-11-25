---
slug: seats-witness-registry-and-influence
title: "Seat Witness Registry, Pledges, and Influence Caps"
domain: multiplayer
kind: subcard
parent: seats-arc-overview
files:
  - src/guilds/townSeats.js
  - src/net/townSeatLaw.js
  - server-account/src/townSeats.js
  - server-account/src/seatInfluence.js
  - server-account/migrations/0048_town_seats.sql
  - src/scenes/world.js
routes:
  - /v1/seats/witness
  - /v1/seats/strike
  - /v1/seats/pledge
  - /v1/seats/tribute
  - /v1/seats/watch
  - /v1/seats/orc-camp
  - /v1/seats/standings
tables:
  - world_witness
  - town_seat_pledges
  - town_seat_influence
  - town_seat_legacy
  - town_seat_binds
  - town_seat_renown
  - town_seat_history
replacesBible:
  - "11-Multiplayer/Seats-Arc.md"
related:
  - seats-arc-overview
  - seats-weekly-turning-and-holding
  - integrity-progression-seats-and-enemy-forge
invariants:
  - "Clients derive candidate seats from game data via `deriveTownSeats` and submit deterministic `seatReportText` payloads (`key`, `name`, `region`, `tier`, and `pixel`)."
  - "Three byte-identical reports from accounts registered for at least one week confirm a seat, while two matching reports with a different payload mark it disputed."
  - "Accounts reaching `SEAT_WITNESS_UNMATCHED_MAX` (`3`) unmatched disagreements are ignored for `SEAT_WITNESS_IGNORED_S` (`7` days), and reports cap at `SEAT_WITNESS_REPORTS_HOUR` (`24`) per account per hour."
  - "An account can contribute at most `ACCOUNT_SEAT_WEEK_CAP` (`2000`) influence per seat per week after satisfying `SEAT_MEMBER_WAIT_S` (`7` days) in the guild, and binds to one guild per week in `town_seat_binds`."
  - "A guild pledges at most one seat per region across at most `SEAT_PLEDGE_REGIONS_MAX` (`5`) regions, and `SEAT_LEGACY_SHARE` (`0.1`) of weekly influence carries forward in `town_seat_legacy`."
traps:
  - "A seat removed via `/v1/seats/strike` writes a permanent strike row in `town_seat_history` that survives the Season 0 wipe and prevents re-witnessing that key."
  - "`withReach` applies `seatReach` (`KINGDOM_REACH = 0.25`, `MARCH_REACH = 0.125`) only to activity influence, never to Marks tribute."
dfu: []
tags:
  - seats
  - witness
  - influence
  - pledge
---

# Seat Witness Registry, Pledges, and Influence Caps

Seat discovery and weekly influence aggregation combine quorum witnessing in `server-account/src/townSeats.js` (`0048_town_seats.sql`) with guild pledge and cap enforcement in `server-account/src/seatInfluence.js` and `src/net/townSeatLaw.js`.

- **Quorum witnessing:** As players explore in `src/scenes/world.js`, `deriveTownSeats` (`src/guilds/townSeats.js`) formats palace locations into `seatReportText` (`key`, `name`, `region`, `tier`, and `pixel`) for `POST /v1/seats/witness`. Three identical reports from week-old accounts confirm the `world_witness` row; two conflicting matches flag a dispute. Submissions cap at `SEAT_WITNESS_REPORTS_HOUR` (`24`), and `SEAT_WITNESS_UNMATCHED_MAX` (`3`) bad reports mute the sender for `SEAT_WITNESS_IGNORED_S` (`7` days). Moderator strikes (`POST /v1/seats/strike`) record a permanent block in `town_seat_history`.
- **Guild pledges and weekly bindings:** Guilds file pledges via `POST /v1/seats/pledge` (`town_seat_pledges`), limited to one seat per region and `SEAT_PLEDGE_REGIONS_MAX` (`5`) regions total. Members must satisfy `SEAT_MEMBER_WAIT_S` (`7` days), lock to one guild for the week in `town_seat_binds`, and obey `ACCOUNT_SEAT_WEEK_CAP` (`2000`) in `town_seat_influence`.
- **Influence streams, reach, and standings:** Activity routes (`/v1/seats/watch`, `/v1/seats/orc-camp`, `/v1/seats/tribute`, and `town_seat_renown`) enforce `WATCH_DAY_CAP` (`60`), `GATE_WEEK_CAP` (`900`), `HUNT_WEEK_CAP` (`250`), and `HOME_INFLUENCE_DAY` (`25`), while tribute converts at `TRIBUTE_MARKS_PER_INFLUENCE` (`10` Marks) up to `TRIBUTE_SHARE_MAX` (`0.2`). `withReach` scales non-tribute influence by `KINGDOM_REACH` (`0.25`) and `MARCH_REACH` (`0.125`). `gatherStandings` (`/v1/seats/standings`) folds in `SEAT_LEGACY_SHARE` (`0.1` from `town_seat_legacy`), querying guilds in batches of `IN_CHUNK` (`90`).
