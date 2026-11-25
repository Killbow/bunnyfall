---
slug: weir-key-hold-lift-and-ground-gate-overview
title: "Weir Key Hold Lift Migration and Ground Law Overview"
domain: multiplayer
kind: overview
parent: null
files:
  - server-account/migrations/0130_key_lift.sql
  - src/net/wire.js
  - server/src/world/lease.js
  - server-account/src/verdict.js
  - server-account/src/judge.js
  - server-account/src/review.js
  - src/systems/eliteGates/weirKey.js
routes: []
tables:
  - realm_findings
  - realm_characters
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-17f.md"
related:
  - relay-ground-gate-hello-and-refusal
  - integrity-item-law-holds-and-wealth-budget
  - elite-breach-weir-key-and-stakes
  - shared-ground-agreement-overview
invariants:
  - "KEY-LIFT is data-only (migration 0130); ACCOUNT_VERSION unchanged."
  - "GROUND-GATE refuses only ground rooms; hub and social rooms still admit old builds."
  - "Only findings since the last staff clear/rollback count."
  - "Kept strikes = MIN(strikes + 3*law_holds, other findings)."
  - "Writes a staff act finding with by 'key-lift'."
  - "Temporary key_lift and key_lift_other tables are dropped at the end."
traps:
  - "Remote peers stand at the sender's ground height, so terrain divergence between builds makes peers float or sink."
  - "Migration 0125 only lifted characters whose entire history was key findings; older cleared findings blocked it."
  - "Holds from 0120 timed acts or staff holds are untouched."
dfu: []
tags:
  - weir-key
  - law
  - relay
  - terrain
  - migration
  - strikes
---

# Weir Key Hold Lift Migration and Ground Law Overview

Weir Key strike hold remediation and terrain version gating span `server-account/migrations/0130_key_lift.sql`, `src/systems/eliteGates/weirKey.js`, `server-account/src/judge.js`, `server-account/src/verdict.js`, `server-account/src/review.js`, `src/net/wire.js`, and `server/src/world/lease.js`.

## Weir Key Strike Lift (`0130_key_lift.sql`)

- **Key restacking and strike rollup:** When Weir Key pack rows restack via `restackWeirKeys` (`src/systems/eliteGates/weirKey.js`), rolling keys could accumulate strikes through `lawCountOf` toward `STRIKES_FOR_TIMED` (`3` in `server-account/src/judge.js`) and trigger `LAW_HOLD_S` week holds (`server-account/src/verdict.js`). Whereas migration `0125` cleared only characters whose entire history consisted of key findings, `server-account/migrations/0130_key_lift.sql` (`KEY-LIFT`, a data-only migration leaving `ACCOUNT_VERSION` unchanged) evaluates only findings recorded since the most recent staff clear or rollback.
- **Kept strikes and hold clearing:** Using temporary `key_lift` and `key_lift_other` tables (dropped at completion), migration `0130` computes kept strikes as `MIN(strikes + 3*law_holds, other findings)`, lifts holds on `realm_characters` only when the active law signature is empty or key-only (leaving `0120` timed acts and staff holds untouched), and appends a staff act finding with `by: 'key-lift'` to `realm_findings`.

## Ground Room Admission Boundary

Because remote peers stand at the ground height of the sender, `GROUND-GATE` (`src/net/wire.js` and `server/src/world/lease.js`) rejects outdated terrain builds only in ground rooms while continuing to admit them into hub and social rooms.
