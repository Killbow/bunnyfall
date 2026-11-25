---
slug: ui-overlays-and-localization
title: UI Overlays, Scrollbars, and Localization
domain: ui
kind: overview
files:
  - src/ui/uiSkin.js
  - src/ui/nativePanel.js
  - src/ui/windowStack.js
  - src/ui/verticalScrollBar.js
  - src/ui/textManager.js
  - src/ui/enhancedOverlays.js
  - src/ui/paperDoll.js
  - tools/l10nExtract.mjs
  - locales/en/Port_Strings.csv
dfu:
  - Assets/Scripts/Game/UserInterface/UserInterfaceManager.cs
  - Assets/Scripts/Game/UserInterface/VerticalScrollBar.cs
  - Assets/Scripts/Game/TextManager.cs
related:
  - four-hosts-and-modal-frame
invariants:
  - Clear active overlay slots (`slot = null`) before calling `dispose()` on a `makeWindowStack` overlay so synchronous `onClose` callbacks cannot re-enter `dispose()`.
  - Route all player-facing UI strings through `t(key, fallback)` (`src/ui/textManager.js`) with dotted keys and ICU plurals, and keep `locales/en/Port_Strings.csv` synced via `tools/l10nExtract.mjs`.
traps:
  - URL `?skin=classic|enhanced` overrides apply per page load through `uiSkin` (`src/ui/uiSkin.js`) without mutating persisted `uiPrefs`.
  - "`VerticalScrollBar` (`src/ui/verticalScrollBar.js`) clamps `THUMB_MIN_H` to `10` pixels and scales drags by `barH / totalUnits`; changing either breaks classic panel scroll feel."
tags:
  - ui
  - overlays
  - scrollbars
  - localization
  - skins
---

# UI Overlays, Scrollbars, and Localization

Bunnyfall pairs classic `320x200` canvas panels with DOM-based Enhanced overlays and an AST-extracted localization catalog.

- **Classic `320x200` vs. Enhanced UI:** `isEnhanced` (`src/ui/uiSkin.js`) switches between integer-scaled `320x200` virtual canvas panels (`NATIVE_W`, `NATIVE_H` in `src/ui/nativePanel.js`) and DOM overlays (`src/ui/enhancedOverlays.js`). URL overrides (`?skin=classic|enhanced`) apply per page load without mutating `uiPrefs`.
- **Nulling overlay slots before `dispose()`:** Hosts mirror `makeWindowStack` (`src/ui/windowStack.js`) in an active overlay slot. Clear the host slot (`slot = null`) before calling `dispose()`, or synchronous `onClose` callbacks will re-enter `dispose()` in a loop.
- **Coalesced refreshes and input widgets:** Async rebuilds such as `src/ui/paperDoll.js` (`_refreshing`, `_pending`, `paperDollStale`) coalesce concurrent requests to prevent render-loop churn. Classic panels detect double-clicks within `0.3` seconds (`DOUBLE_CLICK_TIME`) and share `VerticalScrollBar` (`src/ui/verticalScrollBar.js`), keeping `THUMB_MIN_H = 10` and `barH / totalUnits` drag scaling.
- **Localization:** Route UI strings through `t(key, fallback)` (`src/ui/textManager.js`) with dotted keys and ICU MessageFormat plurals, then run `node tools/l10nExtract.mjs` to update `locales/en/Port_Strings.csv`.
