---
slug: lockpick-window-hosts-and-controls
title: "Lockpick Window, Host Wiring, Controls, and Accessibility"
domain: ui
kind: subcard
parent: lockpicking-overview
files:
  - src/systems/lockpick/lockpickHost.js
  - src/ui/lockpickDoor.js
  - src/ui/lockpickWindow.js
  - src/ui/enhancedPlusStyle.js
  - src/systems/lockpick/lockpickSounds.js
  - src/scenes/worldModes.js
  - src/scenes/dungeonContext.js
  - src/world/actionSystem.js
  - src/ui/gamepadInput.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Lockpicking.md"
related:
  - lockpicking-overview
  - lockpicking-tumbler-law-and-timing
  - four-hosts-and-modal-frame
  - world-modes-and-transitions
  - host-split-extracted-modules
invariants:
  - "`createLockpickHost` exposes `begin`, `frontDoor`, `inside`, `wire`, `busy`, and `dispose`, enforcing one lock window at a time."
  - "The overlay `done` flag reads `true` only after its DOM is removed, and `onClose` runs last, once."
  - "`onOpen` runs only when the window shut itself (`OPEN_HOLD_MS = 650` ms hold) or by player input while the player is alive."
  - "`frontDoor` tallies the crime guild break-in before the success text and unlock sound, then re-enters `activateStaticDoor` with `picked: true`."
  - "`wire()` sets `actions.onLockpickAttempt` for doors below `MAGIC_LOCK_THRESHOLD` (`20`) and opens through `actions.lockpicked`."
traps:
  - "Gentle work (pref `gentleActs`) disables pin presses and movement; only Auto attempt works."
  - "The dungeon context must call `lockpick.dispose()` on teardown so no success tail runs."
  - "`worldModes.js` must not name its host `lockpick`, which previously shadowed the skill variable."
  - "`LOCK_WORDS.autoWhy` and `.lk-auto` warn borders still state that a failed Auto roll snaps a pick, even though `auto()` never increments `broken`."
dfu:
  - PlayerActivate.cs
  - DaggerfallActionDoor.cs
tags:
  - lockpicking
  - ui
  - gamepad
  - accessibility
  - reduced-motion
---

# Lockpick Window, Host Wiring, Controls, and Accessibility

`createLockpickHost` (`src/systems/lockpick/lockpickHost.js`) bridges door activation (`ActivateStaticDoor` in `PlayerActivate.cs` and `AttemptLockpicking` in `DaggerfallActionDoor.cs`) to the modal overlay (`src/ui/lockpickDoor.js`, `src/ui/lockpickWindow.js`, `src/ui/enhancedPlusStyle.js`, and `src/systems/lockpick/lockpickSounds.js`).

## Host Wiring and Lifecycle

`createLockpickHost` returns `{ begin, frontDoor, inside, wire, busy, dispose }` and allows one window at a time. Lock keys use `front:locId:buildingKey`, `door:mapId:key`, and `inner:buildingKey:key`:

- **Static doors (`src/scenes/worldModes.js`):** Named `lockHost` to avoid shadowing the `lockpick` skill variable. `frontDoor` tallies the crime guild break-in before showing success text or playing the unlock sound, then re-enters `activateStaticDoor` with `picked: true`.
- **Dungeon doors (`src/scenes/dungeonContext.js`, `src/world/actionSystem.js`):** `wire()` binds `actions.onLockpickAttempt` below `MAGIC_LOCK_THRESHOLD` (`20`) and opens via `actions.lockpicked`. Teardown calls `lockpick.dispose()` so `OPEN_HOLD_MS` (`650` ms) timers never fire `onOpen` after teardown or death.

The overlay marks `done = true` only after DOM removal and runs `onClose` last, once.

## Controls, Gentle Work, and Reduced Motion

The `520 * 260` canvas (`LOCK_W`, `LOCK_H`) switches to a side-by-side layout under `@media (max-height: 520px)` in `LOCK_CSS`. `LOCK_KEYS` and `src/ui/gamepadInput.js` bind `Left`/`Right` or `1..n` to choose a pin, `Space`/`Up`/`W`/`Enter` or click to lift and set, `Q` or pad X (`JoystickButton2`) to Auto attempt, and `Esc` or pad B to Leave.

Enabling `gentleActs` disables pin movement and lifting so only Auto attempt works. Running out of picks marks Auto attempt `aria-disabled` (`ov.out()`), leaving only Leave. `prefers-reduced-motion` stills slip shake, open flash, and binding-pin pulse animations.
