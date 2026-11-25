---
slug: woven-cloth-first-paid-pattern
title: "First-Paid Pattern Tracking on prof_crafts and Deferred Bonus Eligibility"
domain: economy
kind: subcard
parent: woven-cloth-first-make-overview
files:
  - server-account/src/profCraft.js
  - server-account/src/profToday.js
  - server-account/src/service.js
  - server-account/migrations/0177_woven_pays.sql
  - src/net/recipeLaw.js
  - src/ui/craftXpWords.js
  - src/ui/profPages.js
routes: []
tables:
  - prof_crafts
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-26b.md"
related:
  - woven-cloth-first-make-overview
  - professions-crafting-provenance-and-master-art
invariants:
  - "`prof_crafts.first_paid` (`0177_woven_pays.sql`) records `1` when a craft awarded the first-make bonus, `0` when skipped (repeat pattern or silver cloth consumed), and `NULL` on pre-migration rows."
  - "In `patternMade` (`server-account/src/profCraft.js`), crafting a pattern with silver cloth (`first_paid = 0`) leaves the first-make bonus unspent so the next qualifying craft of that pattern collects it."
  - "Legacy `NULL` rows count as paid when the row was the character earliest craft of that pattern and its awarded XP reached `FIRST_MAKE_FLOOR` (`500`)."
traps:
  - "Client `firstPaid` display logic and server `patternMade` queries must evaluate legacy `NULL` rows identically against `FIRST_MAKE_FLOOR`."
dfu: []
tags:
  - professions
  - first-make
  - crafting
  - d1
---

# First-Paid Pattern Tracking on prof_crafts and Deferred Bonus Eligibility

Pattern first-make bonus tracking (`server-account/src/profCraft.js`, `server-account/src/profToday.js`, `server-account/src/service.js`, `server-account/migrations/0177_woven_pays.sql`) records explicit payout state in `prof_crafts.first_paid` so crafting a pattern with silver-bought cloth defers the bonus rather than burning it.

## Deferred Payouts and `first_paid` States

Migration `0177_woven_pays.sql` adds `first_paid` to `prof_crafts` with three states:

- **`1` (Paid):** The craft qualified for and collected the pattern first-make XP bonus.
- **`0` (Skipped):** The craft was a repeat after a paid make, or it consumed bolts counted in `prof_silver_cloth`.
- **`NULL` (Legacy):** Pre-migration rows written before `first_paid` existed.

In `patternMade` (`server-account/src/profCraft.js`), rows with `first_paid = 0` do not mark the pattern as paid. If a character first crafts a garment using silver-counter or Drakes-bought cloth, the bonus remains available for the next craft of that pattern made with player-woven cloth.

## Legacy Row Resolution against `FIRST_MAKE_FLOOR`

Because ordinary base craft XP stays below `500`, both server queries (`patternMade` in `server-account/src/profCraft.js` and `server-account/src/profToday.js`) and client UI previews (`firstPaid` in `src/net/recipeLaw.js`, `src/ui/craftXpWords.js`, and `src/ui/profPages.js`) treat a legacy `NULL` row as paid only when it was the earliest craft of that pattern for the character and its awarded XP reached `FIRST_MAKE_FLOOR` (`500`).
