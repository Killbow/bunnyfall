---
slug: loot-ii-arc-overview
title: "Loot Arc II: Caps, Wardrobe, Curses, and Reforge Services"
domain: items
kind: overview
parent: null
files:
  - src/items/lootRarity.js
  - src/items/reforge.js
  - src/items/lootCurse.js
  - src/items/lootScry.js
  - src/items/ayleidStones.js
  - src/ui/reforgeWindow.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Loot-II-Arc.md"
related:
  - loot-ii-resist-cap-luck-and-wardrobe
  - loot-ii-cursed-finds-and-temple-lifting
  - loot-ii-reforge-honing-scry-and-sockets
  - loot-ii-junk-quick-loot-and-ayleid-stones
  - economy-ledger-and-item-judge
  - balance-arc-reflection-leech-and-arcane-caps
  - weapon-technique-roster-and-affix-line
invariants:
  - "Every Loot II mechanic is gated by `lootRarityOn()`; when off, loot doors return standard DFU items (plus final finds) without ladder affixes, curses, or sockets."
  - "`rollLootRarity` executes passes in a fixed sequence: tiers, unique finds, `lastPass`, `wardrobePass`, `cursePass`, `socketPass`, `rollLateFinds`, `weaponSocketPass`, the gem find, `damnPass`, `techniquePass`, and `rollFinalFinds`."
traps:
  - "Never reorder passes or consume extra RNG draws ahead of an existing pass in `rollLootRarity`; seeded loot doors (spoils and receipts) depend on deterministic rolls for every earlier item."
dfu: []
tags:
  - loot
  - rarity
  - loot-ii
  - reforge
---

Loot Arc II (`LOOT12` through `LOOT21`) extends the item rarity ladder in `src/items/lootRarity.js` and `src/items/reforge.js` with rolled resistance caps, multiplicative Luck scaling, garment affixes, cursed and damned drops, honing, dungeon scrying, gem sockets, junk filtering, and Ayleid stones.

## Deterministic Door Pipeline and Item State

All arc systems check `lootRarityOn()`. When enabled, `rollLootRarity` steps through a strict pass order so seeded doors (such as battle spoils and wild receipts) produce identical items across clients and verification checks: base tier rolls, unique finds, `lastPass`, `wardrobePass`, `cursePass`, `socketPass`, `rollLateFinds`, `weaponSocketPass`, gem finds, `damnPass`, `techniquePass`, and `rollFinalFinds`.

The arc introduces no HTTP routes, WebSocket frames, or SQLite tables. All persistence lives directly on item records through fields such as `cursed`, `honed`, `junk`, `socket`, and `sockets`.

## Guild Services and Subcards

`src/ui/reforgeWindow.js` exposes the Reforge service tabs listed in `REFORGE_GUILD_PAGES` (`reforge`, `imbue`, `salvage`, `imprint`, `codex`, `scry`, and `sockets`), while curse removal operates as a separate temple service row.

- `loot-ii-resist-cap-luck-and-wardrobe`: the 45-point rolled resistance cap, `luckMult`, and garment rolls.
- `loot-ii-cursed-finds-and-temple-lifting`: cursed and damned drop passes, drawbacks, and temple lifting.
- `loot-ii-reforge-honing-scry-and-sockets`: band-top honing, regional dungeon scrying, and gem sockets.
- `loot-ii-junk-quick-loot-and-ayleid-stones`: line comparisons, junk flags, quick-loot filters, and Welkynd or Varla stones.
