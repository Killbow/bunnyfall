---
slug: "controls-keybinding-registry-overview"
title: "Controls: One Keybinding Registry, Mod Gates, and Window Keys"
domain: "ui"
kind: "overview"
parent: null
files:
  - "src/ui/inputActions.js"
  - "src/ui/input.js"
  - "src/ui/controlsConfig.js"
  - "src/ui/controlsWindow.js"
  - "src/ui/mouseControlsWindow.js"
  - "src/ui/enhancedControls.js"
  - "src/ui/dialogShortcuts.js"
  - "src/mods/modSettings.js"
  - "src/player/motor.js"
  - "src/ui/modeWheel.js"
  - "src/player/pointerLock.js"
  - "src/ui/chatPanel.js"
  - "src/ui/screenshot.js"
  - "src/ui/shotGallery.js"
routes: []
tables: []
replacesBible:
  - "10-UI/Controls.md"
related:
  - "controls-shares-migration-and-controls-page"
  - "controls-helm-saddle-pad-and-touch"
  - "ui-arc-input-dispatch-and-key-edges"
  - "come-sail-away-helm-and-sail-handling"
invariants:
  - "Every world, mod, and port action lives in one registry, src/ui/inputActions.js (ACTIONS, DEFAULT_BINDINGS, ACTION_GROUPS, MOD_ACTIONS, HIDDEN_ACTIONS)."
  - "actionLive is the single gate: a game action always answers; a mod action answers only while modLatchedOn(vendor) ?? modSetting(vendor, 'Enabled') is true, and its key stays bound."
  - "Window keys (Escape, Enter, map arrows and +/-, message-box Y/N, DaggerfallShortcut letters via src/ui/dialogShortcuts.js) answer only while their window is top and are not in ACTION_GROUPS."
  - "HIDDEN_ACTIONS = ['ToggleConsole', 'Slide']: kept in ACTIONS for positional saves, shipped unbound, not drawn."
traps:
  - "Never test a literal e.code in a host for a world action; bind an action so the Controls pane can move it."
  - "Mods latched at mount (Come Sail Away, Travel Options) keep their keys until next load even when switched off mid-game."
dfu:
  - "Assets/Scripts/Game/PlayerMouseLook.cs"
  - "Assets/Scripts/Game/InputManager.cs"
tags:
  - "controls"
  - "keybinds"
  - "input"
  - "mods"
  - "kb1"
---

# Controls: One Keybinding Registry, Mod Gates, and Window Keys

World, mod, and port actions share a single keybinding registry in `src/ui/inputActions.js` while dialog shortcuts stay local to active top windows.

- **Unified Registry and Mod Gate:** `ACTIONS`, `DEFAULT_BINDINGS`, `ACTION_GROUPS`, `MOD_ACTIONS`, and `HIDDEN_ACTIONS` (`['ToggleConsole', 'Slide']`, retained for positional saves and shipped unbound) live in `src/ui/inputActions.js`. `actionLive` gates dispatch: core game actions always respond, whereas mod actions respond only while `modLatchedOn(vendor) ?? modSetting(vendor, 'Enabled')` in `src/mods/modSettings.js` is true, keeping their bindings intact when disabled.
- **Core World Defaults:** `E` binds `Interact`, `Backquote` binds `AbortSpell`, and `C` binds `Crouch` (handling stealth in `src/player/motor.js` while `Sneak` ships unbound). `Left Alt` binds `ModeWheel` (`src/ui/modeWheel.js`) for Talk, Grab, Steal, and Info, leaving `F1-F4` mode keys unbound. `Digit1-4` bind `QuickUse1`, `QuickUse2`, `QuickSpell`, and `QuickOffHand`; `Digit5-0` bind `Hotbar5-Hotbar10` (`HOTBAR_SLOT_ACTIONS`), and `hotbarInForce` selects between the quickslot diamond and the hotbar. `Home` binds `CenterView`, `F8` binds `PrintScreen` (`src/ui/screenshot.js`, `src/ui/shotGallery.js`), `Comma` binds `HorseMount`, and `Period` binds `HorseSummon`.
- **Cursor and Window Keys:** `Enter` binds `ActivateCursor` (`PlayerMouseLook.cs:190` offline, or claimed online via `claimCursorKey` in `src/ui/chatPanel.js`), and `Y` binds `FreeMouse` (`src/player/pointerLock.js`). Modal window keys (`Escape`, `Enter`, map arrows, `+/-`, `Y/N`, and `DaggerfallShortcut` letters in `src/ui/dialogShortcuts.js`) stay outside `ACTION_GROUPS`.
