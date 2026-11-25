---
slug: scale-clock-budget-and-heartbeat-overview
title: "Service Clock Budget, Indexes, and Client Heartbeat Pacing"
domain: multiplayer
kind: overview
parent: null
files:
  - server-account/src/cron.js
  - server-account/src/heartbeat.js
  - src/net/heartbeat.js
  - tools/loadHarness.mjs
  - tools/mutate.mjs
  - server-account/migrations/0091_scale4.sql
routes:
  - /v1/heartbeat
  - /v1/prof/state
tables:
  - guild_contracts
  - market_bids
  - sessions
replacesBible:
  - "01-Overview/audits/Audit-Scale.md"
related:
  - scale-service-clock-and-indexes
  - scale-client-heartbeat-pacing
  - scale-arc-d1-write-diet-and-cron
  - scale-arc-capacity-plan
invariants:
  - "The audit covers SCALE3 (load harness), SCALE4a, SCALE4b (service clock), and SCALE4c (one heartbeat for the clocks of a tab)."
  - "tools/mutate.mjs runs the unmutated tests before mutants so an unparseable test file cannot report mutants as dead."
traps:
  - "The load harness must not invent polling: /v1/prof/state is read on arrival, UTC day turn, and after refusal, with closed state rechecked every PROF_CLOSED_RECHECK_MS."
dfu: []
tags:
  - audit
  - scale
  - cron
  - heartbeat
  - load-harness
---

# Service Clock Budget, Indexes, and Client Heartbeat Pacing

Scale hardening bounds D1 cron statement budgets, adds targeted SQL indexes, consolidates per-tab client polling into one heartbeat loop, and tightens load harness and mutation runner verification across `server-account/src/cron.js`, `src/net/heartbeat.js`, `tools/loadHarness.mjs`, and `tools/mutate.mjs`.

- **Scale Lanes and Migration (`server-account/src/cron.js`, `server-account/src/heartbeat.js`, `server-account/migrations/0091_scale4.sql`):** The scale work spans `SCALE3` (`tools/loadHarness.mjs`), `SCALE4a`, `SCALE4b` (service clock budget and indexes in `server-account/migrations/0091_scale4.sql`, renumbered after `0090_sd_kills`), and `SCALE4c` (a single `/v1/heartbeat` loop driving the clocks of a tab across `guild_contracts`, `market_bids`, and `sessions`).
- **Load Harness Profession Polling (`tools/loadHarness.mjs`):** The load harness matches live client polling rules without inventing background timers. It reads `/v1/prof/state` on arrival, at the UTC day turn, and after a refusal, while rechecking a closed profession state only once every `PROF_CLOSED_RECHECK_MS` (`300_000` ms in `src/net/profBook.js`).
- **Mutation Runner Baseline Gate (`tools/mutate.mjs`):** Before running any mutant, `tools/mutate.mjs` executes the unmutated test suite first so a syntax error or unparseable test file fails immediately instead of reporting mutants as dead.
