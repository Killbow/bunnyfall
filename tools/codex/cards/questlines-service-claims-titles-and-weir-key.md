---
slug: questlines-service-claims-titles-and-weir-key
title: "Witnessed Questline Claims, Titles, and the Weir Key"
domain: multiplayer
kind: subcard
parent: questlines-arc-overview
files:
  - src/net/questlineClaims.js
  - server-account/src/questlines.js
  - server-account/src/index.js
  - server-account/src/service.js
  - server-account/migrations/0133_questlines.sql
  - src/net/accountClient.js
  - src/systems/questlines/qlLineRunner.js
routes:
  - /v1/ql/claim
tables:
  - ql_steps
  - players
  - gate_kills
  - eg_redoubts
  - sd_kills
  - serpent_kills
  - stars_held
  - ketch_voyages
replacesBible:
  - "06-Systems/Questlines-Arc.md"
related:
  - questlines-arc-overview
  - questlines-offers-couriers-and-line-runner
  - elite-breach-weir-key-and-stakes
  - breach-receipts-spoils-and-embers
  - world-events-and-signed-receipts
  - account-routes-and-gate-wall
invariants:
  - "`claimQl` pays only what the server witnessed: an end step settles only when a receipt row from `QL_WITNESS_SQL` falls inside the line window (after step 1 `opened_at`, after the prior step's `seen_at`, and in step order)."
  - "One `ql_steps` row exists per `(account, line, step)` via `INSERT OR IGNORE`; account titles are bitflags in `players.ql_titles`, OR-ed only when unset."
  - "The Weir Key is granted at most once per account (`eg_keys = eg_keys + 1` and `ql_key = 1` guarded by `ql_key = 0`), exclusively on `covensHoard` step `2` with choice `'keep'` after `burningDoors` is fully witnessed."
  - "`QUESTLINES_OPEN` (`off`, `dev`, or `on`) gates `/v1/ql/claim`; when closed it returns `ql-closed` (`403`), and payloads rejected by `qlClaimOf` return `ql-body` (`400`)."
traps:
  - "A guest account (no handle) can record step opens but receives `{ why: 'guest' }` on end claims, and an Elite Breach Rehearsal Redoubt never satisfies a redoubt witness (`NOT_REHEARSAL`)."
  - "The client retries failed claims every `CLAIM_RETRY_MS` (`60` s) up to `CLAIM_TRIES = 5` times before backing off to `CLAIM_SLOW_MS` (`600000` ms); duplicate deliveries resolve cleanly as `titleHeld` or `keyHeld`."
dfu: []
tags:
  - questlines
  - account-service
  - titles
  - weir-key
  - receipts
---

Endgame questline rewards are settled by the account server over `/v1/ql/claim` (`server-account/src/index.js`, `server-account/src/questlines.js`, `server-account/src/service.js`, and `src/net/accountClient.js`), using schema definitions from `server-account/migrations/0133_questlines.sql` and line definitions in `src/net/questlineClaims.js`.

## Witnessed Receipts and Ordering Window

`claimQl` never trusts client completion assertions alone. Opening a step inserts a row in `ql_steps` via `INSERT OR IGNORE`. Finishing a step runs `QL_WITNESS_SQL` across the ten witness kinds (`rite`, `breach`, `redoubt`, `redoubts3`, `valkynaz`, `hour`, `serpent`, `star`, `stars3`, and `ketch`) against `gate_kills`, `eg_redoubts` (excluding rehearsal runs via `NOT_REHEARSAL`), `sd_kills`, `serpent_kills`, `stars_held`, and `ketch_voyages`. The server settles the step only when a matching receipt timestamp falls inside the active line window: after step 1's `opened_at`, after the preceding step's `seen_at`, and in strict step sequence.

## Account Titles, Weir Key, and Retry Cadence

Across the seven service lines in `QL_SERVICE_LINES`, final steps set bitflags in `players.ql_titles` for `doorwarden`, `covenbane`, `weirwalker`, `hourwitness`, `satakalwitness`, `starwarden` (which also grants a Soul Cake purse while the Witches Festival is active), and `skyfarer`. Completing `covensHoard` step `2` with choice `'keep'` after earning the `burningDoors` title awards the account's one-time Weir Key by incrementing `players.eg_keys` and setting `ql_key = 1` under a `ql_key = 0` guard (returning `keyHeld` if already claimed).

`/v1/ql/claim` checks `QUESTLINES_OPEN` (`403` `ql-closed` when disabled) and `qlClaimOf` (`400` `ql-body` on malformed input), while guest accounts receive `{ why: 'guest' }` on final claims. In `src/systems/questlines/qlLineRunner.js`, the client retries pending claims every `CLAIM_RETRY_MS` (`60` s) for `CLAIM_TRIES = 5` attempts before slowing to `CLAIM_SLOW_MS` (`600000` ms).
