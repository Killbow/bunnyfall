---
slug: "shared-quest-relink-and-slope-foot-rest-overview"
title: "Shared-Quest Relink, Weapon-Hit Dispatch, and Slope Foot Rest"
domain: "systems"
kind: "overview"
parent: null
files:
  - "src/systems/quest/resourceBehaviour.js"
  - "src/systems/quest/machine.js"
  - "src/world/worldTick.js"
  - "src/scenes/worldModes.js"
  - "src/player/motor.js"
  - "src/player/collider.js"
  - "src/ui/automapSheet.js"
  - "src/ui/useMagicItemWindow.js"
  - "src/characters/biography.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-09-23.md"
related:
  - "indoor-rain-gain-hrtf-and-peer-clop"
  - "handheld-torch-silence-and-caster-keep-ratio"
  - "social-plaque-sight-ray-and-hand-door"
  - "audio-arc-overview"
  - "enhanced-lighting-shadow-maps-and-casters"
invariants:
  - "A shared-quest resync (machine.updateSharedQuest) is followed by ResourceBehaviour relinking: sceneMount isAlreadyInjected matches a standing behavior by quest UID and resource symbol, and cacheTarget re-reads the target."
  - "worldTick.playerWeaponHitEntity is the one OnWeaponHitEntity dispatcher. It runs after the health subtraction for melee, guards and arrows (DISC10-D H1)."
  - "PlayerMotor.holdFrame() clears landedFallDistance on held frames, so a landing reported before a warp is never charged twice (DISC8-G)."
  - "collider.restFloor rests capsule feet at r(1/cos(grade) - 1) over the ground on slopes (DISC16-A)."
traps:
  - "Quickslot or weapon state carried across a building door must pass through `weaponPose` and `applyWeaponPose` in `createWorldModes`, or the interior rig loses the drawn weapon."
  - "Selecting Yes on the dungeon wagon prompt sets `pendingDungeonWagonOpen` and opens inventory a frame later once the prompt closes."
dfu: []
tags:
  - "quests"
  - "motor"
  - "automap"
  - "chargen"
---

# Shared-Quest Relink, Weapon-Hit Dispatch, and Slope Foot Rest

In `src/systems/quest/machine.js` and `src/systems/quest/resourceBehaviour.js`, a shared-quest resync (`machine.updateSharedQuest`) triggers `ResourceBehaviour` relinking: `sceneMount` `isAlreadyInjected` matches a standing behavior by quest UID and resource symbol, and `cacheTarget` re-reads the target. In `src/world/worldTick.js`, `playerWeaponHitEntity` is the single `OnWeaponHitEntity` dispatcher, running after health subtraction for melee, guards, and arrows.

In `src/player/motor.js`, `PlayerMotor.holdFrame()` clears `landedFallDistance` on held frames so a landing reported before a warp is never charged twice. In `src/player/collider.js`, `restFloor` rests capsule feet at `r(1/cos(grade) - 1)` above the ground on slopes.

In `src/scenes/worldModes.js`, quickslot or weapon state carried across a building door passes through `weaponPose` and `applyWeaponPose` in `createWorldModes` so the interior rig keeps the drawn weapon. Selecting Yes on the dungeon wagon prompt sets `pendingDungeonWagonOpen` and opens inventory one frame later, while the dungeon host forwards `revealLocation` from the outer host so looted maps reveal their destination.

In `src/ui/automapSheet.js`, `toPlan` measures dungeon plan `y` south from the north edge. `src/ui/useMagicItemWindow.js` closes on armed `U` release or Escape without consuming an item, `src/characters/biography.js` mints starting weapons via `createWeapon` and `mintCondition`, and `enhancedChargen.js` `nameStage` steps back through the wizard.
