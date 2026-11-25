---
slug: chapters-roll-tab-adoption-and-stops
title: "Chapter Roll Tracker: Kept Adoption, First Read, and Stops"
domain: multiplayer
kind: subcard
parent: chapters-roll-guarantees-overview
files:
  - src/net/npcRollTracker.js
  - src/net/npcChapterLaw.js
  - src/net/accountClient.js
  - server-account/src/routeStatus.js
routes:
  - /v1/chapters/roll
  - /v1/chapters/claim
  - /v1/chapters/witness
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Chapters.md"
related:
  - chapters-roll-guarantees-overview
  - chapters-roll-reputation-and-customs
invariants:
  - "The last adoption is saved under mod-save vendor `ROLL_KEPT_VENDOR` ('ChaptersRoll') so a pagehide, reload, or tab close loses nothing (AUDIT CHAP C1/T1)."
  - "The first read adopts over the kept adoption (or `values0`), keeping unsent moves (AUDIT CHAP C2/C4)."
  - "`ROLL_STOPS` includes 'lease' and 'chapters-closed': these end asking rather than retrying (AUDIT CHAP R12, CHAP2 C4)."
traps:
  - "A 'lease' refusal stops only for that lease; a new lease may ask again."
  - "Retries back off from `ROLL_RETRY_MS` (30 s) to `ROLL_RETRY_MAX_MS` (15 min); claims at most every `ROLL_CLAIM_MS` (60 s)."
dfu: []
tags:
  - audit
  - roll
  - client
  - persistence
---

# Chapter Roll Tracker: Kept Adoption, First Read, and Stops

`src/net/npcRollTracker.js`, `src/net/npcChapterLaw.js`, and `src/net/accountClient.js` synchronize client guild reputation and memberships with `/v1/chapters/roll`, `/v1/chapters/claim`, and `/v1/chapters/witness`. Host systems connect through `rollEntityDoors` (`AUDIT CHAP T5`) in `src/net/npcRollTracker.js`.

## Saved Adoptions, Dual-Book Reads, and Backoff Rules

- **Kept adoption across reloads (`ROLL_KEPT_VENDOR`):** When the client adopts server Roll state, it saves the baseline under mod-save vendor `ROLL_KEPT_VENDOR` (`'ChaptersRoll'`, `AUDIT CHAP C1/T1`). After a tab close, reload, or `pagehide`, the first read adopts over the kept baseline (or `values0`), preserving unsent local reputation moves (`AUDIT CHAP C2/C4`).
- **Dual-book memberships and seat refresh:** `rollMembersOf` reads both mortal and vampire guild books, marking dormant lines `d: 1` for `npc_roll.dormant`. Even when no reputation or membership values move, the tracker refreshes regional seats after `ROLL_SEATS_MS` (`10` min, `AUDIT CHAP4 C1`).
- **Claim cadence, backoff, and terminal stops:** Claims send at most every `ROLL_CLAIM_MS` (`60` s), and transient errors back off from `ROLL_RETRY_MS` (`30` s) to `ROLL_RETRY_MAX_MS` (`15` min). Terminal codes in `ROLL_STOPS` (`'lease'` and `'chapters-closed'`, mapped in `server-account/src/routeStatus.js`) stop further requests (`AUDIT CHAP R12, CHAP2 C4`); a `'lease'` refusal stops only for that lease and resumes under a new lease.
