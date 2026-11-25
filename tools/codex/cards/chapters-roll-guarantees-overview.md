---
slug: chapters-roll-guarantees-overview
title: "Chapter Roll Claim Atomicity, Replay, and Adoption"
domain: multiplayer
kind: overview
parent: null
files:
  - server-account/src/npcRoll.js
  - src/net/npcChapterLaw.js
  - src/net/npcRollTracker.js
  - server-account/migrations/0098_npc_roll.sql
  - server-account/src/routeStatus.js
routes:
  - /v1/chapters/roll
  - /v1/chapters/claim
  - /v1/chapters/witness
tables:
  - npc_roll_heads
  - npc_roll
  - npc_rep_events
replacesBible:
  - "01-Overview/audits/Audit-Chapters.md"
related:
  - chapters-roll-reputation-and-customs
  - chapters-arc-overview
  - chapters-roll-claim-atomicity-and-replay
  - chapters-roll-tab-adoption-and-stops
invariants:
  - "The service owns reputation for `ROLL_FACTIONS`; the client adopts server values (`rollAdopt`) and only sends deltas (`rollDeltasOf`) for factions both sides hold (AUDIT CHAP C5)."
  - "Recorded ranks never exceed what the reputation of the Roll allows (`rollRankCapOf`, AUDIT CHAP S5)."
  - "No Roll is seeded before the first save of the character lands: 'no-data' (404, AUDIT CHAP S3)."
traps:
  - "The daily cap of 15 from the audit is superseded: `ROLL_GAIN_DAY_MAX` is `Number.MAX_SAFE_INTEGER` and gains are slowed by `ROLL_GAIN_SLOW` (BUNNY-PACE)."
dfu: []
tags:
  - audit
  - roll
  - reputation
  - chapters
---

# Chapter Roll Claim Atomicity, Replay, and Adoption

The Chapters Roll Audit (`server-account/src/npcRoll.js`, `src/net/npcChapterLaw.js`, and `src/net/npcRollTracker.js`, marked with `AUDIT CHAP` comments) establishes server ownership, atomic claim batching, and local adoption persistence across `/v1/chapters/roll`, `/v1/chapters/claim`, and `/v1/chapters/witness`. Migration `server-account/migrations/0098_npc_roll.sql` defines `npc_roll_heads`, `npc_roll` (including `owed` and `dormant`), and `npc_rep_events` with index `npc_rep_events_rid`.

## Ownership, Rank Caps, and Lifecycle Guards

- **Server authority and delta adoption (`src/net/npcChapterLaw.js`, `src/net/npcRollTracker.js`):** The account service owns reputation for all `ROLL_FACTIONS`. Clients adopt authoritative numbers via `rollAdopt` and compute outbound deltas via `rollDeltasOf` solely for factions held by both client and server (`AUDIT CHAP C5`). Under `rollRankCapOf` (`AUDIT CHAP S5`), recorded guild ranks cannot exceed the ceiling permitted by the reputation on the Roll. Under `BUNNY-PACE`, `ROLL_GAIN_DAY_MAX` is `Number.MAX_SAFE_INTEGER`, replacing the historical daily cap of `15` with continuous `ROLL_GAIN_SLOW` (`1.75`) pacing.
- **First-save gate and customs rollback (`server-account/src/npcRoll.js`, `server-account/src/realm.js`):** The server refuses to seed a Roll before the initial character save lands, returning `'no-data'` (`404` via `server-account/src/routeStatus.js`, `AUDIT CHAP S3`). If a customs import aborts before its first save completes, `undoCustoms` in `server-account/src/realm.js` purges the rows of that character from `npc_roll_heads`, `npc_roll`, and `npc_rep_events`.
