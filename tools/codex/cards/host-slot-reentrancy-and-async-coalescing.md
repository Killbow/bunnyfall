---
slug: host-slot-reentrancy-and-async-coalescing
title: "Host Slot Re-entrancy and Async Coalescing"
domain: ui
kind: subcard
parent: home-port-doctrine-overview
files:
  - src/talk/townTalk.js
  - src/ui/paperDoll.js
  - src/scenes/shared.js
  - src/characters/advancement.js
replacesBible:
  - "Home.md"
related:
  - home-port-doctrine-overview
  - ui-overlays-and-localization
  - four-hosts-and-modal-frame
invariants:
  - "dropOverlay clears the active overlay slot and its close callback to null before calling dispose() on the outgoing overlay."
  - "An overlay close callback runs at most once because the reference is cleared before invocation."
  - "refreshPaperDoll coalesces concurrent calls arriving during an active render pass and runs one trailing pass instead of dropping requests."
  - "raisePlayerSkills in src/scenes/shared.js is the single canonical wrapper for PlayerEntity.RaiseSkills and delegates to raiseSkills in src/characters/advancement.js."
traps:
  - "Disposing an outgoing overlay before clearing the host slot triggers infinite close recursion when an onClose handler opens or closes another overlay."
  - "Guarding refreshPaperDoll with a boolean flag that discards in-flight callers leaves the paper doll canvas and click mask outdated."
dfu:
  - Assets/Scripts/Game/UserInterface/UserInterfaceManager.cs
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallRestWindow.cs
tags:
  - overlay
  - reentrancy
  - async
  - slot
---

# Host Slot Re-entrancy and Async Coalescing

Modal UI overlays across the scene hosts share strict lifecycle ordering so nested window transitions and asynchronous texture rebuilds cannot recurse infinitely or drop visual updates.

## Overlay Slot Teardown and `raisePlayerSkills`

In `src/talk/townTalk.js`, `dropOverlay` detaches the active overlay reference and its close callback by setting both to `null` before invoking `dispose()` on the outgoing window and firing the saved callback. Clearing the slot first guarantees that a close callback executes at most once and allows re-entrant transitions during teardown.

This ordering mirrors `DaggerfallRestWindow.cs` and `UserInterfaceManager.cs`, where `PopToHUD` runs before `RaiseSkills`. When resting finishes, the rest overlay must vacate the active slot before `raisePlayerSkills` (`src/scenes/shared.js`, calling `raiseSkills` in `src/characters/advancement.js`) opens the level-up dialog. Only `townTalk`-backed exterior hosts call `dispose()` on close (windows holding WebGL handles release them in an idempotent `dispose()`), while `worldModes` and `dungeonContext` null their slot reference.

## Async Paper Doll Coalescing

`refreshPaperDoll` (`src/ui/paperDoll.js`) renders equipment layers asynchronously. If a new refresh request arrives while a pass is already in flight, the guard records a pending flag and runs one trailing pass upon completion rather than dropping the update.
