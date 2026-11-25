---
slug: seat-cap-d1-bound-in-chunking
title: "Charter Seat D1 Bound IN-List Chunking"
domain: seats
kind: subcard
parent: seat-turning-settle-and-chunking-overview
files:
  - server-account/src/seatInfluence.js
  - server-account/src/seatTurning.js
  - server-account/src/poi.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-11h.md"
related:
  - seat-turning-settle-and-chunking-overview
  - seats-witness-registry-and-influence
invariants:
  - "Any statement whose `IN` list grows with players or guilds goes through `allIn(db, ids, sql, before, after)`."
  - "Each chunk of rows stands alone - never sum across the list inside SQL."
traps:
  - "D1 refuses statements with more than 100 bound parameters; local SQLite allows far more, so tests can mask the limit."
dfu: []
tags:
  - d1
  - bound-parameters
  - seats
---

# Charter Seat D1 Bound IN-List Chunking

Cloudflare D1 enforces a strict limit of 100 bound parameters per SQL statement, whereas local SQLite allows far larger parameter arrays. When the number of pledged guilds crossed 100, unchunked `IN` lists caused weekly Turning settlement to throw on every seat request, answering `server` and leaving every Charter unclaimed. `server-account/src/seatInfluence.js`, `server-account/src/seatTurning.js`, and `server-account/src/poi.js` prevent bound-parameter overflows by routing unbounded identifier lists through `allIn`.

- **Chunking helper (`allIn` and `IN_CHUNK`):** `allIn(db, ids, sql, before, after)` slices the target identifier array into batches of `IN_CHUNK = 90` (leaving room below the 100-parameter D1 ceiling for fixed prefix and suffix parameters in `before` and `after`), executes the query per slice, and concatenates the returned rows in JavaScript.
- **Standings and Turning callers:** In `server-account/src/seatInfluence.js`, `gatherStandings`, `readStandings`, and `renamedSince` query pledged guilds and account histories through `allIn`. In `server-account/src/seatTurning.js`, `namesOf`, `guildmastersOf`, and `settleWeek` batch guild and player lookups the same way. Because each batch executes as an independent `SELECT`, callers must aggregate or sum totals in memory rather than relying on a single SQL `GROUP BY` or `SUM` across the full identifier list.
