---
slug: "controls-helm-saddle-pad-and-touch"
title: "Helm Keys, Saddle Panel, Pad Interact, Touch Slot, and Shift-Stow"
domain: "ui"
kind: "subcard"
parent: "controls-keybinding-registry-overview"
files:
  - "src/ui/inputActions.js"
  - "src/systems/naval/comeSailAway.js"
  - "src/ui/enhancedHelm.js"
  - "src/ui/enhancedSaddle.js"
  - "src/ui/hudLayout.js"
  - "src/ui/hudPlacer.js"
  - "src/travel/saddleHost.js"
  - "src/travel/horseCart.js"
  - "src/player/mwView.js"
  - "src/ui/plusPad.js"
  - "src/ui/gamepadInput.js"
  - "src/ui/touchButtons.js"
  - "src/ui/enhancedInventory.js"
  - "src/homes/decorTool.js"
  - "src/scenes/world.js"
routes: []
tables: []
replacesBible:
  - "10-UI/Controls.md"
related:
  - "controls-keybinding-registry-overview"
  - "come-sail-away-helm-and-sail-handling"
  - "horse-coats-3d-courser-and-saddle"
invariants:
  - "Come Sail Away defaults: Quote BoatDisembark, Semicolon BoatToggleLight, End BoatToggleSail, BracketRight/BracketLeft/Backslash trims, NumpadMultiply/NumpadSubtract/NumpadEnter time scale up/down/reset."
  - "HELM_RUDDER_ACTIONS = { MoveLeft: 'TurnLeft', MoveRight: 'TurnRight' }: at a helm the arrows steer the rudder and the view does not turn."
  - "W/Up step ladderUp and S/Down step ladderDown in src/systems/naval/comeSailAway.js; IRONS_TELL_DEG = 40, IRONS_TELL_WAY = 0.4."
  - "SADDLE_PANEL_MODES = ['auto', 'always', 'off'] (When needed default); F2 = SaddlePanel toggles it."
traps:
  - "Slash, Minus and Equal are DECOR_FREE_KEYS (decorator grid); never ship a world default there."
  - "Helm and saddle panels are HUD pieces '.helmpanel .helmpanel-bar' and '.saddlepanel .saddlepanel-bar' (buildHelmPreview, buildSaddlePreview); they move only in the Enhanced Plus HUD editor (Alt+U)."
dfu: []
tags:
  - "helm"
  - "saddle"
  - "gamepad"
  - "touch"
  - "inventory"
---

# Helm Keys, Saddle Panel, Pad Interact, Touch Slot, and Shift-Stow

Vehicle HUD bars, gamepad layouts, touch slots, and inventory shortcuts connect specialized world controls to the central input registry.

- **Helm Keys and Rudder Remap:** Come Sail Away binds `Quote` to `BoatDisembark`, `Semicolon` to `BoatToggleLight`, `End` to `BoatToggleSail`, `BracketRight`, `BracketLeft`, and `Backslash` to sail trims, and `NumpadMultiply`, `NumpadSubtract`, and `NumpadEnter` to time scale up, down, and reset (`src/ui/inputActions.js`). In `src/systems/naval/comeSailAway.js`, `W/Up` and `S/Down` step `ladderUp` and `ladderDown` with `IRONS_TELL_DEG = 40` and `IRONS_TELL_WAY = 0.4`, while `HELM_RUDDER_ACTIONS` (`{ MoveLeft: 'TurnLeft', MoveRight: 'TurnRight' }`) steers the rudder with arrow keys without turning the camera. `Slash`, `Minus`, and `Equal` remain reserved in `DECOR_FREE_KEYS` (`src/homes/decorTool.js`).
- **Saddle and Helm HUD Bars:** `SADDLE_PANEL_MODES` (`['auto', 'always', 'off']`, defaulting to `'auto'`) toggles via `F2` (`SaddlePanel` in `src/ui/enhancedSaddle.js`, `src/travel/saddleHost.js`) and invokes `openWagonCargo` (`src/travel/horseCart.js`) and `mwViewCanTogglePerspective` (`src/player/mwView.js`). Both `.helmpanel .helmpanel-bar` (`src/ui/enhancedHelm.js`) and `.saddlepanel .saddlepanel-bar` register `buildHelmPreview` and `buildSaddlePreview` in `src/ui/hudLayout.js` and `src/ui/hudPlacer.js`, repositioning only inside the `Alt+U` HUD editor.
- **Gamepad, Touch, and Shift-Stow:** `Interact` binds to `JoystickButton1` in the classic secondary table (`src/ui/gamepadInput.js`) and `JoystickAxis9Button0` (LT) in `src/ui/plusPad.js` (`PLUS_PAD_LAYOUT_VERSION = 2`). `TOUCH_BUTTON_DEFAULTS.touchButton3 = 'Interact'` in `src/ui/touchButtons.js` extends the touch corner to `16..344` px, and Shift-clicking a pack item in `src/ui/enhancedInventory.js` stows the stack into the adjacent store.
