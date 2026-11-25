---
slug: arena-ladder-tickets-and-judges
title: "Arena Ladder Tickets, Floor of the Judges, and Laurel"
domain: multiplayer
kind: subcard
parent: arena-ladder-telegraphs-and-trust-overview
files:
  - server-account/src/arena.js
  - server-account/src/routes/playRoutes.js
  - server-account/migrations/0082_arena_attempts.sql
  - server-account/migrations/0074_arena.sql
  - src/arena/arenaOnline.js
  - src/arena/arenaBout.js
  - src/net/arenaLaw.js
routes:
  - /v1/arena/attempt
tables:
  - arena_attempts
  - arena_pve
replacesBible:
  - "01-Overview/audits/Audit-Arena-Ladder.md"
related:
  - arena-ladder-telegraphs-and-trust-overview
  - arena-enemy-telegraph-blows
  - arena-bout-law-crowd-and-kit
invariants:
  - "A ticket is good for one bout in one room within `ARENA_ATTEMPT_LIFE_S`."
  - "Asking a new ticket forfeits any open attempt (loss row, `breakRun`)."
  - "`claimLadder` keys `arena_pve` rows by ticket; reuse is rejected."
traps:
  - "Guests get `ladder-needs-account` (`accountRefusalText`); the client flushes pending receipts before `askTicket`."
dfu: []
tags:
  - ladder
  - ticket
  - judges
  - laurel
  - account
---

# Arena Ladder Tickets, Floor of the Judges, and Laurel

`server-account/src/arena.js`, `server-account/src/routes/playRoutes.js`, and `src/arena/arenaOnline.js` bind each online ladder bout to a single-use server ticket stored in `arena_attempts` (`server-account/migrations/0082_arena_attempts.sql`) and settled in `arena_pve` (`server-account/migrations/0074_arena.sql`).

## Ticket Lifecycle, Timeout Verdicts, and Laurel Thresholds

- **Single-use attempt tickets (`/v1/arena/attempt`, `src/arena/arenaOnline.js`):** Guest players cannot enter the online ladder and receive `ladder-needs-account` (`accountRefusalText`). For signed-in accounts, the client flushes all pending receipts before calling `askTicket`. Each ticket minted at `/v1/arena/attempt` authorizes one bout in one relay room within `ARENA_ATTEMPT_LIFE_S`. Requesting a fresh ticket while a previous attempt remains open immediately forfeits the open attempt by recording a loss row and calling `breakRun`. When the bout finishes, `claimLadder` keys the resulting `arena_pve` entry by ticket and rejects any duplicate submission. Repeat victories on steps already cleared after a broken run pay zero gold purse and zero Renown.
- **Scoring floor and season laurel (`src/arena/arenaBout.js`, `src/net/arenaLaw.js`):** If a PvE ladder bout reaches the time limit, the decision uses `LADDER_JUDGES_SHARE = 0.5` as `judgesFloor` so a fighter cannot win on the scorecard without meeting the half-share threshold. In rated PvP, `ARENA_PAIR_SEASON_MAX = 10` caps rated bouts per pair each season, and `laurelWorthy` requires at least `ARENA_CHAMPION_MIN_BOUTS = 10` completed bouts against `ARENA_CHAMPION_MIN_FOES = 5` distinct accounts.
