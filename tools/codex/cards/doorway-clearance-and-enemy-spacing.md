---
slug: doorway-clearance-and-enemy-spacing
title: "Doorway Clearance and Enemy Spacing"
domain: ai
kind: subcard
parent: tactics-arc-enhanced-enemy-ai-overview
files:
  - src/characters/foeSpacing.js
  - src/characters/cityGuards.js
  - src/scenes/worldModes.js
  - src/scenes/frame/peopleFrame.js
  - src/scenes/dungeonContext.js
  - src/player/mobileEnemyActivate.js
  - src/player/activate.js
  - src/player/activationRace.js
routes: []
tables: []
replacesBible:
  - "12-Enhanced-AI/Tactics-Arc.md"
related:
  - tactics-arc-enhanced-enemy-ai-overview
  - attack-tokens-engage-rings-and-enemy-retreat
  - living-world-indoors-and-lodgers
invariants:
  - "A door threshold spans `DOORWAY_DEPTH` 1.4 m either side of the door plane and `DOORWAY_HALF_WIDTH` 1.2 m from its center along it."
  - "`clearDoorways` eases any enemy whose destination does not lie through the door out along the door normal, to its own side, at `DOORWAY_CLEAR_SPEED` 1.6 m/s, moving through the collider and refusing ledges. A quarry on the sill grants no exemption (AUDIT TACT C1/C2)."
  - "`spaceFoes` (one pool) and `spaceAcross` (several pools, e.g. guards plus enemies) push bodies apart to `FOE_SPACING_GAP` (2 x capsule radius) at `FOE_SPACING_SPEED` 3. Both always run."
  - "`yieldsToDoor`: a hit on an enemy that is not `hostileToMe`, with a door within activation distance (3.2) behind it, passes the click to the door (`peacefulFoePass`)."
traps:
  - "Sweeps must use `sweepHeight(ai)` (the motor's live `controllerHeight`), not a fixed capsule, or ducking bodies jam under lintels."
  - "Use `hostileToMe`, not a generic hostile tag, so streamed puppets of other players do not swallow door clicks."
dfu: []
tags:
  - ai
  - doorways
  - anti-grief
  - spacing
  - guards
  - tact3
---

# Doorway Clearance and Enemy Spacing

Doorway clearance, body spacing, and click pass-through prevent enemies, guards, and peaceful bodies from plugging thresholds on both classic and enhanced AI lanes.

- **Doorway Threshold Clearance:** In `src/characters/foeSpacing.js`, door zones combine static thresholds from `doorSpotsNear` (`40` m outdoors, `30` m indoors) and swing doors from `actionDoorSpots` (`src/scenes/worldModes.js`, `src/scenes/frame/peopleFrame.js`, and `src/scenes/dungeonContext.js`). Each threshold spans `DOORWAY_DEPTH` (`1.4` m) either side of the door plane and `DOORWAY_HALF_WIDTH` (`1.2` m) from its center. Whenever an enemy's destination does not cross the door, `clearDoorways` slides it to its own side along the door normal at `DOORWAY_CLEAR_SPEED` (`1.6` m/s), refusing ledges and granting no exemption when the quarry stands on the sill.
- **Pool Spacing and Sweep Height:** `spaceFoes` (single pool) and `spaceAcross` (combined pools such as guards and enemies) push overlapping capsules apart to `FOE_SPACING_GAP` (`2 * capsule radius`) at `FOE_SPACING_SPEED` (`3`), using `freeLodgedFeet` and `bodyFits` to keep feet out of geometry. All sweeps query `sweepHeight(ai)` so ducking motors use their live `controllerHeight` instead of jamming under lintels.
- **Indoor Guard Slots and Door Clicks:** In `src/characters/cityGuards.js`, `indoorWatchSpot` places summoned guards `GUARD_INDOOR_INSET` (`DOORWAY_DEPTH + 0.6 = 2.0` m) into the room across five lanes (`0`, `+/-0.9`, and `+/-1.8` m at `GUARD_INDOOR_LANE = 0.9`). In `src/player/mobileEnemyActivate.js`, `src/player/activate.js`, and `src/player/activationRace.js`, `yieldsToDoor` and `peacefulFoePass` pass clicks through any body not `hostileToMe` when a door lies within `3.2` m behind it.
