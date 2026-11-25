---
slug: collections-account-read-and-wear-flow
title: "Collections Account Read, Filters, and Wear Presses"
domain: ui
kind: subcard
parent: collections-page-and-parts
files:
  - src/ui/collections/wardrobePart.js
  - src/ui/accountFlow.js
  - src/ui/enhancedMenu.js
  - src/net/accountClient.js
  - server-account/src/routes/accountRoutes.js
  - server-account/src/routes/worldRoutes.js
  - server-account/src/arena.js
routes:
  - /v1/account
  - /v1/account/title
  - /v1/account/aura
  - /v1/account/icon
  - /v1/account/glyph
tables:
  - players
replacesBible:
  - "10-UI/Collections.md"
  - "01-Overview/audits/Audit-Collections-II.md"
related:
  - collections-page-and-parts
  - collections-wardrobe-catalogue-and-availability
  - identity-tokens-and-relay-seam
  - account-titles-glyphs-and-play-clock
invariants:
  - "`wardrobeAccount` builds the visit's flow once through `kit.account` (`newAccountFlow` in enhancedMenu.js) and starts its read on a microtask after the draw, never during it."
  - "`disarmCollectionsPage` leaves the account read alone; only `resetCollectionsPage` (via `resetWardrobePart`) drops it."
  - "`rereadCollectionsAccount` re-reads at once when idle, or once the in-flight press is answered when busy."
  - "Wear buttons use `aria-disabled` and a `busy` class rather than `disabled`, and `onclick` returns early while `flow.busy`."
traps:
  - "With no wardrobe read, the Held and Not held filters are hidden and fall back to All, and group counts show a dash."
  - "`wardrobeOfFlow` yields a wardrobe only when `flow.stage === 'in'`; a read failure shows a 'Try again' button focused as `coll-retry`."
  - "`ARENA_HONOUR_PATHS` (`server-account/src/arena.js`) includes `/v1/account/glyph` and `/v1/account/icon` so wear responses retain champion titles and laurels."
dfu: []
tags:
  - collections
  - account
  - async
  - focus
  - wardrobe
  - filters
---

# Collections Account Read, Filters, and Wear Presses

`src/ui/collections/wardrobePart.js` coordinates asynchronous wardrobe reads and equip presses with `src/ui/accountFlow.js`, `src/ui/enhancedMenu.js`, and `src/net/accountClient.js` across `server-account/src/routes/accountRoutes.js` and `server-account/src/routes/worldRoutes.js` (`players`).

- **Microtask Read and Lifecycle**: `wardrobeAccount` initializes the visit flow once via `kit.account` (`newAccountFlow` in `src/ui/enhancedMenu.js`) and schedules `/v1/account` (a session-authenticated replica read) on a microtask after drawing so rendering never triggers a synchronous network fetch. `disarmCollectionsPage` preserves the active flow across tab switches, whereas `resetCollectionsPage` (calling `resetWardrobePart`) clears it. `rereadCollectionsAccount` fetches immediately when idle or queues a refresh after an in-flight press resolves.
- **Stage and Retry Focus**: `wardrobeOfFlow` exposes wardrobe holdings only when `flow.stage === 'in'`. If the read fails, the panel renders a `'Try again'` action focused under the id `coll-retry`.
- **Filters and Row Jump**: `WARDROBE_FILTERS` provides `all`, `held`, `missing` (`'Not held'`), and `now` (`'Obtainable'`). When no wardrobe is loaded, `held` and `missing` hide and fall back to `all`, while group headers show a dash. Calling `openWardrobeRow` resets any non-All filter back to `all` before focusing the target entry.
- **Wear Presses**: Clicking a wear control dispatches primary-write mutations (`/v1/account/title`, `/v1/account/aura`, `/v1/account/icon`, and `/v1/account/glyph`) through AccountFlow methods including `wearAura`, `wearIcon`, and `toggleGlyph` (`via` entries omit wear controls). While `flow.busy` is true, buttons keep focus stability by setting `aria-disabled` and the `busy` CSS class instead of the native `disabled` attribute, and `onclick` handlers return early.
