---
slug: seats-fortifications-and-seasons
title: "Seat Fortifications, Seasons, and the Season 0 Wipe"
domain: multiplayer
kind: subcard
parent: seats-arc-overview
files:
  - src/net/fortLaw.js
  - server-account/src/seatForts.js
  - src/ui/seatWorks.js
  - server-account/src/seatTurning.js
  - server-account/migrations/0061_seat_forts.sql
  - src/net/tideLaw.js
  - src/ui/hallOfRecords.js
  - server-account/src/halls.js
  - server-account/src/seatRibbons.js
routes:
  - /v1/seats/forts
  - /v1/seats/fort/fund
  - /v1/seats/records
  - /v1/guilds/heraldry
tables:
  - town_seat_forts
  - town_seat_fort_held
  - town_seat_fortifier
  - town_seat_stockpile
  - town_seat_camps
  - town_seat_history
  - town_seat_titles
  - town_seat_ribbons
replacesBible:
  - "11-Multiplayer/Seats-Arc.md"
related:
  - seats-arc-overview
  - seats-siege-referee-and-battlefield
  - market-vendors-and-professions
invariants:
  - "Fortification works belong to the seat itself rather than the holding guild, advancing across tiers in `FORT_TIER_DAYS` (`2`, `4`, and `7` days) when funded with materials from `FORT_WORKS`."
  - "Both a siege capture and the end of a Season reduce each work by one tier (`MAX(0, tier - 1)`), except when `server-account/src/seatForts.js` passes the wall-preservation flag so walls retain their tier."
  - "Standard Seasons span `SEASON_WEEKS` (`8` weeks), whereas Season 0 runs for `SEASON_ZERO_WEEKS` (`4` weeks) and clears all `SEASON_ZERO_WIPED` tables at completion while preserving `SEASON_ZERO_KEPT` moderator strike rows."
  - "A palace Charter Room holds up to `SEAT_HALL_DECOR_CAP` (`100`) placed decor items."
  - "A Season ribbon (`town_seat_ribbons`) goes only to a character who was a guild member at the last Turning of that Season, and it uses the current guild colors."
traps:
  - "Marks balances, the Stores, and profession progression tracks survive the Season 0 wipe and must never be added to `SEASON_ZERO_WIPED`."
  - "Gatehouse and battering-ram parameters live in both `src/net/fortLaw.js` (`GATEHOUSE`, `RAM`) and `src/net/siegeRef.js` (`SIEGE_GATEHOUSE`, `SIEGE_RAM`); edits must update both modules together."
dfu: []
tags:
  - seats
  - fortifications
  - seasons
  - chronicle
---

# Seat Fortifications, Seasons, and the Season 0 Wipe

Persistent seat works, seasonal rollovers, and the Hall of Records chronicle span `src/net/fortLaw.js`, `server-account/src/seatForts.js` (`0061_seat_forts.sql`), `server-account/src/seatTurning.js`, and `src/ui/hallOfRecords.js`.

- **Seat works and stockpiles:** Fortifications belong to the seat rather than the ruling guild. Players inspect works via `/v1/seats/forts` (`src/ui/seatWorks.js`, described by `FORT_EFFECT_WORDS`) and contribute materials from `FORT_WORKS` through `POST /v1/seats/fort/fund` into `town_seat_forts`, `town_seat_fort_held`, `town_seat_fortifier`, `town_seat_stockpile`, and `town_seat_camps` (with the apothecary work gated by `APOTHECARY_OPEN`). Funded tiers complete across `FORT_TIER_DAYS` (`2`, `4`, and `7` days). When a seat falls or a Season closes, `server-account/src/seatForts.js` drops each work by one tier (`MAX(0, tier - 1)`), optionally exempting walls via the query flag.
- **Charter Rooms and heraldry:** Holding a seat opens its palace Charter Room (`server-account/src/halls.js`), which supports up to `SEAT_HALL_DECOR_CAP` (`100`) decor items and displays guild heraldry configured through `/v1/guilds/heraldry`.
- **Seasons, Season 0 wipe, and chronicle:** `seasonOf`, `seatSeasonName`, and `chronicleWhen` (`src/net/townSeatLaw.js`, paired with `src/net/tideLaw.js`) divide the calendar into `SEASON_WEEKS` (`8`-week) Seasons after the `SEASON_ZERO_WEEKS` (`4`-week) Season 0 launch window. Ending Season 0 purges `SEASON_ZERO_WIPED` tables while preserving `SEASON_ZERO_KEPT` strike entries in `town_seat_history`, along with player Marks, the Stores, and professions. `/v1/seats/records` feeds `hallOfRecordsChapters` (`HALL_OF_RECORDS_ROWS = 400`), archiving `town_seat_titles` and `town_seat_ribbons`.
