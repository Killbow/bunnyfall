---
slug: world-modes-and-transitions
title: World Modes, Block Rotations, and Transitions
domain: world
kind: overview
files:
  - src/scenes/worldModes.js
  - src/scenes/interiorContext.js
  - src/scenes/dungeonContext.js
  - src/world/rmbLayout.js
  - src/world/rmbFlats.js
  - src/world/rdbLayout.js
  - src/world/streamWorld.js
  - src/world/transitionGate.js
invariants:
  - "Exterior RMB models compose rotations as Ry * Rx * Rz, while dungeon RDB models multiply T * Rz * Rx * Ry."
  - "Archive 199 editor flats are never rendered."
  - "Modal exits must dispose window/overlay stacks and null interiorCtx or dungeonCtx before returning to exterior."
  - "Door builds run through one gate, one at a time; `abort()` and any build that publishes bump the generation, so queued requests asked in the old world return null instead of building over the live context."
traps:
  - "Center-anchored billboards (such as spell missiles and hit splashes) must pass through centredBase to subtract half height from AlignToBase."
  - "The court release calls `forceExitToExterior` before `_teleportToPixel`: an arrest for stealing runs the world host's court flow with `modes.mode` still 'interior', and teleporting first lands the player outside the building geometry."
dfu:
  - Assets/Scripts/Game/PlayerEnterExit.cs
  - Assets/Scripts/Utility/RMBLayout.cs
  - Assets/Scripts/Utility/RDBLayout.cs
tags:
  - transitions
  - rmb
  - rdb
  - billboards
  - interiors
  - dungeons
---

# World Modes, Block Rotations, and Transitions

`createWorldModes` (`src/scenes/worldModes.js`) transitions between `'exterior'`, `'interior'` (`buildInteriorContext` in `src/scenes/interiorContext.js`), and `'dungeon'` (`buildDungeonContext` in `src/scenes/dungeonContext.js`) while keeping the streamed exterior paused underneath. Dungeons apply per-dungeon texture tables via draw-time `texRemap` so shared exterior mesh caches stay unmodified.

- **RMB vs RDB rotation order:** Exterior RMB models (`src/world/rmbLayout.js`) compose `trs` rotations as `Ry * Rx * Rz`, whereas dungeon RDB models (`src/world/rdbLayout.js`) multiply `T * Rz * Rx * Ry`. Mixing the two misaligns dungeon corridors and doors.
- **Base vs center flats:** `Renderer` bottom-anchors every billboard batch (`AlignToBase`), lifting sprites by half height. Center-anchored effects such as spell missiles and hit splashes must pass through `centredBase` (`src/world/rmbFlats.js`) to subtract `h / 2`.
- **Archive `199` editor flats:** Skipped on RMB building subrecords, kept as non-rendered marker/action records (`editor: true`) on RMB misc and RDB blocks, and never drawn.
- **Teardown discipline:** Exits must cache scene state, reconcile and dispose window/overlay stacks (`interiorWindows`, `interiorOverlay`, `destroyWorldPlaque`), and null `interiorCtx` or `dungeonCtx` before returning to `'exterior'`.
