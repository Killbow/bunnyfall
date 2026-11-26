---
slug: chapters-roll-claim-atomicity-and-replay
title: "Chapter Roll Claims: Head Tag, Held Guard, and Replay"
domain: multiplayer
kind: subcard
parent: chapters-roll-guarantees-overview
files:
  - server-account/src/npcRoll.js
  - src/net/npcChapterLaw.js
  - server-account/migrations/0098_npc_roll.sql
routes:
  - /v1/chapters/claim
  - /v1/chapters/roll
tables:
  - npc_roll_heads
  - npc_rep_events
  - npc_roll
replacesBible:
  - "01-Overview/audits/Audit-Chapters.md"
related:
  - chapters-roll-guarantees-overview
  - chapters-roll-reputation-and-customs
invariants:
  - "A claim updates the head with its own minted `tag` and the next `seq` inside one batch guarded by `HELD_SQL` (character, standing, lease); a write that does not match writes nothing (AUDIT CHAP S1/S4)."
  - "A repeat is `last_rid` on the head or any `rid` still in `npc_rep_events` (AUDIT CHAP S6)."
  - "A no-op claim writes nothing and answers from rows in hand (AUDIT CHAP S7)."
  - "The client reads `kseq` as the Roll `seq`, and only a claim that writes a reputation line the client sent moves it. Service credits (an owed drain, `profWrits.js`, `craftWrits.js`, and `npcReceipts.js`) move only the head `seq`, so they never make an adopted Roll stale in an open tab."
traps:
  - "`npc_rep_events` is pruned after `ROLL_EVENTS_KEEP_S` (90 * 86_400 s) by the claims of the character, so replay detection only spans 90 days."
  - "`members: null` leaves memberships alone; `members: []` ends them."
dfu: []
tags:
  - audit
  - roll
  - idempotency
  - lease
---

# Chapter Roll Claims: Head Tag, Held Guard, and Replay

`server-account/src/npcRoll.js` and `src/net/npcChapterLaw.js` process reputation and membership updates at `/v1/chapters/claim` and `/v1/chapters/roll` across `npc_roll_heads`, `npc_roll`, and `npc_rep_events` (`server-account/migrations/0098_npc_roll.sql`). On initial seeding, `npc_roll_heads.cap` records the seed ceiling from `rollSeedCapOf`.

## Atomic Batching, Idempotency, and Membership Semantics

- **Held-lease batching and rate limits (`server-account/src/npcRoll.js`):** Each `/v1/chapters/claim` call checks hourly rate limits via `overRate` (`AUDIT CHAP2 E2`). Valid mutations advance `npc_roll_heads` with a freshly minted `tag` and next `seq` in one D1 batch guarded by `HELD_SQL` (verifying character ownership, standing, and realm lease); if the guard fails, nothing commits (`AUDIT CHAP S1/S4`). A no-op claim writes nothing and answers from rows in hand (`AUDIT CHAP S7`).
- **Replay detection and pruning:** A claim whose `rid` matches `npc_roll_heads.last_rid` or any row in `npc_rep_events` is treated as an idempotent repeat (`AUDIT CHAP S6`). Each claim prunes `npc_rep_events` rows older than `ROLL_EVENTS_KEEP_S` (`90 * 86_400` s, or `90` days).
- **Membership payloads and dormant books:** Passing `members: null` leaves guild memberships unchanged, whereas `members: []` terminates them. When mortal guild memberships become dormant under the vampire book, `npc_roll.dormant` preserves those rows (`AUDIT CHAP4 D1`).
