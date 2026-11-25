---
slug: shipyards-crew-hall-recruits-and-online-signing
title: "Crew Hall Daily Recruits and Online Crew Signing"
domain: naval
kind: subcard
parent: shipyards-crew-halls-and-lighthouses-overview
files:
  - src/systems/naval/crewHall.js
  - src/systems/naval/crewLife.js
  - src/systems/naval/crewSignBook.js
  - src/systems/naval/shipyardHost.js
  - src/systems/naval/navalHost.js
  - src/net/crewSignLaw.js
  - src/net/accountClient.js
  - server-account/src/crewSigns.js
  - server-account/src/routes/seatsRoutes.js
  - server-account/migrations/0180_crew_signed.sql
routes:
  - /v1/crew/hall
  - /v1/crew/sign
  - /v1/crew/release
tables:
  - crew_signed
replacesBible:
  - "03-World/Shipyards.md"
related:
  - shipyards-crew-halls-and-lighthouses-overview
  - crew-veterancy-posts-and-headcount-exchange
  - naval-living-crew-companions-and-repairs
  - holdings-fleet-ledger-titles-and-refits
invariants:
  - "recruitsOf draws RECRUITS_A_DAY (6) recruits from mulberry32(hash32(mapId, day, CREW_HALL_SALT)); ids are `town:day:slot`, identical on every client."
  - "Grades (RECRUIT_GRADES): Green 180, Able 260, Seasoned 420, Veteran 700 base fee; lift 0/2/4/6."
  - "RECRUIT_TRADES premiums: First Mate 1.6 (least Seasoned), Bosun 1.3 (least Able), Gunner 1.2, Carpenter 1.2, Bard 1.1, Lookout/Cook/Deckhand 1."
  - "recruitFee = max(HAND_PRICE, round(fee * premium / 10) * 10); hireCharge = max(fee, raise * REPAIR_PRICE.crew)."
  - "enlistPlan returns `full` when named hands reach playerCrewCount, and the recruit then signs on in a hand's place (swapHand) with no refund."
  - "releasePlan refuses when crew <= CREW_PER_HAND: the last man is never paid off."
  - "Online: crew_signed PRIMARY KEY (town, day, slot); the first `<account>:<character>` to sign holds the slot for that day; release deletes the row."
  - "crewSign inserts via INSERT OR IGNORE ... SELECT ... WHERE the account's count for that day < CREW_SIGN_DAY_MAX (24); errors crew-bad 400, crew-day 400, crew-taken 409, crew-many 429."
traps:
  - "Bard has draw weight 0: a recruit is a Bard only when its class is MOBILE.Bard."
  - "CREW_SIGN_SLOTS (6) in src/net/crewSignLaw.js must stay equal to RECRUITS_A_DAY; the migration CHECKs slot < 6."
  - "Sign days must fall within CREW_SIGN_DAY_SPAN (1) of the shared clock day (crewDayOk); rows are swept CREW_SIGN_KEEP_DAYS (3) days after their day."
  - "A service without /v1/crew/* answers not-found and the client falls back to offline hiring."
dfu: []
tags:
  - crew-hall
  - recruits
  - account-service
  - d1
---

# Crew Hall Daily Recruits and Online Crew Signing

Crew halls generate deterministic daily sailor rosters and synchronize online slot claims through D1 (`src/systems/naval/crewHall.js`, `src/systems/naval/crewSignBook.js`, and `server-account/src/crewSigns.js`).

- **Daily roster, grades, and fees:** `recruitsOf` draws `RECRUITS_A_DAY` (`6`) recruits from `mulberry32(hash32(mapId, day, CREW_HALL_SALT))` with `town:day:slot` IDs. `RECRUIT_GRADES` sets base fees and morale `lift` (`Green: 180/0`, `Able: 260/2`, `Seasoned: 420/4`, `Veteran: 700/6`, capped at `MORALE_MAX` in `shipCrew.js`). `RECRUIT_TRADES` (`src/systems/naval/crewLife.js`) multiplies fees by `1.6` (`First Mate`, least `Seasoned`), `1.3` (`Bosun`, least `Able`), `1.2` (`Gunner`, `Carpenter`), `1.1` (`Bard`, weight `0`, only when class is `MOBILE.Bard`), and `1` (`Lookout`, `Cook`, `Deckhand`). `recruitFee` is `max(HAND_PRICE, round(fee * premium / 10) * 10)` and `hireCharge` is `max(fee, raise * REPAIR_PRICE.crew)`. At `playerCrewCount`, `enlistPlan` returns `full` and `swapHand` (`src/systems/naval/shipyardHost.js`, `src/systems/naval/navalHost.js`) replaces a hand without refund. `releasePlan` refuses when `crew <= CREW_PER_HAND` and refunds the morale lift on payoff.
- **Online D1 signing:** `/v1/crew/hall`, `/v1/crew/sign`, and `/v1/crew/release` (`server-account/src/routes/seatsRoutes.js`, `src/net/accountClient.js`) use table `crew_signed` (`server-account/migrations/0180_crew_signed.sql`, `PRIMARY KEY (town, day, slot)` with `slot < 6` matching `CREW_SIGN_SLOTS` in `src/net/crewSignLaw.js`). `crewSign` inserts when the daily account count is under `CREW_SIGN_DAY_MAX` (`24`), returning `crew-bad` (`400`), `crew-day` (`400`), `crew-taken` (`409`), or `crew-many` (`429`). Days must pass `crewDayOk` (`CREW_SIGN_DAY_SPAN = 1`), rows sweep after `CREW_SIGN_KEEP_DAYS` (`3`), and `not-found` falls back to offline hiring.
