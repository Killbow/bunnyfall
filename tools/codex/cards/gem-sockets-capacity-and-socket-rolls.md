---
slug: gem-sockets-capacity-and-socket-rolls
title: "Socket Capacity, Tier Caps, and Socket Rolls"
domain: items
kind: subcard
parent: gem-sockets-overview
files:
  - src/items/lootRarity.js
  - src/characters/equipRules.js
  - src/items/itemLaw.js
  - src/items/foeLootCap.js
  - src/worldEvents/gateSpoils.js
  - src/systems/eliteGates/egSpoils.js
  - src/systems/ketch/ketchSpoils.js
  - src/worldEvents/serpentSpoils.js
  - src/worldEvents/sdSpoilsRoll.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Gem-Sockets.md"
related:
  - gem-sockets-overview
  - loot-ii-reforge-honing-scry-and-sockets
  - loot-arc-drop-rates-renown-and-loot-lines
invariants:
  - "`socketMax` returns `0` for ammunition and groups outside `SOCKET_GROUPS` (`'Weapons'`, `'Armor'`, and `'Jewellery'`), `1` for armor, jewelry, and short blades (`WEAPON_SOCKETS.short`), `3` (`WEAPON_SOCKETS.two`) for `'Both'`-handed weapons in `WEAPON_HANDS`, and `2` (`WEAPON_SOCKETS.one`) for other weapons."
  - "`socketCap` grants full `socketMax` capacity to Rare and Legendary items, caps Magic weapons at `1`, and returns `0` for Common items and non-weapon Magic gear."
  - "`socketPass` rolls one empty socket on unsocketed Rare (`150` per mille) and Legendary (`300` per mille) items in `SOCKET_GROUPS` via `SOCKET_PER_MILLE`."
  - "`weaponSocketPass` rolls a first socket on unsocketed weapons via `WEAPON_SOCKET_PER_MILLE` (`120` Magic, `250` Rare, `400` Legendary) and then rolls additional sockets via `MORE_SOCKET_PER_MILLE` (`300` Rare, `450` Legendary) up to `socketCap`, stopping on the first failed roll."
  - "`validSocket` (`src/items/itemLaw.js`) rejects items that carry both the legacy single-socket `socket` string field and the `sockets` array, exceed `socketCap`, or have gem affix lines that do not match `gemLine` in socket order."
  - "`rollPass` draws in a fixed order from gold through `techniquePass`, and the Panoply choice and named-legendary check always take a draw; any new draw goes last."
traps:
  - "`socketMax` reads static `WEAPON_HANDS` (`src/characters/equipRules.js`) without applying the player bow-hand preference setting, so toggling bow-hand options never alters a weapon's socket capacity."
  - "Tiers with a `0` roll chance consume no RNG draw in `weaponSocketPass`, so editing non-zero entries in `WEAPON_SOCKET_PER_MILLE` or `MORE_SOCKET_PER_MILLE` shifts downstream draws."
dfu: []
tags:
  - sockets
  - weapons
  - loot-rarity
  - rng
---

# Socket Capacity, Tier Caps, and Socket Rolls

Socket capacity, rarity ceilings, seeded roll passes, and validation rules live in `src/items/lootRarity.js` and `src/items/itemLaw.js`.

## Maximum Sockets and Rarity Caps

`socketMax(item)` computes physical capacity by equipment group and static `WEAPON_HANDS` (`src/characters/equipRules.js`), ignoring the bow-hand preference setting:

- **Non-socketable (`0`):** Ammunition and groups outside `SOCKET_GROUPS` (`'Weapons'`, `'Armor'`, and `'Jewellery'`).
- **Single-socket (`1`):** Armor, jewelry, and short blades (`WEAPON_SOCKETS.short = 1`).
- **Two-socket (`2`):** Standard one-handed weapons (`WEAPON_SOCKETS.one = 2`).
- **Three-socket (`3`):** `'Both'`-handed weapons in `WEAPON_HANDS` (`WEAPON_SOCKETS.two = 3`).

`socketCap(item)` grants full `socketMax` to Rare and Legendary items, caps Magic weapons at `1`, and gives `0` to Common items and non-weapon Magic gear (an empty `sockets` array counts as zero sockets and is valid on any tier).

## Seeded Roll Order and Validation

`rollLootRarity` runs `cursePass`, `socketPass`, late finds, `weaponSocketPass`, gem find, `damnPass`, and `techniquePass` in order. Enemy loot (`src/items/foeLootCap.js`) and boss spoils (`gateSpoils.js`, `egSpoils.js`, `ketchSpoils.js`, `serpentSpoils.js`, and `sdSpoils.js`) run both `socketPass` (`SOCKET_PER_MILLE`: `150` Rare, `300` Legendary) and `weaponSocketPass` (`WEAPON_SOCKET_PER_MILLE`: `120` Magic, `250` Rare, `400` Legendary; then `MORE_SOCKET_PER_MILLE`: `300` Rare, `450` Legendary until the first miss or `socketCap`). `validSocket` rejects items carrying both the legacy single-socket `socket` string field and the `sockets` array, exceeding `socketCap`, or mismatching `gemLine` order.
