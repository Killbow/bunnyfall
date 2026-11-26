---
slug: scale-arc-d1-write-diet-and-cron
title: "D1 Write Diet: Session Touch, Cron Sweeps, Kept Boards, Lean Witness"
domain: account
kind: subcard
parent: scale-arc-capacity-plan
files:
  - server-account/src/accounts.js
  - server-account/src/cron.js
  - server-account/src/townSeats.js
  - server-account/src/seatTurning.js
  - server-account/src/decor.js
  - server-account/src/keptBoard.js
  - server-account/src/leanWitness.js
  - server-account/src/weekKept.js
  - server-account/src/door.js
  - server-account/src/progress.js
  - server-account/src/honours.js
routes:
  - /v1/seats/list
  - /v1/homes/town
  - /v1/market/vendors
  - /v1/chapters/list
tables:
  - sessions
  - players
  - seat_facts_kept
  - home_yards
  - home_yards_ver
  - market_vendor_ver
  - arena_board_ver
  - world_witness
  - witness_confirmed
  - town_seat_weeks
  - npc_chapter_weeks
  - writs
replacesBible:
  - "11-Multiplayer/Scale-Arc.md"
related:
  - scale-arc-d1-replicas-and-shedding
  - economy-ledger-and-item-judge
  - market-vendors-and-professions
invariants:
  - "`resolveSession` updates `last_seen` on `sessions` and `players` at most once per `SESSION_TOUCH_S` (`3600` s) and never fails the caller on a touch error."
  - "Multi-key SQL lookups bind JSON arrays through `IN (SELECT value FROM json_each(?))` to stay below D1's 100-parameter ceiling."
  - "Each cron firing stops at `FIRING_STATEMENTS_MAX` (`600`), well below D1's 1,000-statement batch limit."
  - "Serialized boards larger than `KEPT_BOARD_MAX_BYTES` (`1500000`) bypass table caching to stay under D1's 2 MB row limit."
traps:
  - "`statement.first()` omits D1 result metadata; use `statement.all()` whenever row write counts or changes metadata are needed."
  - "Tables backed by version triggers forbid `REPLACE` because SQLite `REPLACE` skips `DELETE` triggers; lean witness queries require explicit `INDEXED BY` clauses once `ANALYZE` statistics exist."
  - "`strikeWitness` deletes unconfirmed late rows first, clears confirmation flags second, and deletes the remaining rows third to avoid quadratic trigger re-settlement."
  - "After a D1 Time Travel restore, redeploy the account Worker so `weekKept.js` isolate caches drop rewound `town_seat_weeks` and `npc_chapter_weeks` rows."
tags:
  - account
  - d1
  - cron
  - writes
  - caching
---

To keep D1 primary write queues clear at high concurrency, the account Worker throttles session timestamps, folds multi-step reads, precomputes shared boards in cron jobs, and orders trigger-heavy deletions.

## Session Touches, Folded Reads, and Cron Caps

In `server-account/src/accounts.js`, `resolveSession` touches `last_seen` on `sessions` and `players` only when at least `SESSION_TOUCH_S = 3600` seconds have elapsed, swallowing touch errors so authentication never fails on a background timestamp write. Queries across `server-account/src/honours.js` and `writs` pass array filters via `IN (SELECT value FROM json_each(?))` to respect D1's 100-bind limit. On hot mutation paths, `doorReads` (`server-account/src/door.js`) and `BUCKET_STEP_SQL` / `spendProgress` (`server-account/src/progress.js`) fold prerequisite reads into a single SQL statement.

`server-account/src/cron.js` budgets each scheduled run to `FIRING_STATEMENTS_MAX = 600` statements across `MINUTE_JOBS` and `HOUR_JOBS`, preventing D1's 1,000-statement batch error.

## Precomputed Boards, Version Tables, and Lean Witness

Cron jobs in `server-account/src/townSeats.js` and `server-account/src/seatTurning.js` precompute `seat_facts_kept` (`keepSeatFacts`, with `SEAT_FACTS_FRESH_S = 180` and `SEAT_ROWS_KEPT_S = 60`) for `/v1/seats/list`. `server-account/src/keptBoard.js` (`shapeOf`, `KEPT_BOARD_MAX_BYTES = 1500000`) and `server-account/src/decor.js` (`YARD_SNAP_SHAPE`, `YARDS_KEPT_S = 30`) cache `/v1/homes/town` (`home_yards`), `/v1/market/vendors`, and arena boards against version tables (`home_yards_ver`, `market_vendor_ver`, and `arena_board_ver`). `server-account/src/weekKept.js` caches `town_seat_weeks` and `npc_chapter_weeks` (`/v1/chapters/list`) in isolate memory.

In `server-account/src/leanWitness.js`, queries pin `INDEXED BY` on `world_witness` and `witness_confirmed`, while `strikeWitness` deletes late unconfirmed rows, clears confirmation, and then removes the target rows without firing `REPLACE` or quadratic settlement triggers.
