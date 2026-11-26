---
slug: "player-arc-activation-doors-and-transitions"
title: "Activation Rays, Action Doors and Locks, and Enter/Exit Landings"
domain: "world"
kind: "subcard"
parent: "player-arc-overview"
files:
  - "src/player/activate.js"
  - "src/world/actionSystem.js"
  - "src/world/rdbLayout.js"
  - "src/scenes/shared.js"
  - "src/player/enterExit.js"
  - "src/scenes/interiorContext.js"
  - "src/scenes/dungeonContext.js"
  - "src/scenes/worldModes.js"
  - "src/scenes/world.js"
  - "src/world/doorsToNowhere.js"
routes: []
tables: []
replacesBible:
  - "03-World/Player-Arc.md"
related:
  - "player-arc-overview"
  - "world-modes-and-transitions"
  - "scene-router-and-boot-doors"
  - "lockpicking-overview"
invariants:
  - "Activation casts out to RAY_DISTANCE = 3072 * GLOBAL_SCALE (76.8) and each target has a reach of DEFAULT_ACTIVATION_DISTANCE = 128 * GLOBAL_SCALE (3.2). objectAabb(o) and activationTargets are the single source of live posed boxes for every ray reader (F37/F43)."
  - "Collision triggers fire only when hasActionCollision passes (COLLISION_TRIGGER_FLAGS: Collision01, Collision03, MultiTrigger, Collision09)."
  - "Doors swing over DOOR_OPEN_DURATION = 1.5 s. Move actions tween linearly over record.duration / 20."
  - "A lock value >= 20 is magically held and can never be picked or bashed."
  - "`sharedRecord` strips `failedSkillLevel` from every action change sent to the room, and `validActionRecord` drops it on receipt; only the save keeps the lockpick latch."
  - "Action save records never carry `activationCount`, so every counter restarts at 0 after a load, as in DFU."
  - "A remote action record (`restoreSaveData` with `remote`) lands a lock only up to `lockCeiling(o)`; a higher lock comes from a Lock spell and stays with its caster."
traps:
  - "An armed Lock beats an armed Open on action doors (doorSpellFor), but exteriorOpenSpellFor stays Open-only (F41)."
  - "The Castle Daggerfall hack applies only to isActionDoorObject (non-special action doors) (F44/F45)."
  - "Door plaque text passes DOOR_TEXT_HUD_DELAY_S = 2.0 to hudText. The default HUD_TEXT_POP_DELAY is 1.0."
  - "The Teleport relay calls `onTeleportPortal` before the warp with both endpoints from the static layout index, so the automap's portal key stays stable across saves."
  - "`DOOR_FLOOR_REACH` (10) matches the default `maxDist` of `standsOnFloor` in `src/player/enterExit.js`; change both together."
dfu:
  - "Assets/Scripts/Game/PlayerActivate.cs"
  - "Assets/Scripts/Internal/DaggerfallActionDoor.cs"
  - "Assets/Scripts/Internal/DaggerfallActionDoorSpecial.cs"
  - "Assets/Scripts/Game/PlayerEnterExit.cs"
tags:
  - "activation"
  - "doors"
  - "locks"
  - "actions"
  - "transitions"
  - "ladders"
---

# Activation Rays, Action Doors and Locks, and Enter/Exit Landings

Ray activation, dungeon action records, door locks, and transition landings coordinate across `src/player/activate.js`, `src/world/actionSystem.js`, `src/world/rdbLayout.js`, `src/player/enterExit.js`, `src/scenes/shared.js`, `src/scenes/interiorContext.js`, `src/scenes/dungeonContext.js`, `src/scenes/worldModes.js`, and `src/scenes/world.js`.

- **Activation rays and posed boxes:** `src/player/activate.js` casts out to `RAY_DISTANCE = 3072 * GLOBAL_SCALE` (`76.8`) with target reach `DEFAULT_ACTIVATION_DISTANCE = 128 * GLOBAL_SCALE` (`3.2`). `objectAabb(o)` and `activationTargets` supply the single live posed bounding-box source for all ray readers. Door plaque text passes `DOOR_TEXT_HUD_DELAY_S = 2.0` to `hudText` (`HUD_TEXT_POP_DELAY = 1.0` default).
- **Action records, doors, and locks:** Touch triggers require `hasActionCollision` (`COLLISION_TRIGGER_FLAGS`: `Collision01`, `Collision03`, `MultiTrigger`, and `Collision09`) within `TRIGGER_SKIN_WIDTH = 0.08`. Doors swing over `DOOR_OPEN_DURATION = 1.5` s, move actions tween over `record.duration / 20`, and locks (`LOCK_VALUES`) at or above `20` are magically held. Action codes include `LockDoor` (`0x10`, lock `16`), `UnlockDoor` (`0x11`, lock `0`), `OpenDoor` (`0x12`), `CloseDoor` (`0x14`, restoring `StartingLockValue`), and no-op `Activate` (`0x1e`). Armed Lock overrides Open in `doorSpellFor`, whereas `exteriorOpenSpellFor` stays Open-only, and the Castle Daggerfall override applies only to `isActionDoorObject`.
- **Enter/exit landings and classic start:** `src/player/enterExit.js` sets `ENTER_DOOR_OFFSET = 0.75`, `EXIT_DOOR_OFFSET = 1.05`, `MARKER_UP_OFFSET = 1.08`, and `DUNGEON_EXIT_OFFSET = 0.45`, alongside `dungeonEntranceLanding`, `climbLadder`, `floorLanding`, `repositionFeetY`, and `openGroundNear` (`OPEN_GROUND_RINGS` `0..256` m in `OPEN_GROUND_STEP = 8` steps, skipping `heldInSolid`). Classic start reads `StartCellX`/`StartCellY` (`109`/`158`) and calls `startInDungeon` and `tryEnterDungeon`.
