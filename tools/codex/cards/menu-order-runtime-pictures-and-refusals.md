---
slug: menu-order-runtime-pictures-and-refusals
title: "Model Thumbnails, Ship Portraits, and Refused Presses"
domain: ui
kind: subcard
parent: menu-order-overview
files:
  - src/homes/decorTool.js
  - src/homes/panelPicture.js
  - src/systems/naval/shipPortraits.js
  - src/systems/naval/comeSailAwayPool.js
  - src/ui/brokerWindow.js
  - src/ui/enhancedPlusStyle.js
  - src/ui/reforgeWindow.js
  - src/ui/decorPanel.js
  - src/ui/touch.js
routes: []
tables: []
replacesBible:
  - "10-UI/Menu-Order.md"
related:
  - menu-order-overview
  - menu-order-glyphs-tiles-and-prices
  - shipyards-shipmaster-sales-and-resale
  - gilded-look-and-door-refusals
invariants:
  - "Thumbnails are drawn offscreen through canvasBoxUnder after the world's last draw, at most DECOR_THUMBS_A_FRAME (2) per frame and DECOR_THUMB_PX (152, twice the 76px tile) square."
  - "An ask older than DECOR_THUMB_WAIT_MS (20000) or made under another texture-remap law resolves null, and the tile keeps its kind glyph."
  - "refusePress(btn, reason, tell) sets aria-disabled, never disabled. It keeps the title, prefixes the aria-label with the word on the button, and reports the reason on the window note line."
traps:
  - "Actions still in flight stay truly disabled and show no refusal text."
  - "The panel bracket does not hand mesh uniforms back (kept finding R2). Anything drawn after it must set its own state."
  - "Portrait boats are kept per hull for the whole session with no teardown (kept finding R8)."
dfu: []
tags:
  - menu-order
  - thumbnails
  - ship-portraits
  - refusal
  - aria-disabled
  - touch
---

# Model Thumbnails, Ship Portraits, and Refused Presses

Runtime offscreen studios render 3D furniture thumbnails and ship hull portraits after the main world pass, while interactive action buttons use accessible refusal states (`src/homes/decorTool.js`, `src/homes/panelPicture.js`, `src/systems/naval/shipPortraits.js`, `src/ui/brokerWindow.js`).

- **Offscreen thumbnails and ship portraits (`src/homes/decorTool.js`, `src/homes/panelPicture.js`, `src/systems/naval/shipPortraits.js`, `src/systems/naval/comeSailAwayPool.js`):** `src/homes/panelPicture.js` exports `panelPicture`, `panelPictureStudio`, `canvasBoxUnder`, `PANEL_PICTURE_LIGHT`, and `PANEL_PICTURE_AMBIENT` (`0.8`). After the world draw, `src/homes/decorTool.js` renders up to `DECOR_THUMBS_A_FRAME` (`2`) square thumbnails per frame at `DECOR_THUMB_PX` (`152` px, twice the `76` px tile) via `canvasBoxUnder`. Requests older than `DECOR_THUMB_WAIT_MS` (`20000` ms) or under another remap law (`remapLawOf`, `inLaw`) resolve `null`, keeping the kind glyph. `createShipPortraits` renders `portrait(hull)` (`src/systems/naval/comeSailAwayPool.js`) at `SHIP_PORTRAIT_W` by `SHIP_PORTRAIT_H` (`480x240`), `SHIP_PORTRAITS_A_FRAME` (`1`), and `SHIP_PORTRAIT_WAIT_MS` (`30000` ms), caching boats per hull for the session (`R8`). Because the panel bracket never restores mesh uniforms (`R2`), subsequent draws must set their own state.
- **Refused presses and portrait phone bar (`src/ui/brokerWindow.js`, `src/ui/enhancedPlusStyle.js`, `src/ui/reforgeWindow.js`, `src/ui/decorPanel.js`, `src/ui/touch.js`):** `refusePress(btn, reason, tell)` (styled by `BROKER_CSS` and shared across broker, reforge, decor, lockpick, wardrobe, and wyrd windows) sets `aria-disabled` rather than `disabled`, preserves `title`, prefixes `aria-label` with the button label, and prints `reason` on the window note line; in-flight actions use true `disabled`. On portrait phones, `.dfdecor-bar.touch` sits below the `48` px touch buttons at `top: calc(72px + safe-area-inset-top)` with `max-width: calc(100vw - 24px)`.
