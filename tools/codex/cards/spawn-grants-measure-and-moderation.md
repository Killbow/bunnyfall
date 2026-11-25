---
slug: spawn-grants-measure-and-moderation
title: "Grant Measure Feed, Tallies, and Moderator Cases"
domain: multiplayer
kind: subcard
parent: spawn-grants-overview
files:
  - src/net/grantMeasure.js
  - server-account/src/grants.js
  - server-account/src/discord.js
  - server-account/src/review.js
  - server-account/migrations/0131_grant_measure.sql
  - server/src/index.js
routes:
  - /v1/mod/grant-feed
  - /v1/mod/realm-grants
tables:
  - grant_batches
  - grant_rows
  - grant_tallies
replacesBible:
  - "11-Multiplayer/Spawn-Grants.md"
related:
  - spawn-grants-overview
  - spawn-grants-reader-verdicts-and-enemy-bounds
invariants:
  - "Cells flush `grant-measure1` windows signed with the relay key (`x-relay-grant-sig`) to `GRANT_FEED_URL` (`POST /v1/mod/grant-feed`) every `GRANT_MEASURE_MS` (`10` minutes) or when buffered rows and tallies reach `GRANT_MEASURE_ROWS` (`128`)."
  - "`POST /v1/mod/grant-feed` (`takeGrantMeasure` in `server-account/src/grants.js`) authenticates the batch via the relay's Ed25519 signature (`x-relay-grant-sig` verified against `gatePublicKey`), never via a player session."
  - "Peer readers submit `tally` frames every `GRANT_TALLY_MS` (`10` minutes), while relay-side strip counts record under reader `GRANT_RELAY_READER` (`~relay`)."
  - "A peer-reported moderation case opens only when `GRANT_CASE_READERS` (`3`) distinct credible accounts report `GRANT_CASE_REASONS` against the same sender within `GRANT_CASE_WINDOW_S` (`600` seconds); a single reader never opens a case."
  - "Own-request flooding opens a case at `GRANT_ASK_CASE_TIMES` (`4`) times the kind budget and at least `GRANT_ASK_CASE_OVER_MIN` (`16`) over budget, capped at `GRANT_OWN_CASES_HOUR` (`30`) relay-opened cases per hour."
traps:
  - "Grant cases route to human moderators (`caseCard` under the `grant` tab) and never trigger automatic bans."
  - "`GET /v1/mod/realm-grants` is a moderator and developer read route returning `grantRateSuggested` and `grantCeilingSuggested` telemetry, unlike the relay-signed ingest route `POST /v1/mod/grant-feed`."
dfu: []
tags:
  - spawn-grants
  - measure
  - moderation
  - d1
---

Relay cells and peer readers feed grant telemetry into the account server (`src/net/grantMeasure.js` and `server-account/src/grants.js`) for rate calibration and moderator review.

## Relay Measure Windows and D1 Tables

Each cell accumulates per-account grant rows and reader refusal tallies (`src/net/grantMeasure.js`), flushing a batch every `GRANT_MEASURE_MS` (`10` minutes) or once combined rows and tallies reach `GRANT_MEASURE_ROWS` (`128`). Clients send `tally` frames every `GRANT_TALLY_MS` (`10` minutes), and the relay logs its own stripped records under `GRANT_RELAY_READER` (`~relay`).

The cell signs the `grant-measure1` payload with its Ed25519 key in header `x-relay-grant-sig` and posts to `GRANT_FEED_URL` (`POST /v1/mod/grant-feed`). In `server-account/src/grants.js`, `takeGrantMeasure` verifies `x-relay-grant-sig` against `gatePublicKey` (requiring no player session) and inserts into `grant_batches`, `grant_rows`, and `grant_tallies` (`server-account/migrations/0131_grant_measure.sql`).

## Moderator Cases and Realm Telemetry

`takeGrantMeasure` opens a review case (`caseCard` on the `grant` tab in `server-account/src/review.js` and `server-account/src/discord.js`, without automated bans) under two conditions:
- At least `GRANT_CASE_READERS` (`3`) credible accounts report `GRANT_CASE_REASONS` against one sender within `GRANT_CASE_WINDOW_S` (`600` seconds).
- An owner's requests reach `GRANT_ASK_CASE_TIMES` (`4`) times budget and at least `GRANT_ASK_CASE_OVER_MIN` (`16`) over budget, bounded by `GRANT_OWN_CASES_HOUR` (`30`).

Moderators and developers query `GET /v1/mod/realm-grants` for per-kind request quantiles, would-be refusals, peak cell hostile members, `grantRateSuggested`, and `grantCeilingSuggested`.
