---
slug: gem-sockets-overview
title: "Gem Sockets: Physical Slots and Graded Gems"
domain: items
kind: overview
parent: null
files:
  - src/items/lootRarity.js
  - src/items/gemGrades.js
  - src/items/gems.js
  - src/items/reforge.js
  - src/ui/socketWells.js
  - src/items/itemFields.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Gem-Sockets.md"
related:
  - gem-sockets-capacity-and-socket-rolls
  - gem-sockets-graded-gems-drops-and-boss-spoils
  - gem-sockets-setting-shattering-and-extraction
  - loot-ii-reforge-honing-scry-and-sockets
  - loot-ii-arc-overview
invariants:
  - "Every socket roll, world gem drop, boss gem reward, socket action, and socket UI element is gated by `lootRarityOn()`."
  - "Each socket stores a value from `SOCKET_VALUES`: `SOCKET_EMPTY` (`'empty'`) or one of the 40 gem ids in `ALL_GEM_IDS` (8 plain Daggerfall gems plus 32 graded gem templates)."
  - "Socket and gem RNG draws run after all earlier loot draws at an encounter or chest, keeping prior seeded loot streams deterministic."
traps:
  - "An item can carry either the legacy single-socket `socket` string field or the `sockets` array, never both; `socketsOf` normalizes either shape on read, while `writeSockets` migrates the item to the `sockets` array and deletes `socket` on first write."
dfu: []
tags:
  - gems
  - sockets
  - loot-rarity
  - items
---

# Gem Sockets: Physical Slots and Graded Gems

The gem socket system layers multi-socket equipment slots, five-tier graded gems, and interactive inventory socket wells onto the loot-rarity ladder across `src/items/lootRarity.js`, `src/items/gemGrades.js`, `src/items/gems.js`, `src/items/reforge.js`, and `src/ui/socketWells.js`.

## Architecture and Feature Gating

- **Catalog and registration (`gemGrades.js`, `gems.js`):** The leaf module `src/items/gemGrades.js` defines the eight gem kinds, five quality grades, stat lines, drop bands, and template ids (`ALL_GEM_IDS`), which `src/items/lootRarity.js` re-exports. At startup, `src/items/gems.js` registers the 32 custom graded gem templates and wires `rollGemFind` into the loot ladder via `registerGemFind`.
- **Ladder gate (`lootRarityOn()`):** Socket generation (`socketPass`, `weaponSocketPass`), world and boss gem drops (`gemFindChance`, `bossGems`), socket mutations (`socketWork`), batch salvage protection (`salvageRefusal`), and inventory socket widgets (`socketWells`, `markSocketFrame`) all require `lootRarityOn()`.
- **Storage migration (`itemFields.js`, `lootRarity.js`):** Each slot holds a member of `SOCKET_VALUES` (`SOCKET_EMPTY = 'empty'` or one of the 40 `ALL_GEM_IDS` entries). Items in saves may carry either the legacy single-socket `socket` string field or the `sockets` array, never both. `socketsOf` reads either format, and `writeSockets` writes the `sockets` array while deleting the legacy single-socket `socket` string field.

## Subcards

- `gem-sockets-capacity-and-socket-rolls`: equipment group capacities, rarity caps, and seeded roll pass ordering.
- `gem-sockets-graded-gems-drops-and-boss-spoils`: graded gem templates, affix lines, world drop odds, and boss spoils.
- `gem-sockets-setting-shattering-and-extraction`: free setting and shattering, paid Reforge extraction, same-stat Rare caps, and socket wells.
