---
slug: menu-order-overview
title: "Menu Order: Picture-First Menus"
domain: ui
kind: overview
parent: null
files:
  - src/ui/menuGlyphs.js
  - src/ui/menuPicture.js
  - src/ui/decorPanel.js
  - src/ui/enhancedTrade.js
  - src/ui/profPages.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "10-UI/Menu-Order.md"
related:
  - menu-order-glyphs-tiles-and-prices
  - menu-order-runtime-pictures-and-refusals
  - ui-arc-overview
  - market-vendors-and-professions
  - ui-overlays-and-localization
  - home-port-doctrine-overview
invariants:
  - "Picture before a word: each kind, view, station and press wears a 12x12 glyph or item picture ahead of its label."
  - "Pictures are ours: glyphs are typed as rows of # in DFICON_ROWS, and thumbnails and portraits are rendered at runtime. No ARENA2 raster is copied."
  - "Price where the thing is: shelf rows show the same price as the counter quote. Trade formulas are untouched."
  - "What is not here waits to be asked: away stations, phone filters and the Keys legend stay folded until pressed."
traps:
  - "Classic native windows (INVE00I0/SHOP00I0, MASK00I0, ITEM00I0) are excluded under THE NATIVE-WINDOW RULE. Do not add pictures there."
  - "Picture providers are now split across src/trade/marketWorld.js, src/trade/vendorHost.js and src/professions/professionsBootWorld.js, not world.js alone."
dfu: []
tags:
  - menu-order
  - ui
  - glyphs
  - pictures
  - enhanced
---

# Menu Order: Picture-First Menus

The Menu Order architecture places a visual glyph or runtime item picture ahead of every enhanced UI label while preserving classic native windows untouched (`src/ui/menuGlyphs.js`, `src/ui/menuPicture.js`, `src/ui/decorPanel.js`, `src/ui/enhancedTrade.js`, `src/ui/profPages.js`, `src/scenes/world.js`).

- **Four governing rules (`src/ui/menuGlyphs.js`, `src/ui/menuPicture.js`, `src/ui/enhancedTrade.js`, `src/ui/decorPanel.js`, `src/ui/profPages.js`):** First, picture before a word: every kind, view, station, and press leads with a `12x12` glyph or item picture mounted via `pictureNode` (`src/ui/menuGlyphs.js`), with `itemPicture` and `materialPicture` (`src/ui/menuPicture.js`) sized to `MENU_PICTURE_BOX` (`SLOT_BOX.row`). Second, pictures are ours: glyphs live as `#` character rows in `DFICON_ROWS`, and model thumbnails and ship portraits render at runtime without copying `ARENA2` rasters. Third, price where the thing is: shop shelf rows display the exact counter quote without altering trade formulas. Fourth, what is not here waits to be asked: away stations, phone filters, and the Keys legend remain folded until pressed.
- **Native window boundary and split providers (`src/scenes/world.js`, `src/trade/marketWorld.js`, `src/trade/vendorHost.js`, `src/professions/professionsBootWorld.js`):** Classic native windows (`INVE00I0`, `SHOP00I0`, `MASK00I0`, and `ITEM00I0`) never receive menu pictures. Across sub-arcs `a` through `g`, picture providers split across `src/scenes/world.js` (`setVendorPage`, `itemPicture`), `src/trade/marketWorld.js` (Market, Notice Board, and `marketPiecePicture`), `src/trade/vendorHost.js` (`createVendorHost`, `openHomeVendorWindow`, and `vendorBoardHost`), and `src/professions/professionsBootWorld.js` (Stores material pictures).
