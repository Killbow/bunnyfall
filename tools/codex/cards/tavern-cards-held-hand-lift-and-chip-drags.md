---
slug: tavern-cards-held-hand-lift-and-chip-drags
title: "Tavern Cards Held Hand Lift, Easing, and Chip Drags"
domain: ui
kind: subcard
parent: holdem-relay-seat-rules-and-reconnect-resit
files:
  - src/world/cardHand.js
  - src/scenes/worldModes.js
  - src/world/cardScene.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Cards-3.md"
related:
  - holdem-relay-seat-rules-and-reconnect-resit
  - tavern-card-tables-seating-and-physics
invariants:
  - "Held hand lifts clear of the panel via heldLift, capped at HELD_LIFT_MAX (0.08)."
  - "Cards ease cloth-to-hand with blendMatrix over HELD_EASE_S (0.25 s)."
  - "Offline deal waits for the cloth scene `settledAt()` plus CARD_CLOTH_REST_MS."
traps:
  - "cardPointerListen listens in capture phase; its unlisten belongs to the game and dies with it."
  - "Bets released over the panel or outside onTable are cancelled; carried chips excluded from the drawn stack via poses(t, view, carried)."
dfu: []
tags:
  - cards
  - held-hand
  - chips
  - pointer
---

# Tavern Cards Held Hand Lift, Easing, and Chip Drags

First-person hole card lift, cloth-to-hand matrix interpolation, and pointer-driven chip dragging coordinate across `src/world/cardHand.js`, `src/world/cardScene.js`, and `src/scenes/worldModes.js`.

- **Held-hand lift and cloth-to-hand easing (`src/world/cardHand.js`, `src/world/cardScene.js`):** Seated hole cards lift clear of the bottom HUD panel through `heldLift`, clamped at `HELD_LIFT_MAX` (`0.08`). Cards move from the table cloth into the held hand via `blendMatrix` over `HELD_EASE_S` (`0.25` s). During offline play, the next deal waits until the cloth scene reports `settledAt()` plus `CARD_CLOTH_REST_MS`.
- **Capture-phase pointer listener (`src/scenes/worldModes.js`):** `cardPointerListen` attaches in the DOM capture phase so table interactions intercept clicks before scene controls; its unlisten callback belongs to the active table game instance and tears down when that game closes. Touch peek and chip dragging run on pointer events with right-button dragging disabled.
- **Chip drags and slider defaults:** Pressing the chip stack off-turn performs chip handling rather than standing or folding. While dragging a bet, `poses(t, view, carried)` excludes `carried` chips from the rendered table stack, and releasing over the HUD panel or outside `onTable` cancels the bet. Pushing an untouched bet slider defaults to Call, or the minimum legal bet when nothing is owed to call.
