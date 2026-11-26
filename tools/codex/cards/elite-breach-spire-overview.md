---
slug: elite-breach-spire-overview
title: "Elite Breach (the Spire) Overview"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/eliteGates/egLaw.js
  - src/net/eliteGates/egBrain.js
  - src/net/eliteGates/egDurable.js
  - src/net/eliteGates/egReceipt.js
  - src/net/wire.js
  - src/systems/eliteGates/egClient.js
  - server/src/index.js
  - server-account/src/eg.js
  - server-account/src/index.js
routes:
  - /v1/eg/open
  - /v1/eg/admit
  - /v1/eg/claim
  - /v1/eg/live
  - /internal/eg/open
  - /internal/eg/live
  - /internal/eg/herald
tables:
  - eg_stakes
  - eg_runs
  - eg_redoubts
  - players
replacesBible:
  - "11-Multiplayer/Elite-Gates.md"
related:
  - elite-breach-weir-key-and-stakes
  - elite-breach-clock-and-hall-rhythm
  - elite-breach-hall-generator-and-span-solver
  - elite-breach-lords-seam-and-vestiges
  - elite-breach-spire-client-rules-and-telegraphs
  - dagons-breach-world-boss
  - room-engine-and-hub-sharding
  - world-events-and-signed-receipts
invariants:
  - "A company roster freezes at open and caps at `PARTY_MAX` (8 in `src/net/wire.js`) and `EG_PARTY_MAX` (`src/net/eliteGates/egLaw.js`), which are pinned equal."
  - "Relay rooms use `eg:<16hex>` (`EG_ROOM`), and the hub caps concurrent live breaches at `EG_LIVE_MAX` (64 in `src/net/eliteGates/egDurable.js`)."
  - "The relay signs `e1` receipts (`src/net/eliteGates/egReceipt.js`, `EG_RECEIPT_TTL_S` 7 days) that the account service settles via `/v1/eg/claim`."
  - "The client `requestId` (24 lowercase base-36 characters) must match `EG_RQ_RE` in `server-account/src/eg.js`, which refuses any other request id with `rq`."
traps:
  - "Player-facing names (Elite Breach, the Spire, and Weir Key) differ from the internal `eg*` code prefix and `eg:` room prefix."
  - "Compatibility checks gate on `EG_RELAY_MIN`, `EG_BRAIN_V`, and `EG_BRAIN_MIN` in `src/net/wire.js`, never on a hardcoded relay version string."
  - "Elite Breach is distinct from Dagon's Breach (`gate*`), sharing only `bossSeam`, gate telegraph colors, and `gate_kills` as an opening prerequisite."
tags:
  - elite-gates
  - spire
  - multiplayer
  - relay
  - co-op
---

Elite Breach (the Spire) is a co-op dungeon mode (`src/net/eliteGates/egLaw.js`, `src/net/eliteGates/egBrain.js`, and `src/systems/eliteGates/egClient.js`) where a staked company climbs procedural circles under a ticking Count.

## Architecture, Relay Rooms, and Spec Law

Opening a breach (`/v1/eg/open` and `/internal/eg/open` across `server-account/src/eg.js`, `server-account/src/index.js`, and `server/src/index.js`) stakes a Weir Key (`eg_stakes`), freezes the company roster up to `EG_PARTY_MAX` (`8`, pinned equal to `PARTY_MAX` in `src/net/wire.js`), and allocates a Durable Object room keyed `eg:<16hex>` (`EG_ROOM`). The hub caps active breaches at `EG_LIVE_MAX` (`64` in `src/net/eliteGates/egDurable.js`), tracks active runs through `/v1/eg/live`, `/internal/eg/live`, and `/internal/eg/herald`, and admits roster members via `/v1/eg/admit`.

Current procedural generation targets spec law `EG_SPEC` (`10` in `egLaw.js`). Older laws stay registered in `EG_LAWS` (`egDurable.js`) so active 7-day breaches continue building deterministically across updates. Version compatibility gates on `EG_RELAY_MIN`, `EG_BRAIN_V`, and `EG_BRAIN_MIN` symbols rather than literal version strings.

## Settlement, Schema, and Subcards

At run end or Redoubt checkpoints, the relay signs `e1` receipts (`src/net/eliteGates/egReceipt.js`, `EG_RECEIPT_TTL_S` of 7 days) settled by `/v1/eg/claim` into `eg_runs`, `eg_redoubts`, and `players` (`server-account/migrations/0124_elite_breach.sql`). Made-level restrictions use `MADE_LEVEL_RULES` (`kind: 'spire'` in `src/characters/madeLevel.js`).

- `elite-breach-weir-key-and-stakes`: Weir Key drops, pity counters, stakes, and cron expiry.
- `elite-breach-clock-and-hall-rhythm`: Count math, Surplus, Respite, and hall stages.
- `elite-breach-hall-generator-and-span-solver`: deterministic halls, span solver, and fragment budgets.
- `elite-breach-lords-seam-and-vestiges`: `EG_SEAM`, lord TTK scaling, fair trail, and Vestige caps.
- `elite-breach-spire-client-rules-and-telegraphs`: Spire rules, telegraphs, occlusion, camera, and HUD.
