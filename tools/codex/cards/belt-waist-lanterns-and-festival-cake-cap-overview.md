---
slug: belt-waist-lanterns-and-festival-cake-cap-overview
title: "Belt-Waist Lanterns, Festival Soul Cake Cap, and Field Safeguards"
domain: overview
kind: overview
parent: null
files:
  - src/items/beltLantern.js
  - src/player/playerTorch.js
  - src/items/handheldTorches.js
  - src/items/quickslots.js
  - src/ui/enhancedInventory.js
  - src/ui/inputActions.js
  - src/mods/modSettings.js
  - server-account/src/festival.js
  - src/net/festivalLaw.js
  - src/systems/festival/festivalClient.js
  - src/systems/festival/festivalWords.js
  - src/ui/wyrdWindow.js
routes:
  - /v1/festival/find
  - /v1/festival/mine
tables:
  - fest_finds
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-21b.md"
related:
  - naval-voyage-hold-berth-still-and-sail-wind
  - snow-year-snow-hold-and-desktop-renderer-gone
  - witches-festival-soul-cake-finds
  - witches-festival-wyrd-sister-sales
  - naval-and-come-sail-away
invariants:
  - "BELT-WAIST: `waistLanternOf(entity)` (src/items/beltLantern.js) returns `entity.lightSource` when `lanternAtWaist(lit)` is true, otherwise `beltLanternOf(entity)` (an unlit belt lantern), otherwise null."
  - "`lanternAtWaist(item)` (src/player/playerTorch.js) is true for a lantern-template item with `beltLantern === true`, or when handheld-torches is Enabled and `Handling.LanternsAtWaist` is on (default true, modSettings.js:862). Torches and candles are always held in the hand."
  - "The Enhanced inventory hand row shows the light only when `waistLanternOf(entity)` differs from `entity.lightSource` (`enhancedInventory.js`), so a lantern at the hip never takes the shield slot."
  - "`lanternFirst()` (handheldTorches.js:254) lights the lantern hung in the lantern slot before any pack lantern. While `lanternsAtWaist` is on or a belt lantern hangs, `toggleLightPress` routes through `waistPress()` with no free hand (handheldTorches.js:487)."
  - "CAKE-CAP-SAID: `findFestival` returns `{ found, cakes, today, ...(today >= FIND_CAKES_PER_DAY ? { capped: true } : {}) }` with HTTP 200. `FIND_CAKES_PER_DAY` = 120 and `FIND_ASKS_PER_DAY` = 1500 (src/net/festivalLaw.js). The day is the UTC day."
  - "Once `festivalFindsToday().full` is true, `askFind` sends no more find requests until the UTC day turns. `sayDayFull` announces the full day once per account per UTC day."
traps:
  - "The DFU light lives only in `PlayerEntity.LightSource`. `GetEquipSlot` gives lights no equip slot, so a belt lantern is a `beltLantern: true` mark on the item, not a new slot."
  - "Hotbar lantern slots skip the shield unequip and off-hand checks when `lanternAtWaist` is true (quickslots.js:1360-1363). Torches still take a hand."
  - "The asks-spent refusal `{ error: 'capped' }` is a 429 (`FEST_STATUS.capped`). Do not confuse it with the 200 `capped: true` returned past 120 cakes."
dfu:
  - Assets/Scripts/Game/Entities/PlayerEntity.cs
  - Assets/Scripts/Game/Items/DaggerfallUnityItem.cs
  - Assets/Scripts/Game/Items/ItemEquipTable.cs
tags:
  - belt-lantern
  - handheld-torches
  - festival
  - soul-cake
  - daily-cap
---

# Belt-Waist Lanterns, Festival Soul Cake Cap, and Field Safeguards

Waist-hung lantern handling and daily Soul Cake cap feedback span `src/items/beltLantern.js`, `src/player/playerTorch.js`, `src/items/handheldTorches.js`, `src/items/quickslots.js`, `src/ui/enhancedInventory.js`, `server-account/src/festival.js`, and `src/systems/festival/festivalClient.js`.

## Belt-Waist Lanterns and Off-Hand Slots

- **Waist resolution:** Because `GetEquipSlot` (`DaggerfallUnityItem.cs`, `ItemEquipTable.cs`) assigns lights no equip slot and active lights live in `PlayerEntity.LightSource` (`PlayerEntity.cs`), belt lanterns set `beltLantern: true`. `lanternAtWaist(item)` (`src/player/playerTorch.js`) is true for lantern templates when `beltLantern === true` or when handheld-torches is enabled with `Handling.LanternsAtWaist` (`src/mods/modSettings.js`), whereas torches and candles remain handheld. `waistLanternOf(entity)` (`src/items/beltLantern.js`) returns `entity.lightSource` when `lanternAtWaist(lit)` holds, otherwise `beltLanternOf(entity)`, otherwise `null`.
- **Inventory and hotbar controls:** `src/ui/enhancedInventory.js` renders the hand row light only when `waistLanternOf(entity)` differs from `entity.lightSource`, and hotbar lantern slots (`src/items/quickslots.js`) skip shield unequip checks when `lanternAtWaist` is true. `lanternFirst()` lights the lantern-slot item first, and `toggleLightPress` (`KeyO` via `TorchToggleLight` in `src/ui/inputActions.js`) calls `waistPress()` without needing a free hand.

## Daily Soul Cake Cap Status

Over `/v1/festival/find` (`fest_finds`), `findFestival` returns HTTP 200 (`capped: true`) at `FIND_CAKES_PER_DAY` (120), distinct from HTTP 429 at `FIND_ASKS_PER_DAY` (1500, `src/net/festivalLaw.js`). Once full, `askFind` pauses, `sayDayFull` fires once, and `src/ui/wyrdWindow.js` shows `findsTodayText` or `findsTodayFullText` (`src/systems/festival/festivalWords.js`).
