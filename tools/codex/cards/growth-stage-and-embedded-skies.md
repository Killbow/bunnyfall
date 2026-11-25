---
slug: growth-stage-and-embedded-skies
title: "Growth Stage: One Face per Visit, Full Screen, Escape, and Leave-Asks"
domain: ui
kind: subcard
parent: growth-tab-overview
files:
  - src/ui/growth/growthStage.js
  - src/ui/growth/growthTab.js
  - src/ui/firmamentWindow.js
  - src/ui/captainTreeWindow.js
  - src/ui/skyWindow.js
  - src/ui/enhancedLevelUp.js
  - src/ui/enhancedMenu.js
routes: []
tables: []
replacesBible:
  - "10-UI/Growth.md"
related:
  - growth-tab-overview
  - growth-level-page-and-bonus-pool
  - captain-tree-and-ore-refits
  - sworn-companion-gear-arts-and-stars
invariants:
  - "At most one stage face (`live` in `src/ui/growth/growthStage.js`) exists at any time: calling `drawStage` with a new key destroys the previous face, whereas calling it with the same key reparents the existing host DOM node into the redrawn pane."
  - "Async face chunks that resolve after the player leaves the stage are destroyed immediately without mounting, and a chunk load error retries once after `400` ms."
  - "Embedded faces (`embed: true`) suppress their own Close buttons, Escape listeners, and overlay registrations, and their key handlers return early when `root.isConnected` is false or `root.closest('[inert]')` matches."
traps:
  - "Escape routes through `growthBack` to `stageBack`, which runs the active face's `back()` prompt first, exits full-screen mode second, and falls through to the pause window's back stack last."
  - "Leaving a face with unaccepted star selections prompts once (`stageAsks`); a second action discards the pending picks, and if the face was detached, `stageAsks` reopens it full-screen so the confirmation banner is visible."
  - "Full-screen mode moves the stage host into `.gr-fullbox` on `document.body` and traps focus via `keepFocus`; on viewports `660` px wide or narrower, stage pages always render a full-screen launch door instead of an inline canvas."
dfu: []
tags:
  - growth
  - stage
  - firmament
  - captain-stars
  - escape
---

# Growth Stage: One Face per Visit, Full Screen, Escape, and Leave-Asks

`src/ui/growth/growthStage.js` manages the lifecycle, full-screen promotion, keyboard routing, and unsaved-star prompts for embedded canvas and rollout views inside the Growth tab (`src/ui/growth/growthTab.js`).

## Single-Face Host Reparenting

Every stage view conforms to the `{ destroy(), resize?(refit), back?() }` face contract. When `drawStage` runs on a tab redraw:

- **Matching key:** the existing host element moves into the new pane container and `fit` calls `resize` on the next `requestAnimationFrame`, preserving canvas state and unaccepted star picks.
- **Different key or `dropStage()`:** the active face is destroyed before the new face mounts. If a lazy-loaded module resolves after the stage key changes, the stale instance is destroyed on arrival; failed imports retry once after `400` ms.

## Embedded Skies and Offline Fallbacks

Stage views mount with `embed: true` (`src/ui/skyWindow.js`, `src/ui/firmamentWindow.js`, `src/ui/captainTreeWindow.js`, and `src/ui/enhancedLevelUp.js`), delegating overlay ownership to `src/ui/enhancedMenu.js`.

- **Firmament:** calls `firmamentBook()`; when null (offline play), the page renders an explanatory notice with no stage.
- **Captain's Stars:** reads `captain.stars().ledger` and calls `mountCaptainTreeWindow(host, { ledger, changed, embed: true })`.

## Full-Screen Promotion, Escape, and Leave Prompts

On viewports `660` px wide or narrower, stage pages render a launch card instead of an in-pane stage. Full screen reparents the host into `.gr-fullbox` on `document.body` with `keepFocus`. Escape runs `growthBack` -> `stageBack` (`back()` prompt, then exit full screen, then menu close), while tab switches check `stageAsks` so unaccepted stars require a second press.
