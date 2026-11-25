---
slug: professions-crafting-provenance-and-master-art
title: "Crafting Stations, Signed Provenance, Repair, Reforging, and Master-Art"
domain: economy
kind: subcard
parent: professions-arc-overview
files:
  - src/net/productRecord.js
  - src/net/recipeLaw.js
  - src/net/chainLaw.js
  - src/net/temperLaw.js
  - src/net/alchemyLaw.js
  - src/net/masterLaw.js
  - src/ui/craftHall.js
  - src/ui/craftXpWords.js
  - server-account/src/alchemy.js
  - server-account/src/masterWork.js
routes:
  - /v1/prof/craft
  - /v1/prof/make
  - /v1/prof/smelt
  - /v1/prof/stock
  - /v1/prof/brew
  - /v1/prof/disenchant
  - /v1/prof/temper
  - /v1/prof/reforge
  - /v1/prof/master
tables:
  - products
  - prof_crafts
  - prof_smelts
  - prof_stock
  - prof_brews
  - prof_unbruised
  - prof_disenchants
  - prof_tempers
  - prof_reforges
  - prof_masters
  - prof_silver_cloth
replacesBible:
  - "06-Systems/Professions-Arc.md"
related:
  - professions-arc-overview
  - professions-market-auctions-and-orders
  - economy-ledger-and-item-judge
  - market-vendors-and-professions
invariants:
  - "`MINT_VERSION` is `MINT_V_JEWEL_KIN` (4); `craftMintVersion` stamps the client's requested version clamped to `MINT_VERSION`, falling back to `MINT_V_LINES`."
  - "Master-Art (`/v1/prof/master`) stamps `MINT_V_MASTER` (5) and signs rolled stat lines inside `products` (`PRODUCT_RECORD_MAX = 704` bytes)."
  - "`MASTER_CATALYSTS` consumes 2 Heartwood, 3 Pearls, and 10 Arcane Essence from counted (never `loose`) Stores once per character per UTC day (`prof-master-day`) at `MASTER_RANK = 100`."
  - "`CHAIN_DEPTH` caps intermediate crafting chains at 4 steps; repair kits restore up to `KIT_CEILING = 0.75`, rising to `KIT_CEILING_HIGH = 0.9` for Superior (quality 3) and higher kits."
  - "`NO_PACK_FORM` items (`work:ram` and `essence:arcane`) remain inside Stores and cannot be withdrawn into a character's pack."
traps:
  - "Base `craftXp` is `CRAFT_XP_PER_TIER` (20) times tier (Masonry and Cooking substitute the rank's tier), scaled by `CRAFT_PACE` and Focus with zero first-make bonus."
  - "`LOOSE_ONLY_KEYS` (graded gems and `DAEDRA_HEART`) enter Stores only as `loose` units, walling them off from player markets and writs."
tags:
  - crafting
  - provenance
  - master-art
  - reforge
  - alchemy
---

Crafting stations (`src/ui/craftHall.js` and `src/ui/craftXpWords.js`) drive server-minted production (`/v1/prof/craft`, `/v1/prof/make`, `/v1/prof/smelt`, and `/v1/prof/stock` across `prof_crafts`, `prof_smelts`, `prof_stock`, and `prof_silver_cloth`) with signed provenance in `products` (`src/net/productRecord.js`, `PRODUCT_RECORD_MAX` 704).

## Recipe Chains, Stores Guards, and Provenance

`src/net/recipeLaw.js` and `src/net/chainLaw.js` bound multi-step refinement to `CHAIN_DEPTH` (4). Base `craftXp` equals `CRAFT_XP_PER_TIER` (20) times recipe tier (Masonry and Cooking use the crafter's rank tier) before `CRAFT_PACE` and Focus scaling. `NO_PACK_FORM` materials (`work:ram` and `essence:arcane`) never leave Stores for the pack, while `LOOSE_ONLY_KEYS` (graded gems and `DAEDRA_HEART`) deposit only into `loose` Stores so they cannot enter markets or writs. Standard crafts mint at `MINT_VERSION` (`MINT_V_JEWEL_KIN` 4), with `craftMintVersion` clamping client requests or defaulting to `MINT_V_LINES`.

## Alchemy, Repair, Reforging, and Master-Art

- **Alchemy and disenchanting (`src/net/alchemyLaw.js`, `server-account/src/alchemy.js`):** `/v1/prof/brew` (`prof_brews`, `prof_unbruised`) charges `ALCHEMY_FEE` (25 gold), and `/v1/prof/disenchant` (`prof_disenchants`) yields arcane essence toward `ESSENCE_POINTS` (100).
- **Tempering, kits, and reforging (`src/net/temperLaw.js`):** `/v1/prof/temper` (`prof_tempers`) upgrades gear, while repair kits restore `KIT_REPAIR` (0.25) or `FIELD_KIT_REPAIR` (0.15) up to `KIT_CEILING` (0.75, or `KIT_CEILING_HIGH` 0.9 at Superior quality 3+). `/v1/prof/reforge` (`prof_reforges`) doubles its price each try up to `REFORGES_MAX` (31 in `src/items/lootRarity.js`).
- **Master-Art (`src/net/masterLaw.js`, `server-account/src/masterWork.js`):** At `MASTER_RANK` (100), `/v1/prof/master` (`prof_masters`, once per character per UTC day under `prof-master-day`) spends `MASTER_CATALYSTS` (2 Heartwood, 3 Pearls, and 10 Arcane Essence from counted Stores) to mint `MINT_V_MASTER` (5) gear with `MASTER_LINES` (3) signed lines (`MASTER_PROCS_MAX` 1), preserved by `LOOT_HELLO_LAW` (1 in `src/net/wire.js`).
