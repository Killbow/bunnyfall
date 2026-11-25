---
slug: chapters-hall-writs-receipts-and-merit
title: "Hall Writs, Receipt Credits, and Weekly Merit"
domain: multiplayer
kind: subcard
parent: chapters-arc-overview
files:
  - src/net/npcChapterLaw.js
  - src/net/npcHallBook.js
  - server-account/src/npcHalls.js
  - server-account/src/npcReceipts.js
  - server-account/src/npcMerit.js
  - server-account/src/profToday.js
  - src/net/professionLaw.js
  - server-account/src/seatInfluence.js
routes:
  - /v1/chapters/witness
  - /v1/chapters/halls
  - /v1/chapters/strike
tables:
  - world_witness
  - npc_hall_regions
  - npc_hall_strikes
  - hall_writ_days
  - writs
  - npc_receipt_credits
  - npc_chapter_merit
replacesBible:
  - "11-Multiplayer/Chapters-Arc.md"
related:
  - chapters-arc-overview
  - professions-board-and-writs
  - seats-witness-registry-and-influence
  - npc-chapter-bands-events-and-duties
invariants:
  - "Hall, member, and court writs share `COURT_WRITS_PER_DAY` (3) per account per UTC day: `writsStatement` counts every `writs` row filled that day. Receipt writs (`receiptWritRef`, `wgate:`/`wraid:`) are outside the three."
  - "`hallWritCount` = 2 * ceil(active / 100), at least 2. A delivered hall writ credits `HALL_WRIT_REP` (2). A receipt credits `RECEIPT_REP` (1) to each member guild that keeps a chapter in the region."
  - "Merit comes only from `MERIT_SOURCES` ('writ', 'gate', 'raid'): `MERIT_WRIT` 100 for an own-unit member writ (`meritOfWrit`, bought units earn none), and `MERIT_RECEIPT` 50 split by `meritOfReceipt` across the chapters reached."
  - "Merit requires `MERIT_TENURE_S` (7 days) on the Roll and `dormant = 0`. It is capped at `MERIT_CAP_WEEK` (600) per account per chapter per week, and an account earns in one chapter per guild per week."
  - "Gate Merit counts only in the region on which `GATE_REGION_AGREE` (3) of the day's claims agree (`agreedGateRegions`). A gate from another week is refused 'old-week'."
traps:
  - "`hallHidden` (Thieves Guild, Dark Brotherhood) withholds halls and writs from non-members. The Thieves Guild asks for no receipts (`hallReceiptKindsOf`)."
  - "A member writ (`memberWritId` `m:<day>:<region>:<faction>:<char>`) is drawn per member, not raced for. `isChapterWrit` covers 'hall' and 'member'."
  - "Hall reports: `HALL_REPORT_V` 1 and `HALL_WITNESS_HOUR` 24 per account per hour. The client keeps `HALL_REPORTED_KEY` 'chap2.halls' (max `HALL_REPORTED_MAX` 200)."
dfu: []
tags:
  - hall-writs
  - receipts
  - merit
  - witness
---

# Hall Writs, Receipt Credits, and Weekly Merit

Regional chapters form from witnessed guild halls and draw daily writs and combat receipts that convert into character Merit.

## Hall Witnessing and Daily Writs

- **Hall discovery (`/v1/chapters/witness`, `/v1/chapters/halls`, `/v1/chapters/strike`):** Clients report halls (`HALL_REPORT_V = 1`, cached under `HALL_REPORTED_KEY = 'chap2.halls'` up to `HALL_REPORTED_MAX = 200`) at up to `HALL_WITNESS_HOUR` (`24`) per account per hour. `server-account/src/npcHalls.js` updates `world_witness`, `npc_hall_regions`, and `npc_hall_strikes`, caching chapters for `CHAPTERS_KEPT_MS` (`60` s). `hallHidden` guilds hide halls and writs from non-members.
- **Hall and member writs (`hall_writ_days`, `writs`):** `hallFamiliesOf` maps material families (`src/net/professionLaw.js`, or `bunnyLawOf(...).families` for Bunnyfall guilds). Each region posts `hallWritCount` (`2 * ceil(active / 100)`, at least `2`) shared hall writs plus per-member writs (`memberWritId` `m:<day>:<region>:<faction>:<char>`, matched by `isChapterWrit`). Delivered hall writs credit `HALL_WRIT_REP` (`2`). Hall, member, and court writs share `COURT_WRITS_PER_DAY` (`3` per account per UTC day in `server-account/src/profToday.js`).

## Receipts and Weekly Merit

- **Receipts (`npc_receipt_credits`):** Gate and raid receipts (`receiptWritRef` with `wgate:` or `wraid:` in `server-account/src/npcReceipts.js`) sit outside the three-writ cap and credit `RECEIPT_REP` (`1`) per regional member chapter (`hallReceiptKindsOf` excludes the Thieves Guild).
- **Merit (`npc_chapter_merit`):** `server-account/src/npcMerit.js` grants Merit from `MERIT_SOURCES` (`'writ'`, `'gate'`, `'raid'`): `MERIT_WRIT` (`100`) via `meritOfWrit` for own-unit member writs, and `MERIT_RECEIPT` (`50`) split by `meritOfReceipt`. It requires `MERIT_TENURE_S` (`7` days) on the Roll and `dormant = 0`, caps at `MERIT_CAP_WEEK` (`600`) in one chapter per guild per week, and requires `GATE_REGION_AGREE` (`3`) matching claims (`agreedGateRegions`) from the current week (`'old-week'` on older gates).
