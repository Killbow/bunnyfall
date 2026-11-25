---
slug: rehomed-item-prints-and-craft-limit
title: "Rehomed Rarity Base Prints, Unworn Powers, and Craft Limit"
domain: items
kind: subcard
parent: warded-blows-and-relayed-lord-radii
files:
  - src/items/lootRarity.js
  - src/items/loot.js
  - src/magic/enchantments.js
  - src/saves/save.js
  - server-account/src/ledger.js
  - server-account/src/judge.js
  - src/net/professionLaw.js
  - src/net/profBook.js
  - src/ui/profPages.js
  - src/ui/craftXpWords.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Field-Bugs-2026-10-18f.md"
related:
  - warded-blows-and-relayed-lord-radii
  - economy-ledger-and-item-judge
  - loot-rarity-ladder-overview
invariants:
  - "rehomedPrint (lootRarity.js, ledger.js) handles the RARITY-WEAR base move so ledgerPrintOf matches."
  - "worksUnworn is true for payloads carrying the Used flag; mixed rows need a wearable base (powersNeedWearing)."
  - "craftLimitOf in professionLaw.js is the one source for craft room and the rank held."
traps:
  - "repairItemLists in save.js must not rewrite held piece bases."
  - "A craft cannot regress below rank 50 (owner decision)."
dfu: []
tags:
  - items
  - ledger
  - professions
  - craft
---

# Rehomed Rarity Base Prints, Unworn Powers, and Craft Limit

Rarity base print matching, unworn enchantment eligibility, and crafting rank limits are shared across `src/items/lootRarity.js`, `src/items/loot.js`, `src/magic/enchantments.js`, `src/saves/save.js`, `server-account/src/ledger.js`, `server-account/src/judge.js`, and `src/net/professionLaw.js`.

## Rehomed Ledger Prints and Load Preservation

When a rarity template shifts base item category under `RARITY-WEAR`, only fresh minting uses the updated base. Existing items retain their stored base on load, and `repairItemLists` in `src/saves/save.js` must never rewrite held piece bases, or `ledgerStep` in the realm ledger will flag honest characters as forged. Instead, `rehomedPrint` in `src/items/lootRarity.js` and `server-account/src/ledger.js` reconciles legacy and moved base prints so `ledgerPrintOf` validates older items alongside newly minted pieces.

## Unworn Powers and Craft Rank Limits

In `src/items/loot.js` and `src/magic/enchantments.js`, `worksUnworn` evaluates true for enchantment payloads carrying the `Used` flag, whereas mixed enchantment rows require a wearable base via `powersNeedWearing`.

In `src/net/professionLaw.js`, `craftLimitOf` is the single authority for remaining craft room and held rank across `src/net/profBook.js`, `src/ui/profPages.js`, and `src/ui/craftXpWords.js`:
- A craft cannot regress below rank `50`.
- Master cap display text resolves through `prof.craft.xpTop` in `src/ui/craftXpWords.js`.
- Craft and rank names remain in English across every locale.
