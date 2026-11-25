---
slug: ui-arc-input-dispatch-and-key-edges
title: "One Dispatch: routeKey, routeAction, and Buffered Key Edges"
domain: ui
kind: subcard
parent: ui-arc-overview
files:
  - src/ui/input.js
  - src/ui/inputActions.js
  - src/ui/controlsConfig.js
  - src/ui/hudLarge.js
  - src/player/pointerLock.js
  - src/ui/touchDevice.js
  - src/scenes/world.js
  - src/scenes/exterior.js
  - src/scenes/dungeon.js
routes: []
tables: []
replacesBible:
  - "10-UI/UI-Arc.md"
related:
  - ui-arc-overview
  - four-hosts-and-modal-frame
  - ui-arc-quickslot-diamond
invariants:
  - "routeKey and routeAction (src/ui/input.js) unify keyboard input and HUDLarge clicks (routeLargeHudClick in src/ui/hudLarge.js) through src/ui/inputActions.js."
  - "beginInputFrame rotates key edges once per frame at the head of world.js, exterior.js, and dungeon.js; worldModes.js reads the shared ring without rotating."
  - "BROWSER_STEALS (F1, F3, F5, F6, F11) is checked first by every host keydown handler."
  - "routeKey declines POLLED_ACTIONS (ReadyWeapon, SwitchHand, QuickUse1, QuickUse2, QuickSpell) so polled actions do not double-fire."
traps:
  - "Deriving edges from held state loses sub-frame taps at low FPS; use keyEdges/noteKeyDown/noteKeyUp/pressed/released."
  - "Multi-binding dispatch must stop iterating shared-key actions once a window opens, or one keypress stacks windows."
  - "Capture-phase Enter cursor toggle must ignore text entry targets (isTextEntryTarget)."
dfu:
  - Assets/Scripts/Game/InputManager.cs
tags:
  - input
  - keybinds
  - dispatch
  - gamepad
  - touch
---

# One Dispatch: routeKey, routeAction, and Buffered Key Edges

Keyboard events, large-HUD clicks, and touch controls funnel through a unified action dispatcher backed by per-frame buffered key edges.

- **Unified Action Routing:** `routeKey` and `routeAction` in `src/ui/input.js` share action resolution with `routeLargeHudClick` in `src/ui/hudLarge.js` via `DEFAULT_SECONDARY_BINDINGS`, `addRemovedSecondaryAction`, `shareBinding`, `actionsForCode`, `actionForCode`, `codeForAction`, and `onSavedKeyBinds` in `src/ui/inputActions.js`. `routeKey` skips `POLLED_ACTIONS` (`ReadyWeapon`, `SwitchHand`, `QuickUse1`, `QuickUse2`, and `QuickSpell`) so frame-polled actions never fire twice.
- **Buffered Key Edges and Modifiers:** Host keydown handlers check `BROWSER_STEALS` (`F1`, `F3`, `F5`, `F6`, and `F11`) first and record transitions through `keyEdges`, `noteKeyDown`, `noteKeyUp`, `pressed`, and `released`. `beginInputFrame` rotates the edge ring once per frame in `src/scenes/world.js`, `src/scenes/exterior.js`, and `src/scenes/dungeon.js`. `modifierOnlyHeld`, `pollModifier`, `pollLatch`, and `heldModifier` in `src/ui/input.js` manage the held-first modifier latch.
- **Touch and Pointer Lock Guards:** `isTouchDevice` in `src/ui/touchDevice.js` requires `(pointer: coarse)` and `(hover: none)` unless overridden by `?touch=on` or `?touch=off`. `src/player/pointerLock.js` enforces `TOUCH_UNLOCK_MS = 500`, `RELOCK_GRACE_MS = 150`, and `isTextEntryTarget` filtering.
