---
slug: remains-gold-hud-focus-and-report-map-overview
title: "Remains Gold, HUD Focus, and Field Report Law"
domain: overview
kind: overview
parent: null
files:
  - src/net/wildRemains.js
  - src/world/wild/wildDropLaw.js
  - src/items/loot.js
  - src/items/inventory.js
  - src/net/wire.js
  - src/travel/wagonKinds.js
  - src/ui/input.js
  - src/ui/chatPanel.js
  - src/player/activate.js
routes:
  - /v1/wild/fall
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-20h.md"
related:
  - questor-pool-and-nameless-quest-sites
  - enemy-expansion-souls-and-whole-trade-lots
  - loose-arcane-essence-and-expansion-hides
  - wild-zone-pvp-death-drops-and-remains
  - ui-arc-input-dispatch-and-key-edges
invariants:
  - "REMAINS-GOLD: a remains pile's coin record is minted by its count through `goldStack` (src/items/inventory.js) up to `GOLD_INT_MAX` (2_147_483_647, src/items/itemLaw.js) in `mintOne` (src/net/wildRemains.js), never through `validLootList`, whose `LOOT_STACK_MAX` (65535, src/items/loot.js) used to drop larger piles."
  - "REMAINS-TAKE: a pile is shown as the room holds it, minus my takes still in flight (`settle`/`follow`); the room's `rm` that follows my `got` must not subtract the same take twice."
  - "TAB-WALK: `swallowBrowserKey` prevents a Tab or Shift+Tab aimed at the page itself (`isPageFocusWalk` / `isPageTarget`: no target, BODY, or HTML). Ctrl, Alt, and Meta+Tab, text fields, and `[data-dom-focus]` windows (`isDomFocusWalk`) keep their Tab."
  - "HUD-FOCUS: `neverTheFocus` sets `tabIndex = -1`, prevents the `mousedown` default, and blurs on `focus`. src/ui/chatPanel.js applies it to Play online here, the Chat open button, Show, and both Social buttons."
traps:
  - "Wild death gold drop is one tenth (`WILD_GOLD_DIVISOR` = 10 in `wildDropLaw.js`), not one half."
  - "Exterior offering ray checks use `RayBox` `{ min, max }` in `src/player/activate.js` rather than a 6-element array."
dfu:
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallInventoryWindow.cs
  - Assets/Scripts/Game/InputManager.cs
tags:
  - remains
  - gold
  - input
  - focus
  - wild-zone
---

# Remains Gold, HUD Focus, and Field Report Law

This overview covers wild remains gold minting, pile takes, browser Tab and HUD focus guards, and exterior ray boxes alongside `questor-pool-and-nameless-quest-sites`, `enemy-expansion-souls-and-whole-trade-lots`, and `loose-arcane-essence-and-expansion-hides`.

## Wild Remains Gold and Pile Takes

When `/v1/wild/fall` drops one tenth of coin (`WILD_GOLD_DIVISOR` 10 in `src/world/wild/wildDropLaw.js`), a small cart (`SMALL_CART_KG` 750 in `src/travel/wagonKinds.js`, `GOLD_PIECE_WEIGHT_KG` 0.0025 or 400 coins per kg) holds 300,000 gold inside `WILD_STACK_MAX` (`1_000_000` in `src/net/wire.js`). In `src/net/wildRemains.js`, `mintOne` mints coin records via `goldStack` (`src/items/inventory.js`) up to `GOLD_INT_MAX` (`2_147_483_647`), bypassing `validLootList` and `LOOT_STACK_MAX` (`65535` in `src/items/loot.js`). Partial takes split stacks like DFU `CanCarryAmount` (`DaggerfallInventoryWindow.cs`), and displayed piles subtract in-flight `settle` and `follow` takes so the room `rm` after `got` never deducts twice.

## Browser Tab, HUD Focus, and Ray Boxes

- **Focus and Tab (`src/ui/input.js`, `src/ui/chatPanel.js`, `InputManager.cs`):** `swallowBrowserKey` prevents Tab and Shift+Tab on `isPageFocusWalk` (`isPageTarget`: no target, `BODY`, or `HTML`), preserving modifier Tabs, text fields, and `[data-dom-focus]` windows (`isDomFocusWalk`). `neverTheFocus` sets `tabIndex = -1`, prevents `mousedown` default, and blurs on `focus` for Play online here, Chat open, Show, and both Social buttons.
- **Ray boxes (`src/player/activate.js`):** Exterior offering ray checks use `RayBox` `{min, max}` bounds, not a six-element array.
