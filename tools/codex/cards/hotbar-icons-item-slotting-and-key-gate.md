---
slug: hotbar-icons-item-slotting-and-key-gate
title: "Hotbar Spell Icons, Item Slotting, and Key Gate"
domain: ui
kind: subcard
parent: slots-hotbar-status-overview
files:
  - src/ui/enhancedHotbar.js
  - src/items/quickslots.js
  - src/ui/spellIcons.js
  - src/ui/uiSkin.js
  - src/ui/uiPrefs.js
  - src/ui/enhancedHud.js
  - src/mods/features.js
  - src/ui/enhancedInventory.js
routes: []
tables: []
replacesBible:
  - "10-UI/Slots-Hotbar-Status.md"
related:
  - slots-hotbar-status-overview
  - ui-arc-quickslot-diamond
  - ui-arc-input-dispatch-and-key-edges
invariants:
  - "Spell faces are cut from `ICON00I0.IMG` (`src/ui/spellIcons.js`) and fitted to `FIT_DEFAULT_SPELL_BOX = 34`; item faces use `FIT_DEFAULT_BOX = 38`."
  - "`freeReady` in `src/items/quickslots.js` readies the spell tagged `LYCANTHROPY_SPELL_TAG` at no spell point cost, from the hotbar and the diamond alike."
  - "The bar binds `keydown` and `mousedown` on `window` with `capture = true` and drops every press while `keysPaused()` is true (the host pause, or the `paused` flag from the last frame)."
traps:
  - "`hideEnhancedHud()` draws with `hidden` and `paused` both `true`; dungeon windows that use digits `1` to `0` depend on this so the bar does not steal their keys."
  - "`wornForMore` equips Armor, or a piece carrying a power other than Cast When Used or FeatherWeight, before casting; Cast When Used gear is put on first and cast once worn."
  - "A press whose result kind is `refused`, `empty`, or `none` plays the 260ms `hb-deny` flash; a camp rejected by the ground returns `'refused'`."
dfu: []
tags:
  - hotbar
  - spells
  - lycanthropy
  - keys
  - diamond
---

# Hotbar Spell Icons, Item Slotting, and Key Gate

`src/ui/enhancedHotbar.js` and `src/items/quickslots.js` drive the 10-slot enhanced hotbar and share quickslot execution with `ui-arc-quickslot-diamond`.

## Style Preference, Icons, and Hover Slotting

`HOTBAR_PREF` (`'quickbarStyle'` in `src/ui/uiSkin.js` and `src/ui/uiPrefs.js`) selects from `HOTBAR_STYLES` (`['hotbar', 'diamond']`) and defaults to `'hotbar'` in `src/mods/features.js`. Spell icons slice `ICON00I0.IMG` (`src/ui/spellIcons.js`) into `FIT_DEFAULT_SPELL_BOX = 34`, whereas item sprites fit `FIT_DEFAULT_BOX = 38`. While browsing the pack (`src/ui/enhancedInventory.js`, alongside `localPrimaryAct` quick-use) or spellbook, `setHotbarPick` exposes the hovered row so pressing a hotbar key slots it directly.

## Activation Rules and Capture-Phase Key Gate

In `src/items/quickslots.js`, `freeReady` readies any spell carrying `LYCANTHROPY_SPELL_TAG` at zero magicka cost on both quickbar styles. Activating slotted gear runs `wornForMore`: standard armor and enchanted pieces carrying powers other than Cast When Used or FeatherWeight equip without casting, whereas Cast When Used items equip first and cast on the next press. Any activation returning `refused` (such as a camp rejected by uneven ground), `empty`, or `none` triggers the 260ms `hb-deny` flash.

`bindKeys` attaches `keydown` and `mousedown` listeners on `window` with `capture = true` and ignores input whenever `keysPaused()` is true. Calling `hideEnhancedHud()` (`src/ui/enhancedHud.js`) sets both `hidden` and `paused` to `true` so modal windows using keys `1` through `0` receive their digit presses.
