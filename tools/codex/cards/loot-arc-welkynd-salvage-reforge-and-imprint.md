---
slug: loot-arc-welkynd-salvage-reforge-and-imprint
title: "Welkynd Shard Salvage, Reforge Replacement, and Power Imprinting"
domain: items
kind: subcard
parent: loot-arc-overview
files:
  - src/items/reforge.js
  - src/items/lootCodex.js
  - src/items/lootRarity.js
  - src/worldEvents/gateSpoils.js
  - src/ui/reforgeWindow.js
  - src/net/temperLaw.js
  - server-account/src/alchemy.js
  - server-account/src/index.js
  - server-account/migrations/0089_temper_reforge.sql
routes:
  - /v1/prof/reforge
tables:
  - prof_reforges
replacesBible:
  - "06-Systems/Loot-Arc.md"
related:
  - loot-arc-overview
  - loot-ii-reforge-honing-scry-and-sockets
  - market-vendors-and-professions
  - economy-ledger-and-item-judge
invariants:
  - "`SALVAGE_SHARDS` yields `{ magic: 1, rare: 3, legendary: 8, exalted: 15 }` Welkynd Shards, while `salvageRefusal` rejects aetheric, gilded, artifact, quest, gem-socketed, self-made, classic-magic, bound, worn, and locked items."
  - "`salvageMany` evaluates each item individually through `salvagePiece`, skipping rejected items and returning them in `refused` without aborting the batch."
  - "Offline `REFORGE_PRICE` charges a fixed cost per tier (`magic`: 12 shards and 3,000 gold; `rare`: 25 shards and 10,000 gold; `exalted`: 50 shards and 30,000 gold), and `reforgeAffix` increments `reforges` up to `REFORGES_MAX = 31`."
  - "`IMPRINT_PRICE` (`20` shards and `5,000` gold) imprints a discovered Legendary power onto an identified, unworn, unimprinted Rare item of the matching equipment group (`imprintChoices`), leaving the item at Rare rarity."
  - "Online `/v1/prof/reforge` (`reforgeWithEssence`) requires `choose: true` and Enchanting rank `REFORGE_RANK = 50`, spends fixed `REFORGE_ESSENCE` (`{ magic: 12, rare: 25 }`), and deduplicates requests via `prof_reforges` (`player`, `rid`)."
traps:
  - "Live `reforgePrice` and `REFORGE_ESSENCE` charge flat per-tier amounts; neither scales with the item's `reforges` count."
  - "On a Legendary item, `reforgeableLines` exposes only the Exalted bonus affix line, never a base Legendary line or a socketed gem line."
dfu: []
tags:
  - salvage
  - welkynd-shard
  - reforge
  - imprint
  - legendary-codex
---

Unwanted Magic, Rare, Legendary, and Exalted drops break down into Welkynd Shards (`WELKYND_SHARD_TEMPLATES` in `src/worldEvents/gateSpoils.js`) to fund single-line affix replacement and Legendary power imprinting in `src/items/reforge.js` and `src/ui/reforgeWindow.js`.

## Welkynd Shard Salvage

`salvagePiece` and `salvageMany` destroy eligible gear for `SALVAGE_SHARDS` (`1` Magic, `3` Rare, `8` Legendary, `15` Exalted). `salvageRefusal` blocks equipped, locked, bound, quest, artifact, classic-magic, aetheric, gilded, gem-socketed, and self-crafted (`isSelfMade`) items; pieces crafted by other characters salvage normally at their tier. `spendShards` consumes newest spendable inventory stacks first.

## Reforge Replacement and Online Essence Reforging

Offline `reforgePrice` charges a flat `REFORGE_PRICE` by tier (`12` shards / `3,000` gold for Magic, `25` / `10,000` for Rare, `50` / `30,000` for Exalted). `reforgeableLines` allows rerolling any non-gem line on Magic or Rare gear, or the bonus Exalted line on an Exalted Legendary. `reforgeAffix` (`lootRarity.js`) replaces the line and increments `reforges` up to `REFORGES_MAX` (`31`).

Online (`src/net/temperLaw.js`, `server-account/src/alchemy.js`, `0089_temper_reforge.sql`), `/v1/prof/reforge` runs `reforgeWithEssence` at Enchanting rank `REFORGE_RANK` (`50`) with `choose: true`, charging fixed `REFORGE_ESSENCE` (`12` Magic, `25` Rare) plus Marks argents (`upgradeArgents('reforge', tier)`) and logging `(player, rid)` in `prof_reforges`.

## Discovered Powers and Imprinting

`src/items/lootCodex.js` records each discovered Legendary kind and its `foundDay` inside the `LootCodex` save record. `imprintChoices` lists unlocked powers compatible with an identified, unworn, unimprinted Rare piece, and imprinting costs `IMPRINT_PRICE` (`20` shards and `5,000` gold).
