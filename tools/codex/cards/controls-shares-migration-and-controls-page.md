---
slug: "controls-shares-migration-and-controls-page"
title: "Key Shares, Saved-File Migration (v3), and the Enhanced Controls Page"
domain: "ui"
kind: "subcard"
parent: "controls-keybinding-registry-overview"
files:
  - "src/ui/inputActions.js"
  - "src/ui/controlsConfig.js"
  - "src/ui/enhancedControls.js"
  - "src/ui/notify.js"
  - "src/ui/input.js"
  - "src/main.js"
routes: []
tables: []
replacesBible:
  - "10-UI/Controls.md"
related:
  - "controls-keybinding-registry-overview"
  - "ui-arc-input-dispatch-and-key-edges"
invariants:
  - "KEYBINDS_VERSION = 3; loadOrCreateBindings reads data.version (missing = 1) and runs migrateKeyBinds(store, from)."
  - "migrateKeyBinds order is law: 1) LET_GO frees E/AbortSpell, Backquote/ToggleConsole, ControlLeft/Slide (below v2) and AltLeft/Sneak (below v3), and strips any key from HIDDEN_ACTIONS; 2) resetDefaults(store, true) autofills free codes; 3) v1-only mod legacy keys land only on codes still free."
  - "migrateKeyBinds returns { moved, kept, lost }; main.js routes keybindCarryNotes(report) lines to notify.hudTextWhenShown for 12 s."
  - "One owner per key by default; shareBinding adds a player-chosen second action ('Use for both', SHARE_KEY_LABEL); the replace prompt reads '<key> is used by <who>. Give it to <action> instead?'."
traps:
  - "Carrying mod legacy keys before the autofill let saved values steal E/G from the new defaults (AUDIT KB1 F1-F3)."
  - "The Enhanced Controls page stages edits; nothing saves until Confirm, and leaving discards. Rows show UNSAVED_ROW 'Not saved yet. Press Confirm.' with an unsavedEdits count."
dfu:
  - "Assets/Scripts/Game/LevitateMotor.cs"
tags:
  - "keybinds"
  - "migration"
  - "shares"
  - "controls-page"
---

# Key Shares, Saved-File Migration (v3), and the Enhanced Controls Page

Saved keybindings migrate through `KEYBINDS_VERSION = 3` in strict three-step order while supporting shared key slots and staged edits in the Enhanced Controls page.

- **Version 3 Migration Order:** `loadOrCreateBindings` in `src/ui/controlsConfig.js` checks `data.version` (defaulting missing values to `1`) and runs `migrateKeyBinds(store, from)` in `src/ui/inputActions.js`. First, `LET_GO` releases `E/AbortSpell`, `Backquote/ToggleConsole`, and `ControlLeft/Slide` below v2, releases `AltLeft/Sneak` below v3, and strips all codes from `HIDDEN_ACTIONS`. Second, `resetDefaults(store, true)` autofills free key codes with current defaults so legacy mod bindings cannot steal `E` or `G`. Third, v1 legacy mod keys claim only codes that remain free. `src/main.js` passes `keybindCarryNotes(report)` from `{ moved, kept, lost }` to `notify.hudTextWhenShown` (`src/ui/notify.js`) for 12 seconds.
- **Default and Player Key Shares:** `DEFAULT_SHARES` pairs `ArrowUp` (`BoatSailUp` beside `ActChoice`), `ArrowDown` (`Professions` beside `BoatSailDown`), and `KeyK` (`Spyglass` beside `FollowPaths`) only while the primary key owner still matches its default partner. When a conflict occurs, the prompt asks `<key> is used by <who>. Give it to <action> instead?` or lets `shareBinding` attach a second action via `SHARE_KEY_LABEL` (`'Use for both'`).
- **Staged Enhanced Controls Page:** `src/ui/enhancedControls.js` stages edits until Confirm, displays `UNSAVED_ROW` (`'Not saved yet. Press Confirm.'`) with `unsavedEdits`, clears bindings on right-click or row `X`, and surfaces `floatHint` and `sharedFloatNote` (`LevitateMotor.cs:86-89`).
