---
slug: woven-cloth-first-make-overview
title: "Woven Cloth First-Make XP and Per-Character Silver Cloth Counter"
domain: economy
kind: overview
parent: null
files:
  - src/net/recipeLaw.js
  - src/net/bagLaw.js
  - src/net/profBook.js
  - src/ui/craftXpWords.js
  - src/ui/profPages.js
  - src/professions/professionsBootWorld.js
  - server-account/src/profShared.js
  - server-account/src/profCraft.js
  - server-account/src/market.js
  - server-account/migrations/0177_woven_pays.sql
routes: []
tables:
  - prof_silver_cloth
  - prof_crafts
  - prof_stores
  - prof_carried
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-26b.md"
related:
  - woven-cloth-first-paid-pattern
  - professions-crafting-provenance-and-master-art
  - professions-arc-overview
  - wallet-sheet-ledger-and-silver
invariants:
  - "Outfitting crafts made wholly of `JUDGED_CLOTH` (`Linen` or `Wool`) award the pattern first-make XP bonus (`FIRST_MAKE_FLOOR = 500` in `src/net/recipeLaw.js`) regardless of fiber origin unless a consumed bolt counts against `prof_silver_cloth`."
  - "`prof_silver_cloth` (`0177_woven_pays.sql`, keyed by `(player, char_id, material)` with zero-quantity rows deleted) increments on silver counter buys (`buyStock`) and Drakes market purchases, and decrements first whenever the character uses Linen or Wool at stations (`silverSql`, `silverClothIn` in `server-account/src/profShared.js`)."
  - "`src/net/profBook.js` mirrors remaining `silver` cloth beside Stores counts for loom UI display."
traps:
  - "Material unit origin (`bought` vs `loose`) cannot gate cloth first-make XP because player-woven cloth from bought fiber stamps `bought` while dropped vendor bolts stamp `loose`."
  - "`disenchantXp` in `alchemyLaw.js` remains restricted to self-gathered materials (`bought_with` unset)."
dfu: []
tags:
  - professions
  - outfitting
  - loom
  - first-make
  - silver
---

# Woven Cloth First-Make XP and Per-Character Silver Cloth Counter

Outfitting cloth crafts (`src/net/recipeLaw.js`, `server-account/src/profCraft.js`, `server-account/src/profShared.js`) track vendor and Drakes cloth bolts in `prof_silver_cloth` (`server-account/migrations/0177_woven_pays.sql`) rather than relying on `prof_stores` or `prof_carried` origin stamps (`src/net/bagLaw.js`), while `src/net/profBook.js`, `src/ui/craftXpWords.js`, `src/ui/profPages.js`, and `src/professions/professionsBootWorld.js` mirror the remaining silver count to the loom UI.

## Judged Cloth and the Silver Cloth Counter

Weaving bought flax or wool fiber stamps the resulting bolt `bought`, whereas dropping and re-depositing a vendor bolt stamps it `loose`. To separate player-woven cloth from purchased bolts, `JUDGED_CLOTH` (`Linen` and `Wool` in `src/net/recipeLaw.js`) awards the pattern first-make XP bonus (`FIRST_MAKE_FLOOR = 500` in `prof_crafts`) across any fiber origin unless a consumed bolt drains `prof_silver_cloth`.

- **Incrementing and draining (`server-account/src/profShared.js`, `server-account/src/market.js`):** `prof_silver_cloth` (keyed by `(player, char_id, material)`, deleting zero-quantity rows) increments on silver counter buys (`buyStock`) and Drakes market purchases (never on gold purchases). Whenever a character spends Linen or Wool at a station, `silverSql` and `silverClothIn` decrement `prof_silver_cloth` first.
- **Disenchant guard:** Unlike Outfitting cloth, `disenchantXp` in `src/net/alchemyLaw.js` still requires self-gathered inputs (`bought_with` unset).
