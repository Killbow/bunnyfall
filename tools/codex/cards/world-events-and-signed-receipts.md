---
slug: world-events-and-signed-receipts
title: Shared-Clock World Events and Signed Receipts
domain: multiplayer
kind: overview
files:
  - src/worldEvents/eventTimers.js
  - src/net/gateReceipt.js
  - src/net/serpentReceipt.js
  - src/net/sdReceipt.js
  - src/net/raidReceipt.js
  - src/net/eliteGates/egReceipt.js
  - src/net/staffEvent/staffEventReceipt.js
  - src/net/ketch/ketchReceipt.js
  - src/net/starfall/starReceipt.js
  - server/src/index.js
  - server-account/src/index.js
routes:
  - /v1/elite-dungeons
  - /v1/gate/claim
  - /v1/serpent/claim
  - /v1/sd/claim
  - /v1/eg/claim
  - /v1/ketch/claim
  - /v1/star/claim
  - /v1/raid/claim
related:
  - identity-tokens-and-relay-seam
  - room-engine-and-hub-sharding
invariants:
  - All seven world-event receipt types (`r1`, `l1`, `h1`, `e1`, `y1`, `j1`, `w1`) sign their version prefix with `GATE_SIGNING_KEY` and enforce disjoint claim schemas so they never collide with each other, seat/watch receipts (`k1`, `s1`, `t1`), or `v1` tokens.
  - Verified `/v1/*/claim` routes credit account `s` once per event in one D1 batch.
traps:
  - Without `GATE_SIGNING_KEY`, the relay emits unsigned `<ver>.<body>.` receipts so clients roll local seeds while `/v1/*/claim` returns 503 `no-gate-key` and clients retain receipts for retry.
  - "`egReceipt.js` enforces a `640`-character cap (`EG_RECEIPT_MAX`) matching the wire frame limit."
  - "Both `egReceipt.js` (`EG_RECEIPT_V`) and `staffEventReceipt.js` (`STAFF_RECEIPT_V`) share prefix `e1` under `GATE_SIGNING_KEY`, relying on disjoint claim keys (`q`/`b` vs `v`/`r`) to reject cross-replay."
tags:
  - multiplayer
  - world-events
  - receipts
  - ed25519
---

# Shared-Clock World Events and Signed Receipts

Online world time derives from wall time (`ONLINE_EPOCH_MS` at TimeScale `12` in `src/net/wire.js`) plus the relay welcome `now` offset. `eventTimerRows` (`src/worldEvents/eventTimers.js`) schedules Oblivion Gates, Sea Serpents, Abyss Dungeons, Elite Breaches, Sky-Ketch voyages, Starfall, town raids, and seat battles (`contentOn`), while open-world Elite Dungeons use `/v1/elite-dungeons` (`server-account/src/index.js`).

- **Relay encounters (`server/src/index.js`):** `Room` handles live encounters through `gate`, `serpent`, `sd`, `eg`, `kt`, `star`, and `raid` WebSocket frames, minting 7-day Ed25519 receipts under `GATE_SIGNING_KEY` upon completion.
- **Disjoint receipts:** Each world-event receipt signs its version prefix and enforces disjoint claim schemas so `GATE_SIGNING_KEY` never confuses world events, seat/watch receipts (`k1`, `s1`, `t1`), or `v1` tokens: `r1` (`src/net/gateReceipt.js`), `l1` (`src/net/serpentReceipt.js`), `h1` (`src/net/sdReceipt.js`), `e1` (`src/net/eliteGates/egReceipt.js`, `640`-char cap, shared with `src/net/staffEvent/staffEventReceipt.js` via `q`/`b` vs `v`/`r` claim keys), `y1` (`src/net/ketch/ketchReceipt.js`), `j1` (`src/net/starfall/starReceipt.js`), and `w1` (`src/net/raidReceipt.js`).
- **Keyless fallback and claims (`server-account/src/index.js`):** Without `GATE_SIGNING_KEY`, mints emit unsigned `<ver>.<body>.` receipts so clients roll local seeds while `/v1/*/claim` routes (`gate`, `serpent`, `sd`, `eg`, `ketch`, `star`, and `raid`) decline credit (503 `no-gate-key` retains receipts to retry). Verified claims credit session `s` once per event in one D1 batch with Marks strikes and spoils grants.
