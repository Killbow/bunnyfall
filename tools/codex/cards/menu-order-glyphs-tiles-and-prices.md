---
slug: menu-order-glyphs-tiles-and-prices
title: "Menu Glyphs, Decorator Tiles, Shop Counter, and Stores Stations"
domain: ui
kind: subcard
parent: menu-order-overview
files:
  - src/ui/menuGlyphs.js
  - src/ui/decorPanel.js
  - src/ui/enhancedTrade.js
  - src/ui/profPages.js
  - src/ui/marketTab.js
  - src/ui/reforgeWindow.js
  - src/ui/shipyardWindow.js
  - src/ui/enhancedMerchantPanel.js
  - src/ui/menuPicture.js
  - src/professions/profItems.js
routes: []
tables: []
replacesBible:
  - "10-UI/Menu-Order.md"
related:
  - menu-order-overview
  - menu-order-runtime-pictures-and-refusals
  - market-vendors-and-professions
  - professions-market-auctions-and-orders
invariants:
  - "Glyphs are applied with data-dficon. DFICON_CSS paints them as a CSS mask over currentColor, so they follow every theme's text color."
  - "rowPrice(item, from) in enhancedTrade.js must agree with the strip's quotePriceFor quote."
traps:
  - "DECOR_ACT_GROUPS, TRADE_COST_WORD and TRADE_TITLE.SellMagic are t() getters (decor.panel.*, trade.counter.*). Read them live; do not snapshot them at import time."
  - "On phones the decor rooms scroll sideways and the filters fold behind one Filters button. decorFiltersText reports how many chosen filters are hidden."
dfu: []
tags:
  - menu-order
  - glyphs
  - decorator
  - trade
  - stores
  - market
---

# Menu Glyphs, Decorator Tiles, Shop Counter, and Stores Stations

Enhanced panels apply `data-dficon` masks (`DFICON_CSS` over `currentColor` in `src/ui/menuGlyphs.js`), grid tiles, inline row prices, and minted material pictures (`src/ui/menuPicture.js`, `src/professions/profItems.js`).

- **Decorator tiles and shop counter (`src/ui/decorPanel.js`, `src/ui/enhancedTrade.js`):** `DECOR_GRID_MODES` (`catalogue`, `look`, `own`, `room`, and `base`) show `76` px tiles (`DECOR_LAYOUT_WORDS` `{ grid: 'Pictures', list: 'List' }`), while other views stay lists. `DECOR_ACT_GROUPS` groups `Arrange`, `Light and storage`, `Crafting station`, `This piece`, `The whole room`, `Price a day`, `Offer this room`, and `Rent held`. On phones, rooms scroll sideways and filters fold behind one button (`decorFiltersText` counts hidden filters). In `src/ui/enhancedTrade.js`, `rowPrice(item, from)` matches `quotePriceFor`, `TRADE_OWN_HEAD` labels `'Your pack'`, `TRADE_COST_WORD` reads `To pay` or `You get`, and `.trade-steal` sits apart. Read `DECOR_ACT_GROUPS`, `TRADE_COST_WORD`, and `TRADE_TITLE.SellMagic` live via `t()` (`decor.panel.*`, `trade.counter.*`).
- **Stores, Market, and service icons (`src/ui/profPages.js`, `src/ui/marketTab.js`, `src/ui/reforgeWindow.js`, `src/ui/shipyardWindow.js`, `src/ui/enhancedMerchantPanel.js`, `src/professions/profItems.js`):** `src/ui/profPages.js` renders a `STATION_TILES` row, toggles away stations with `_stores.awayPick`, and marks active sections via `stationWorkable(node)`. Material rows lead with `mintMaterialItem` pictures. Icon maps wire `MARKET_VIEW_ICONS` (`materials: 'ore'`, `crafted: 'station'`, `auctions: 'gavel'`, `goods: 'own'`, `orders: 'list'`, `mine: 'treasure'`, `history: 'chart'`), `SHIPYARD_TAB_ICONS` (`ships`, `fleet`, `yard`, `refits`, `crew`), eight `REFORGE_PAGE_ICONS` pages, and `MERCHANT_ICONS` (`Talk`, `Sell`, `Banking`, `Repair item`, `Exit`).
