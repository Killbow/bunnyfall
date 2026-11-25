---
slug: "player-arc-motor-speeds-crouch-swim-and-breath"
title: "Motor Speeds, Crouch, Swimming, Breath, Climbing, and Stealth"
domain: "world"
kind: "subcard"
parent: "player-arc-overview"
files:
  - "src/player/motor.js"
  - "src/player/climbing.js"
  - "src/player/exteriorSurface.js"
  - "src/underwater/breath.js"
  - "src/characters/skills.js"
  - "src/characters/statMods.js"
  - "src/characters/enemyMotor.js"
routes: []
tables: []
replacesBible:
  - "03-World/Player-Arc.md"
related:
  - "player-arc-overview"
  - "deep-waters-swim-driver-and-forge"
  - "water-exhaustion-drain-and-net-fatigue"
  - "parkour-enhanced-climbing-overview"
invariants:
  - "Walk = (LiveSpeed + 150) / 39.5. Run = undragged base * (1.35 + Running / 200). Sneak = speed / 2 - 1 / CLASSIC_TO_UNITY_RATIO."
  - "Crouch uses CROUCH_HEIGHT = 0.9 and CROUCH_EYE_HEIGHT = 0.8, and the height change runs over HEIGHT_TIMER_FAST = 0.10 s."
  - "Climbing chance is clamped to 5..95. Climb speed = baseSpeed / 3, doubled when enhanced."
  - "Minute fatigue drains scale by FATIGUE_DRAIN_SCALE = 0.75 (src/characters/statMods.js). Standing still on the ground pays no drain (FATIGUE-IDLE)."
traps:
  - "isSneaking must also latch while crouched, otherwise crouched movement fails the stealth half-speed check (IsMovingLessThanHalfSpeed)."
  - "Mid-air control is off except under the Jump spell (isEnhancedJumping in src/characters/skills.js)."
dfu:
  - "Assets/Scripts/Game/Player/PlayerSpeedChanger.cs"
  - "Assets/Scripts/Game/Player/AcrobatMotor.cs"
  - "Assets/Scripts/Game/Player/PlayerHeightChanger.cs"
  - "Assets/Scripts/Game/LevitateMotor.cs"
  - "Assets/Scripts/Game/Player/ClimbingMotor.cs"
  - "Assets/Scripts/Game/EnemySenses.cs"
tags:
  - "motor"
  - "crouch"
  - "sneak"
  - "swimming"
  - "levitation"
  - "breath"
  - "climbing"
  - "stealth"
---

# Motor Speeds, Crouch, Swimming, Breath, Climbing, and Stealth

Locomotion speeds, stance height transitions, swimming, drowning, classic wall climbing, and stealth detection coordinate across `src/player/motor.js`, `src/player/climbing.js`, `src/player/exteriorSurface.js`, `src/underwater/breath.js`, `src/characters/skills.js`, `src/characters/statMods.js`, and `src/characters/enemyMotor.js`.

- **Speeds, crouch, and fatigue:** Walk speed equals `(LiveSpeed + 150) / 39.5`, run speed equals `undraggedBase * (1.35 + Running / 200)`, and sneak speed equals `speed / 2 - 1 / CLASSIC_TO_UNITY_RATIO`. Crouch transitions to `CROUCH_HEIGHT = 0.9` and `CROUCH_EYE_HEIGHT = 0.8` over `HEIGHT_TIMER_FAST = 0.10` s and latches `isSneaking` for `IsMovingLessThanHalfSpeed`. Mid-air control requires `isEnhancedJumping`. Per-minute fatigue drains scale by `FATIGUE_DRAIN_SCALE = 0.75`, with zero drain while idle on dry ground (`FATIGUE-IDLE`).
- **Swimming, levitation, and breath:** `LEVITATE_MOVE_SPEED` is `4.0`. Swim speed equals `base * (Swimming / 200) + base / 4` with vertical look zeroed; `exteriorSwimLatch` and `exteriorSwimming` drive outdoor swimming and waive fall damage. `breathStep` and `deepBreath` read `maxBreath` from `statMods` and apply the Argonian refund plus the Kynareth temple bonus.
- **Climbing and stealth:** Classic climbing moves at `baseSpeed / 3` (doubled when enhanced), clamps skill checks to `5..95` at cadences `START_CLIMB_SKILL_CHECK_FREQUENCY = 14` and `CONTINUE_CLIMBING_SKILL_CHECK_FREQUENCY = 15`, and derives `CLIMB_CAP_LOW` from `CLIMB_SIDE_REACH = CAPSULE_RADIUS + 0.1`. Stealth uses `2 * ((trunc(dist / GLOBAL_SCALE) * liveStealth) >> 10)`, while `blockedByIllusionEffect` rolls `8%` see-through against chameleon, `4%` against shade, and honors `seesThroughInvisibility` across 13 enemy kinds.
