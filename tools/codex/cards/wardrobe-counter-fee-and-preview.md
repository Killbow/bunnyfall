---
slug: wardrobe-counter-fee-and-preview
title: "Wardrobe Counter, Fee, and Try-On Preview"
domain: ui
kind: subcard
parent: wardrobe-appearances-overview
files:
  - src/items/wardrobeCounter.js
  - src/trade/shopRows.js
  - src/ui/merchantServiceWindow.js
  - src/ui/wardrobe/wardrobeWindow.js
  - src/ui/wardrobe/wardrobeDoor.js
  - src/ui/wardrobe/wardrobePreview.js
  - src/items/appearances.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Wardrobe.md"
related:
  - wardrobe-appearances-overview
  - wardrobe-look-catalogue-and-kinds
  - market-vendors-and-professions
  - characters-paperdoll-and-bodies
invariants:
  - "`wardrobeFee(look)` charges `max(WARDROBE_FEE_MIN = 25, round(itemBaseValue(lookStub(look)) / WARDROBE_FEE_SHARE = 20))` gold pieces."
  - "`clearAppearance` restores the base appearance of an item for free."
  - "`WARDROBE_SHOPS` restricts counter access to Clothing Store, Armorer, and Weaponsmith interiors; `createWardrobeCounter.row` returns `undefined` in all other buildings."
  - "`wearRefusal` validates `look`, `worn`, `kind`, `own`, `uncollected`, `same`, and `gold` in exact order, deducting no gold on refusal."
traps:
  - "Classic merchant service rows stack via `shopRowRect(panelH, i) = [5, panelH + 2 + 12 * i, 120, 10]` (`src/trade/shopRows.js`), placing the Wardrobe row at index `1` below a Portal Stone row or index `0` otherwise."
  - "The classic merchant dialog (`src/ui/merchantServiceWindow.js`) ignores keyboard repeat events so holding `W` while walking into a counter never opens the Wardrobe by accident."
  - "`previewWearer` creates an isolated prototype clone (`Object.create`) with a shallow-copied equip table; preview rendering must never mutate the live item or player paperdoll."
dfu: []
tags:
  - wardrobe
  - shop
  - fee
  - preview
  - ui
---

# Wardrobe Counter, Fee, and Try-On Preview

Players access the Wardrobe through shop service dialogs (`src/items/wardrobeCounter.js`, `src/trade/shopRows.js`, `src/ui/merchantServiceWindow.js`, and `src/ui/wardrobe/wardrobeDoor.js`) to preview and apply collected looks in `src/ui/wardrobe/wardrobeWindow.js` and `src/ui/wardrobe/wardrobePreview.js`.

## Shop Counter, Refusal Order, and Fees

- **Counter mounting (`src/items/wardrobeCounter.js`):** Inside `WARDROBE_SHOPS` (Clothing Store, Armorer, and Weaponsmith), `createWardrobeCounter` returns `{ row, open, wear, clear }`. Calling `open()` runs `noteHeldLooks` before mounting `createWardrobeOverlay`.
- **Fees and application (`src/items/appearances.js`):** Applying a look costs `wardrobeFee(look) = max(25, round(itemBaseValue(lookStub(look)) / 20))` (`WARDROBE_FEE_MIN = 25`, `WARDROBE_FEE_SHARE = 20`), whereas `clearAppearance` is free. `wearRefusal` checks `look`, `worn`, `kind`, `own`, `uncollected`, `same`, and `gold` in order. When gold is insufficient, the Wear button reads `'Need {n} more gold'` and status notes announce via an `aria-live="polite"` region. A successful `wear` plays `SOUND.GoldPieces`, and both `wear` and `clear` call `surfacePlayer` and refresh the paperdoll.

## Try-On Preview Pipeline

`src/ui/wardrobe/wardrobePreview.js` renders a `PREVIEW_FIGURE_H = 384` figure using `previewWearer` and caches up to `PREVIEW_KEEP = 8` figures. When Enhanced Plus is active, the preview assembles a 3D Morrowind body rig and falls back to the 2D paperdoll (`composeDollFor`) if unavailable. Rig builds run one at a time through a single pending `want` slot: any queued request superseded before its build begins is evicted from the memo, while an active build finishes before `pump()` starts the newest request. Closing the window unloads the preview rig in `dispose()`.
