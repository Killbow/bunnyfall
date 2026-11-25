---
slug: loot-ii-cursed-finds-and-temple-lifting
title: "Cursed and Damned Finds and Temple Lifting"
domain: items
kind: subcard
parent: loot-ii-arc-overview
files:
  - src/items/lootRarity.js
  - src/items/lootCurse.js
  - src/ui/guildServiceWindow.js
  - src/scenes/worldModes.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Loot-II-Arc.md"
related:
  - loot-ii-arc-overview
  - economy-ledger-and-item-judge
invariants:
  - "`cursePass` curses 1 in `CURSE_IN = 12` door-minted Rare or Legendary items (including garments); Exalted, crafted, Broker, spoils, and quest items never pass a loot door and are never cursed."
  - "`cursePiece` adds one numeric line rolled from the top half of the tier band plus one `CURSE_DRAWBACKS` enchantment, and `curseParams` excludes drawbacks that cancel existing lines on the item."
  - "`liftPrice` charges `max(LIFT_FLOOR, round(value * LIFT_SHARE))` with `LIFT_FLOOR = 300` and `LIFT_SHARE = 0.25`, stripping the drawback while keeping the bonus line."
  - "`damnPass` converts 1 in `DAMNED_IN = 4` cursed Legendary weapons at drop time, setting its bonus line to the band maximum, applying `DAMNED_DRAWBACK` (Health Leech), and making `liftRefusal` return `'damned'`."
traps:
  - "`liftCurse` must remove the last matching drawback enchantment not placed by `makerLaid`; stripping a bound-soul row placed by a crafter leaves the curse active."
  - "Temple lifting refuses worn or unidentified items (`'worn'` and `'unknown'`), and `liftRefusal` only reports `'damned'` after identification."
dfu:
  - Assets/Scripts/Game/MagicAndEffects/Effects/Enchanting/HealthLeech.cs
tags:
  - curse
  - damned
  - temple
  - drawbacks
---

Cursed and damned loot drops and temple curse removal are implemented in `src/items/lootRarity.js`, `src/items/lootCurse.js`, `src/ui/guildServiceWindow.js`, and `src/scenes/worldModes.js`.

## Curse and Damned Drop Passes

During `rollLootRarity`, `cursePass` rolls a 1-in-`CURSE_IN` (`12`) chance on door-minted Rare and Legendary items, including rolled garments. Items created outside standard loot doors (Exalted pieces, player crafts, Broker purchases, battle spoils, and quest rewards) are never cursed.

`cursePiece` grants one extra numeric affix rolled in the upper half of the tier band alongside one DFU drawback from `CURSE_DRAWBACKS`: `Bad Rep With`, `Bad Reactions From`, `Item Deteriorates`, `User Takes Damage`, `Low Damage Vs` (weapons only), or `Health Leech` (weapons only). `curseParams` filters out any drawback that directly contradicts existing lines on the item.

Later in the door pipeline, `damnPass` upgrades 1 in `DAMNED_IN` (`4`) cursed Legendary weapons into a Damned weapon at drop time, pushing the cursed bonus line to the top of the band and locking in `DAMNED_DRAWBACK` (`Health Leech`).

## Identification and Temple Lifting

Once identified, `tierLabel` prepends `CURSED_WORD` and `curseLine` formats the drawback description. Temples expose curse removal through the guild service row `LIFT_ROW` (`'Lift Curse'`, hotkey `LIFT_KEY = 'KeyL'`), opened by `openLift` in `src/scenes/worldModes.js`.

`cursedKnown` lists identified cursed items in the player pack. `liftRefusal` blocks items that are `'worn'`, `'unknown'` (unidentified), or `'damned'`. For eligible items, `liftCurse` charges `liftPrice` (`max(300, round(value * 0.25))` via `LIFT_FLOOR` and `LIFT_SHARE`), removes the last matching drawback enchantment that `makerLaid` did not create, and leaves the reward line intact.
