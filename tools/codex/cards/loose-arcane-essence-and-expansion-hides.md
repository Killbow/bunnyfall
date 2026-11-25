---
slug: loose-arcane-essence-and-expansion-hides
title: "Loose Arcane Essence and Enemy Expansion Hides"
domain: economy
kind: subcard
parent: remains-gold-hud-focus-and-report-map-overview
files:
  - server-account/src/alchemy.js
  - server-account/src/profCraft.js
  - server-account/src/profSpend.js
  - server-account/src/market.js
  - server-account/src/routes/seatsRoutes.js
  - server-account/migrations/0142_essence_loose.sql
  - src/net/bagLaw.js
  - src/ui/profPages.js
  - src/ui/storesWalled.js
  - src/net/professionLaw.js
routes:
  - /v1/prof/disenchant
  - /v1/prof/reforge
tables:
  - products
  - prof_disenchants
  - market_sales
  - prof_stores
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-20h.md"
related:
  - remains-gold-hud-focus-and-report-map-overview
  - materials-bag-loose-origin-and-station-crafting
  - professions-crafting-provenance-and-master-art
  - market-vendors-and-professions
  - enemy-expansion-registry-sprites-and-bodies
invariants:
  - "`products.loose` (migration 0142) is 1 when a piece is walled to gold (`bought_with = 'gold'`) by the loose goods it was made from, and 0 when a gold purchase walled it. market.js `buyWithGold` sets `loose = 0`."
  - "`disenchantPiece` gives origin `'loose'` (`LOOSE_ORIGIN`) for a gold-walled piece with loose = 1, `'gold'` for a gold-bought piece, and otherwise 'own' or 'bought'. `prof_disenchants.origin` allows `'loose'`."
  - "`reforgeWithEssence` spends as a station does (`STATION_ORIGINS` in profSpend.js): loose, then bought, then own, never gold."
traps:
  - "Loose Essence has no pack form: it never goes to the pack and cannot be listed on the market (`walledUnits` in src/ui/storesWalled.js)."
  - "The Hell Hound (264) is a daedra and gives no hide; Lizard Men and the Troll count as people."
dfu:
  - Assets/Scripts/Game/EnemyBasics.cs
  - Assets/Scripts/Game/Items/ItemBuilder.cs
tags:
  - arcane-essence
  - loose-origin
  - disenchant
  - hides
  - enemy-expansion
---

# Loose Arcane Essence and Enemy Expansion Hides

Disenchanting provenance (`server-account/src/alchemy.js`, `server-account/src/profCraft.js`, `server-account/src/profSpend.js`, `server-account/src/market.js`, `server-account/src/routes/seatsRoutes.js`, `server-account/migrations/0142_essence_loose.sql`) separates loose-crafted gear from gold purchases, while `src/net/professionLaw.js` maps expansion beasts to hides.

## Loose Essence Provenance and Reforging

Migration `0142_essence_loose.sql` adds `products.loose` (`1` when loose inputs wall a piece to `bought_with = 'gold'`, `0` when `buyWithGold` walls a `market_sales` purchase). On `/v1/prof/disenchant`, `disenchantPiece` records `LOOSE_ORIGIN` (`'loose'`, `src/net/bagLaw.js`) in `prof_disenchants` and `prof_stores` when `bought_with = 'gold'` and `loose = 1`, `'gold'` when `loose = 0`, and otherwise `'own'` or `'bought'`. On `/v1/prof/reforge`, `reforgeWithEssence` spends `STATION_ORIGINS` (`loose`, `bought`, `own`, never `gold`). With no pack form (`src/ui/profPages.js`, `walledUnits` in `src/ui/storesWalled.js`), loose essence never enters the pack or market.

## Expansion Hides and Cure Ordering

`hideOfFoe` (`src/net/professionLaw.js`, `EnemyBasics.cs`, `ItemBuilder.cs`) maps Bat (260) to Bat Leather (656), Wolf/Snow Wolf/Dog (262/263/267) to Wolf Pelt (681), Boar (278) to Boar Hide (682), Mudcrab (281) to tier-1 Mudcrab Chitin (683, no part), Blood Spider (271) to Spider Silk (659), Land Dreugh (279) to Dreugh Shell (663), and Mountain Lion (280) to Tiger Pelt (658). Wolf Pelt and Boar Hide are tier 2 with `part:tooth` (Big Tooth, `PART_CHANCE` 0.25). Hell Hound (264, daedra) yields no hide, Lizard Men and Troll count as people, and `CURE_RECIPES` sorts curable hides by tier ascending.
