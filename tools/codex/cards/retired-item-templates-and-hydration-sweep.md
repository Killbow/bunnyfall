---
slug: retired-item-templates-and-hydration-sweep
title: "Retired Firearm Templates and Save Hydration Sweep"
domain: gameplay
kind: subcard
parent: items-gold-counter-and-wagon
files:
  - src/items/retiredItems.js
  - src/items/quickslots.js
  - src/saves/save.js
  - src/systems/quest/item.js
  - src/net/wire.js
  - server-account/src/judge.js
  - src/items/itemTemplates.js
  - src/items/lootRarity.js
  - src/items/portBooks.js
  - src/trade/shopStock.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Dwarven-Thunderlock.md"
  - "05-Combat/Dwarven-Pistolet.md"
  - "01-Overview/audits/Audit-Pistolet.md"
related:
  - items-gold-counter-and-wagon
  - economy-ledger-and-item-judge
  - hotbar-icons-item-slotting-and-key-gate
  - grappling-hook-tool
invariants:
  - "`RETIRED_TEMPLATES` in `src/items/retiredItems.js` reserves weapon template IDs `560`, `561`, and `562` from older saves so they can never be minted, equipped, quickslotted, or accepted by the online item judge."
  - "`removeRetiredItems(list)` splices retired item records out of carried and placeable item lists in place during save hydration (`src/saves/save.js`). It also deletes `equipSlot` from every Grappling Hook (`565`), so a hook saved as held returns to the pack. `hookItemKey` clears a saved quickslot or hotbar entry holding a hook."
traps:
  - "Quickslot keys encode `Weapons|<template>|<material>`; always filter saved quickslots with `retiredItemKey(key)` in `src/items/quickslots.js` so retired weapon bindings clear cleanly."
  - "Legacy `world245` and `acct170` version comments in `src/net/wire.js` and `server-account/src/service.js` are historical wire ledger entries; live validation rejects `560`, `561`, and `562` via `isRetiredItem`."
dfu: []
tags:
  - items
  - saves
  - retired-items
  - validation
---

# Retired Firearm Templates and Save Hydration Sweep

`src/items/retiredItems.js` tombstones legacy firearm weapon template IDs (`RETIRED_TEMPLATES`: `560`, `561`, and `562`) removed in the combat update while preserving save compatibility and lore book text (`Rourken Thunder`, book ID `418` in `src/items/portBooks.js`).

- **Predicates and Hydration Cleanup (`src/items/retiredItems.js`, `src/saves/save.js`, `src/items/quickslots.js`):** `isRetiredItem(item)` checks whether `item?.templateIndex` belongs to `RETIRED_TEMPLATES`. On save load, `removeRetiredItems(list)` in `src/saves/save.js` iterates backward and splices retired entries out of carried and placeable collections. `retiredItemKey(key)` parses `group|template|material` strings so `src/items/quickslots.js` drops stale `Weapons` bindings referencing `560`, `561`, or `562`.
- **Mint, Quest, Wire, and Judge Guards (`src/systems/quest/item.js`, `src/net/wire.js`, `server-account/src/judge.js`):** Quest item instantiation (`src/systems/quest/item.js`), wire item validation (`src/net/wire.js`), and the account item judge (`server-account/src/judge.js`) call `isRetiredItem` to refuse minting or syncing retired templates, while `src/items/itemTemplates.js`, `src/items/lootRarity.js`, and `src/trade/shopStock.js` keep shop shelves and drop tables free of retired ammunition and weapons.
