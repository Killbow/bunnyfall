---
slug: loot-arc-legendary-powers-and-proc-caps
title: "Legendary Powers, Active Affixes, and Their Caps"
domain: items
kind: subcard
parent: loot-arc-overview
files:
  - src/items/lootPowers.js
  - src/items/lootRarity.js
  - src/player/playerDoor.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Loot-Arc.md"
related:
  - loot-arc-overview
  - loot-ii-resist-cap-luck-and-wardrobe
  - balance-arc-reflection-leech-and-arcane-caps
invariants:
  - "Legendary powers and active proc affixes trigger only for the local player entity (`mine`) against non-player enemies; hits against another player (`target.isPlayer`) return null so PvP duels stay unaffected."
  - "`wornPowers` deduplicates equipped items by power ID, so wearing multiple copies of the same Legendary power grants its effect only once."
  - "Armor thorns damage caps at `THORNS_CAP = 10` per incoming blow, and reflected thorns damage in `src/player/playerDoor.js` (`paidBack`) never reduces an attacker below 1 HP."
  - "Jewelry focus, casting speed, and life leech clamp at `FOCUS_CAP = 30`%, `CAST_SPEED_CAP = 30`%, and `LEECH_CAP = 10`%."
  - "Total magicka cost reduction clamps at `SPELL_CUT_MOST = 50`% and total damage-spell amplification clamps at `SPELL_POWER_MOST = 50`%."
traps:
  - "Use `SPELL_POWER_MOST` for spell-damage bonuses and `SPELL_CUT_MOST` for magicka-cost reduction; both equal `50`, but they cap separate accumulators."
dfu: []
tags:
  - legendary-powers
  - proc-affixes
  - thorns
  - focus
  - caps
---

Active proc affixes on Magic and Rare gear and unique effects on Legendary equipment run through `src/items/lootPowers.js`, `src/items/lootRarity.js`, and `src/player/playerDoor.js` under hard combat caps and PvE-only guards.

## Active Affixes and Weapon Family Fitting

When a Magic or Rare item rolls a proc line (`PROC_PER_MILLE` in `lootRarity.js`), the line grants a slot-appropriate active effect without altering the item's display name: weapons roll elemental sear, life leech, or family slayer edge; armor rolls thorns reflection; and jewelry rolls magicka focus.

Each of the 30 `LEGENDARY_POWERS` entries attaches a signature combat or spellcasting hook to a Legendary record or an imprinted Rare item. `powerFits` validates weapon compatibility before imprinting or triggering so melee-only effects (such as ground-slam earthquakes) cannot apply to ranged bows. At runtime, `wornPowers` scans equipped slots and emits at most one entry per unique power ID, preventing duplicate stacking. Every trigger checks `mine` to exclude remote multiplayer peers and exits immediately when `target.isPlayer` is true.

## Combat and Spellcasting Caps

Aggregated proc and power bonuses obey strict ceilings across all worn pieces:

- **Thorns reflection:** Clamped at `THORNS_CAP` (`10`) damage per hit; `paidBack` (`playerDoor.js`) leaves the attacker alive on lethal reflection.
- **Leech, focus, and cast speed:** Clamped at `LEECH_CAP` (`10`%), `FOCUS_CAP` (`30`%), and `CAST_SPEED_CAP` (`30`%).
- **Arcane totals:** Spell cost reduction caps at `SPELL_CUT_MOST` (`50`%) and spell damage bonus caps at `SPELL_POWER_MOST` (`50`%).
