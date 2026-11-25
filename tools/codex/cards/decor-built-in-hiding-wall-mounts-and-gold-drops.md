---
slug: "decor-built-in-hiding-wall-mounts-and-gold-drops"
title: "Built-In Decor Hiding, Wall Mount Decals, Home Prompts, and Gold Stacks"
domain: "homes"
kind: "subcard"
parent: "gate-beacon-seams-and-morrowind-hand-overview"
files:
  - "src/homes/decorBase.js"
  - "src/homes/decorRoom.js"
  - "src/homes/decorTool.js"
  - "src/homes/decorPlacer.js"
  - "src/homes/onlineHomes.js"
  - "src/net/decorLaw.js"
  - "src/render/renderer.js"
  - "src/ui/enhancedInventory.js"
  - "src/ui/nativeInventory.js"
  - "src/items/itemTransfer.js"
  - "src/items/loot.js"
  - "server-account/src/homes.js"
  - "server-account/src/decor.js"
  - "server-account/migrations/0015_home_hidden.sql"
routes: []
tables:
  - "home_hidden"
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-09-26.md"
related:
  - "gate-beacon-seams-and-morrowind-hand-overview"
  - "ui-arc-enhanced-inventory-and-pack"
  - "homes-camps-guilds-and-territories"
  - "yard-decor-culling-and-shadow-cubes"
invariants:
  - "`src/homes/decorBase.js` refuses hiding built-in pieces that hold items, ladders (`LADDER_MODEL_ID`), or mill machinery (`MACHINERY_MODEL_ID`); hidden pieces persist online in `home_hidden` (`0015_home_hidden.sql`)."
  - "`decorIsMount` (`src/net/decorLaw.js`) flags wall-mountable gear, and `renderer.drawDecalPicture` sets `uPicture` so mounted item icons render untinted."
  - "Owned ship and house containers open as two-way `loot.storage` sessions in `src/ui/enhancedInventory.js` and `src/ui/nativeInventory.js`."
  - "`planDropGold` (`src/items/itemTransfer.js`) routes gold Drop, Store, and Stow actions under `LOOT_STACK_MAX` (`65535` in `src/items/loot.js`)."
traps:
  - "`homeDoorPrompt` (`src/homes/onlineHomes.js`) offers unowned houses for sale on every interaction mode except Steal."
  - "`src/homes/decorPlacer.js` hangs ceiling pieces below downward-facing normals so models stay inside the room shell."
dfu:
  - "Assets/Scripts/Game/PlayerActivate.cs"
  - "Assets/Scripts/Game/UserInterfaceWindows/DaggerfallInventoryWindow.cs"
tags:
  - "decorator"
  - "built-in-furniture"
  - "wall-mount"
  - "storage"
  - "gold"
---

# Built-In Decor Hiding, Wall Mount Decals, Home Prompts, and Gold Stacks

In `src/homes/decorBase.js`, `src/homes/decorRoom.js`, and `src/homes/decorTool.js`, the Decorator Built in (`N`) tab lists built-in room furniture so the owner can remove or restore pieces. Hiding is refused for pieces holding items, ladders (`LADDER_MODEL_ID`), or mill machinery (`MACHINERY_MODEL_ID`), and hidden pieces persist online in the `home_hidden` table (`server-account/migrations/0015_home_hidden.sql`, `server-account/src/homes.js`, and `server-account/src/decor.js`).

In `src/net/decorLaw.js` and `src/render/renderer.js`, `decorIsMount` flags wall-mountable gear, while `renderer.drawDecalPicture` binds `uPicture` so mounted item icons render untinted. In `src/homes/decorPlacer.js`, ceiling decorations hang below downward-facing normals so models remain inside the room shell. In `src/homes/onlineHomes.js`, `homeDoorPrompt` offers unowned houses for sale across every interaction mode except Steal.

In `src/ui/enhancedInventory.js` and `src/ui/nativeInventory.js`, owned ship and house containers open as two-way `loot.storage` sessions. In `src/items/itemTransfer.js` and `src/items/loot.js`, `planDropGold` routes gold Drop, Store, and Stow transfers within `LOOT_STACK_MAX` (`65535`), though the classic skin can still offer a gold stack above `65535` that the server refuses.
