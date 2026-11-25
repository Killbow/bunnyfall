---
slug: bounty-hunt-ledger-marks-and-mastery
title: "Hunt Ledger, Ranks, Weekly Named Marks, Trophies, and Seat Influence"
domain: systems
kind: subcard
parent: bounty-boards-overview
files:
  - src/net/huntLaw.js
  - src/net/huntBook.js
  - server-account/src/hunts.js
  - server-account/src/routes/seatsRoutes.js
  - server-account/src/seatInfluence.js
  - src/net/townSeatLaw.js
  - src/guilds/huntersMark.js
  - src/systems/hunt/namedMark.js
  - src/systems/hunt/trophies.js
  - src/characters/eliteFoes.js
  - src/net/decorLaw.js
  - src/ui/huntRank.js
  - server-account/migrations/0181_hunt_ledger.sql
  - server-account/migrations/0182_hunt_influence.sql
routes:
  - /v1/hunt/state
  - /v1/hunt/clear
tables:
  - hunt_clears
  - town_seat_influence
  - realm_characters
  - serpent_kills
replacesBible:
  - "06-Systems/Bounty-Boards.md"
related:
  - bounty-boards-overview
  - seats-witness-registry-and-influence
  - integrity-progression-seats-and-enemy-forge
invariants:
  - "Each account may record at most HUNT_CLEARS_DAY_MAX (750) clears per UTC day across all its characters. The limit is enforced inside the `hunt_clears` INSERT in server-account/src/hunts.js."
  - "The `hunt_clears` primary key is (player, char_id, kind, key), so a character clears a notice slot or a mark week (`m.<week>`) once."
  - "Marks open at HUNT_MARK_RUNG 3 (stalker, 40 board clears) and are recorded only if the board clears happened before the clear."
traps:
  - "A clear is the client's word, bounded rather than closed. A modified client can still report up to the day's ceiling."
  - "`hunt-need-account` closes the book (guest account). Errors listed in HUNT_KEEP keep the report queued for retry (HUNT_PUMP_MS 20 s); a closed book waits HUNT_CLOSED_MS (300 s)."
dfu: []
tags:
  - hunt
  - ledger
  - named-mark
  - trophy
  - seat-influence
  - titles
---

# Hunt Ledger, Ranks, Weekly Named Marks, Trophies, and Seat Influence

`src/net/huntLaw.js`, `src/net/huntBook.js`, and `server-account/src/hunts.js` record bounty and weekly mark clears in D1 (`0181_hunt_ledger.sql` and `0182_hunt_influence.sql`) to drive hunter ranks, named marks, trophies, and town seat influence.

## Ledger Storage, Queueing, and Hunter Ranks

- `/v1/hunt/clear` inserts into `hunt_clears` with primary key `(player, char_id, kind, key)`, ensuring each character clears a daily notice slot or weekly mark (`m.<week>`) at most once and capping each account at `HUNT_CLEARS_DAY_MAX` (`750`) clears per UTC day.
- `src/net/huntBook.js` pumps queued reports every `HUNT_PUMP_MS` (`20` s), retaining transient errors in `HUNT_KEEP`. A `hunt-need-account` response closes the book for `HUNT_CLOSED_MS` (`300` s).
- `HUNT_RUNGS` (`src/net/huntLaw.js`, displayed via `src/ui/huntRank.js` and `src/guilds/huntersMark.js`) maps board clears to six ranks: `unblooded` (`0`), `tracker` (`5`), `hunter` (`15`), `stalker` (`40`), `slayer` (`100`), and `huntmaster` (`250`).

## Weekly Named Marks, Trophies, Mastery, and Seat Influence

- Reaching `HUNT_MARK_RUNG` (`3`, `stalker` at `40` prior board clears) unlocks the weekly named mark (`src/systems/hunt/namedMark.js`). `huntMarkOf(week, level)` selects the boss, `huntMarkGold` sets its purse, `huntMarkSeen` reveals it to nearby players, and `withdrawEliteLoot` (`src/characters/eliteFoes.js`) strips elite drops so marks never farm equipment.
- Mark kills award wall trophies (`src/systems/hunt/trophies.js`) recognized as home decor by `decorIsTrophy` (`src/net/decorLaw.js`).
- Each clear grants `HUNT_INFLUENCE` (`25`) town seat influence up to `HUNT_WEEK_CAP` (`250`) per account per week, stored under source `hunt` in `town_seat_influence` (`server-account/src/seatInfluence.js` and `src/net/townSeatLaw.js`). Mastery queries in `server-account/src/routes/seatsRoutes.js` join board clears up to `CLEARS_READ` with `serpent_kills` and living Masters in `realm_characters`.
