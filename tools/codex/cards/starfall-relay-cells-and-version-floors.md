---
slug: starfall-relay-cells-and-version-floors
title: "Starfall Relay Cell Ledgers, Hub Tell, and Version Floors"
domain: multiplayer
kind: subcard
parent: starfall-overview
files:
  - server/src/index.js
  - src/net/wire.js
  - src/net/starfall/starfallLaw.js
  - src/net/grantLaw.js
  - src/net/online.js
routes:
  - /internal/star/held
tables: []
replacesBible:
  - "11-Multiplayer/Starfall.md"
related:
  - starfall-overview
  - starfall-encounter-ledger-and-waves
  - room-engine-and-hub-sharding
  - wire-protocol-and-frame-dispatch
invariants:
  - "The `star` WebSocket frame routes to `_starFrame` and `_starWord` in `server/src/index.js`, storing cell ledgers under `STAR_LEDGER_PREFIX` keyed by `starLedgerId` (`night.star@px,py`)."
  - "A client word affects the ledger only when the speaker's last pose lies within `STAR_REACH_M` (60 m) of `starNativeOf`; words from farther away are ignored for state changes."
  - "`starPlaceFor` caps each cell at `STAR_LEDGERS_MAX` (4) live ledgers and `STAR_LEDGERS_BY_MAX` (2) created by the same account, evicting the longest-unattended ledger (idle beyond `STAR_IDLE_MS` 60 s) when full."
  - "Completed or expired ledgers remain in storage until deadline plus `STAR_KEEP_MS` (10 min) so an encounter cannot restart or mint duplicate receipts."
traps:
  - "Relays older than `STAR_RELAY_MIN` terminate the WebSocket on an unknown `star` frame, so clients must check `relaySupportsStar` before sending."
  - "Clients below the grant version floor clamp `wz` to `STAR_WAVE_SIZE_OLD_MAX` (9) while reading larger wave sizes from `wx`, and the `star` spawn-grant kind requires `STAR_GRANT_RELAY_MIN` (`relaySupportsStarGrant`)."
dfu: []
tags:
  - starfall
  - relay
  - durable-objects
  - websocket
  - rate-limits
---

# Starfall Relay Cell Ledgers, Hub Tell, and Version Floors

In `server/src/index.js`, each cell Durable Object manages active star encounters in memory and persistent storage under `STAR_LEDGER_PREFIX`, indexed by `starLedgerId` (`night.star@px,py`). Incoming `star` WebSocket frames pass through `_starFrame` and `_starWord` at a client cadence of `STAR_WORD_MS` (`2` s, rate-limited by `STAR_HZ_MAX = 2` and `STAR_RELAY_BURST = 4`). The relay validates that the sender's position sits within `STAR_REACH_M` (`60` meters) of `starNativeOf` before applying the word.

## Capacity Eviction, Hub Replay, and Wire Compatibility

- **Cell ledger caps (`src/net/starfall/starfallLaw.js`):** `starPlaceFor` allows at most `STAR_LEDGERS_MAX` (`4`) active ledgers in a cell and `STAR_LEDGERS_BY_MAX` (`2`) opened by a single account. When a fifth star is requested, the cell evicts the live ledger that has had no defender present for at least `STAR_IDLE_MS` (`60` s) and has the oldest `nearAt` timestamp. Finished ledgers stay sealed until deadline plus `STAR_KEEP_MS` (`10` min).
- **Outbound frames and hub persistence (`server/src/index.js`):** Cells broadcast `STAR_OUT_KINDS` frames (`st` state, `hd` held notice, `rc` personal receipt, and `hds` held summary). On hold, the cell posts to the hub over `/internal/star/held` (`STAR_INTERNAL_HELD`, retrying every `STAR_TELL_RETRY_MS`). The hub records held stars under `STAR_HELD_KEY` and caches per-account receipts under `STAR_RC_PREFIX` (`STAR_RC_KEEP = 9` for `24` hours) to replay on reconnect.
- **Version gates (`src/net/wire.js`, `src/net/grantLaw.js`, `src/net/online.js`):** Clients gate `star` frames on `relaySupportsStar` (`STAR_RELAY_MIN`) and request `star` enemy spawn grants only when `relaySupportsStarGrant` (`STAR_GRANT_RELAY_MIN`) holds, falling back to `camp` grants and `STAR_WAVE_SIZE_OLD_MAX` (`9`) on older relays while encoding full wave counts in `wx`.
