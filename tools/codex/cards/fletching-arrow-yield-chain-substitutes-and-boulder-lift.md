---
slug: fletching-arrow-yield-chain-substitutes-and-boulder-lift
title: "Fletching Classic Arrow Yield, Chain Armor Substitutes, and Boulder Glint Lift"
domain: items
kind: subcard
parent: searchable-swimmers-single-body-and-lodged-enemies-overview
files:
  - src/formats/mwItemMap.js
  - src/characters/wardrobe.js
  - src/ui/profPages.js
  - src/professions/fletching.js
  - src/homes/onlineHomes.js
  - src/formats/mwFirstPerson.js
  - src/professions/mineHost.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-15c.md"
related:
  - searchable-swimmers-single-body-and-lodged-enemies-overview
  - arrow-supply-fletching-and-shop-quivers
invariants:
  - "`fletchYield` (`src/professions/fletching.js`) divides wood weight by the unpatched `0.25` kg classic Arrow weight (yielding `2` for Twig, `4` for Pine Branch, and `10` for Wood Bundle), ignoring item-mod weight overrides."
  - "Because Morrowind Imperial chain lacks boot, gauntlet, and pauldron meshes, `DF_TO_MW_ARMOR_MATERIAL` and `CHAIN_PIECES` (`src/formats/mwItemMap.js`, `src/characters/wardrobe.js`) substitute iron meshes."
  - "In `WEAPON_HANDS` (`src/formats/mwFirstPerson.js`), template `127` (Battle Axe) maps to `AxeOneHand` (`Either`) and `128` (War Axe) maps to `AxeTwoHand` (`Both`)."
  - "`homeDoorTitle(home, questName)` (`src/homes/onlineHomes.js`) places active quest residence names ahead of player home labels, and mining boulders lift glint markers by `BOULDER_LIFT = 0.4` m (`src/professions/mineHost.js`)."
traps:
  - "Reading modded arrow weight (`0.1` kg under Roleplay and Realism) inflated Twig fletching yield from `2` to `5` arrows."
  - "Loose looted crafting materials work at crafting benches (`src/ui/profPages.js`) but cannot fill writs, Stores deposits, or market sales."
dfu: []
tags:
  - fletching
  - morrowind-assets
  - homes
  - mining
---

# Fletching Classic Arrow Yield, Chain Armor Substitutes, and Boulder Glint Lift

Fletching yields, Morrowind equipment mappings, home door titles, and boulder glint offsets share helpers across all four scene hosts.

- **Arrow yield and loose materials (`src/professions/fletching.js`, `src/ui/profPages.js`):** `fletchYield` divides wood weight by the unpatched `0.25` kg classic Arrow weight (`2` for Twig, `4` for Pine Branch, and `10` for Wood Bundle), ignoring modded `0.1` kg Roleplay and Realism weight overrides that inflated Twig yield to `5`. Loose looted materials work at crafting benches but cannot fill writs, Stores deposits, or market sales.
- **Morrowind chain pieces and axe grip (`src/formats/mwItemMap.js`, `src/characters/wardrobe.js`, `src/formats/mwFirstPerson.js`):** Because Morrowind Imperial chain lacks boot, gauntlet, and pauldron meshes, `DF_TO_MW_ARMOR_MATERIAL` and `CHAIN_PIECES` substitute iron meshes. In `WEAPON_HANDS`, template `127` (Battle Axe) maps to `AxeOneHand` (`Either`) and `128` (War Axe) maps to `AxeTwoHand` (`Both`).
- **Home door titles and boulder glint (`src/homes/onlineHomes.js`, `src/professions/mineHost.js`):** `homeDoorTitle(home, questName)` places active quest residence names ahead of player home labels, and mining boulders lift glint markers by `BOULDER_LIFT = 0.4` m.
