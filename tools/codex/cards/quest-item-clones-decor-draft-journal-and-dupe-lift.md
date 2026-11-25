---
slug: quest-item-clones-decor-draft-journal-and-dupe-lift
title: "Quest Item Clone Flag, Decorator Draft Undo Journal, and Staff Dupe Purge"
domain: items
kind: subcard
parent: reforge-kept-names-road-sparing-and-crown-glints-overview
files:
  - src/items/itemTransfer.js
  - src/items/itemFields.js
  - src/systems/quest/foe.js
  - src/systems/quest/questsWorld.js
  - src/systems/questlines/qlLaw.js
  - src/systems/questlines/qlState.js
  - src/systems/questlines/patches/witches.json
  - src/systems/questlines/sheets/magesGuild.json
  - src/systems/questlines/sheets/nobility.json
  - src/systems/questlines/sheets/mainQuest.json
  - src/ui/enhancedInventory.js
  - src/homes/decorTool.js
  - src/homes/decorPack.js
  - src/scenes/worldModes.js
  - server-account/src/staffRealm.js
  - server-account/src/ledger.js
  - server-account/src/service.js
  - src/revenants/revenant.js
  - src/items/itemBound.js
  - src/tools/staffPanelActions.js
  - server-account/migrations/0096_integrity.sql
routes:
  - /v1/staff/item/purge-dupes
  - /v1/staff/item/give
tables:
  - item_dupes
  - realm_characters
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-25i.md"
related:
  - reforge-kept-names-road-sparing-and-crown-glints-overview
  - questlines-objective-sheets-and-branches
  - decor-built-in-hiding-wall-mounts-and-gold-drops
  - economy-ledger-and-item-judge
  - realm-saves-and-mod-save-hooks
invariants:
  - "Quest enemy item clones carry `questClone: true` (`src/systems/quest/foe.js`, declared in `src/items/itemFields.js`), and `heldQuestRecordIndex(items, dfItem, { clones = false })` (`src/items/itemTransfer.js`) matches the original quest item while skipping clones."
  - "Objectives `Q0C4XY04`, `N0B00Y06`, `R0C20Y07`, and `S0000503` advance on holding or handing in the item rather than corpse clicking (`reread: \"fb1025i\"` in `qlLaw.js`), and `questWord` tags quest items with their quest title."
  - "`src/homes/decorTool.js` journals draft moves and undoes them in reverse order on Discard without snapshotting chests, while `returnUnstood` (`src/homes/decorPack.js`) returns unconfirmed pieces on the next offline visit."
  - "`/v1/staff/item/purge-dupes` with `keep: true` (`server-account/src/staffRealm.js`, `copiesOfKeys`, `ownCopiesLiftable` in `ledger.js`) retains the copy matching the ledger row print across `item_dupes`, and revenants skip items where `isRealmLocked(item)` is true (`src/revenants/revenant.js`)."
traps:
  - "Whether any Daedra's Heart should satisfy Q0C4XY04 is an open owner decision."
  - "Do not pin ACCOUNT_VERSION from this arc; the live value has moved on."
dfu:
  - Assets/Scripts/Game/Questing/Foe.cs
  - Assets/Scripts/Game/Questing/Components/QuestResourceBehaviour.cs
tags:
  - quest-items
  - decorator
  - dupes
  - staff
  - revenants
---

# Quest Item Clone Flag, Decorator Draft Undo Journal, and Staff Dupe Purge

Quest item matching (`src/items/itemTransfer.js`, `src/systems/quest/foe.js`), home decorator draft rollback (`src/homes/decorTool.js`), and staff duplicate cleanup (`server-account/src/staffRealm.js`, `server-account/src/ledger.js`) isolate original quest targets, journal furniture edits, and reconcile duplicate item rows.

## Quest Item Clones and Objective Rebinding

When a quest enemy equips a quest reward (`src/systems/quest/foe.js`, `src/systems/quest/questsWorld.js`), the equipped copy receives `questClone: true` (`src/items/itemFields.js`). In `src/items/itemTransfer.js`, `heldQuestRecordIndex(items, dfItem, { clones = false })`, `keepsQuestItem`, and `playerHasItem` skip clones so only the canonical quest item satisfies quest checks, while `questWord` (`src/ui/enhancedInventory.js`) labels the item with its quest title. Objectives `Q0C4XY04`, `N0B00Y06`, `R0C20Y07`, and `S0000503` (`src/systems/questlines/patches/witches.json` and `src/systems/questlines/sheets/`) carry `reread: "fb1025i"` (`src/systems/questlines/qlLaw.js`, `src/systems/questlines/qlState.js`) to advance upon holding or turning in the item rather than clicking a corpse.

## Decorator Undo Journal and Staff Dupe Purge

- **Decorator draft journal (`src/homes/decorTool.js`, `src/homes/decorPack.js`, `src/scenes/worldModes.js`):** Rather than snapshotting home containers, `decorTool.js` logs each draft placement or pick-up in an undo journal and replays it in reverse on Discard. If a session ends mid-draft, `returnUnstood` (`decorPack.js`) restores unconfirmed pieces on the next offline visit.
- **Dupe purge and revenant locks (`server-account/src/staffRealm.js`, `src/revenants/revenant.js`):** `/v1/staff/item/purge-dupes` (`src/tools/staffPanelActions.js`, `server-account/src/service.js`, reading `item_dupes` and `realm_characters` from `0096_integrity.sql`) uses `copiesOfKeys` and `ownCopiesLiftable` (`ledger.js`) to remove flagged uids while `keep: true` preserves the copy matching the ledger print, and `/v1/staff/item/give` mints replacement items. Revenants skip any item where `isRealmLocked(item)` (`src/items/itemBound.js`) is true.
