---
slug: parkour-climb-feel-hands-and-peer-sync
title: "Climb Feel, First-Person Hands, Body Rig and Peer Sync"
domain: multiplayer
kind: subcard
parent: parkour-enhanced-climbing-overview
files:
  - src/player/climbFeel.js
  - src/player/climbPose.js
  - src/combat/climbHands.js
  - src/combat/climbRig.js
  - src/combat/fpArm.js
  - src/formats/mwFirstPerson.js
  - src/net/peerClimb.js
  - src/net/wire.js
  - src/net/onlineWorld.js
  - src/player/motor.js
  - src/combat/weaponRig.js
routes: []
tables: []
replacesBible:
  - "03-World/Parkour-Arc.md"
related:
  - parkour-enhanced-climbing-overview
  - online-coop-peer-presence-and-crowd-fans
  - two-hands-morrowind-mirror-rig-and-spread
  - two-hands-mixed-pair-and-spell-hand
invariants:
  - "`climbPoseOf(player)` in motor.js mints the look fields: `cl` (1 hang, 2 face, 3 move in flight), `cw` (facing yaw), and `ck` (CLIMB_MOVE_KINDS index + 1). All are omitted off the wall, so grounded poses keep their bytes."
  - "CLIMB_MOVE_KINDS = ['catch','reach','mantle','vault','lower','corner','leap','wallrun'] in src/net/wire.js. Append only, because indices go on the wire."
  - "The `ClimbPose` class (src/player/climbPose.js) is the single climb choreography that `ClimbHands` and `applyClimbRig` both follow, and `climbRigInput` snapshots it."
  - "First-person climb hands stay anchored to the wall and switch to reach art when the view turns more than LOOK_FROM_DEG = 40 off the wall's face."
  - "While a cast animation plays, the climbing hands receive no climb pose, so they let go of the wall and ease back after the cast. The readied-spell hands are skipped while the climbing hands show, and the climbing hands never draw in a frame where spell hands were drawn."
traps:
  - "Peer climb audio is rate-limited: PEER_CUE_MS = 150 between cues and PEER_RHYTHM_MS = 100 rhythm floor (`PeerClimbSounds`)."
  - "Weapons lower or hide while hands grip (`climbHandsWanted`). Do not draw the weapon sprite over climb hands."
  - "BODY_TURN_TAU = 0.08 smooths the body yaw toward `climbFacing`."
  - "Untracked bones share the `node.rest` entry of the skeleton, so the climb rig (`src/combat/climbRig.js`) writes every bone through `pose.set` as a new entry and never mutates an existing one."
dfu: []
tags:
  - parkour
  - climb-hands
  - camera
  - audio
  - peer-sync
  - wire
  - morrowind-rig
---

# Climb Feel, First-Person Hands, Body Rig and Peer Sync

Climbing presentation couples procedural camera sway, first-person wall hands, third-person Morrowind rig poses, and compact wire pose fields under one choreography.

## Choreography, First-Person Hands, and Body Rig

- **Single choreography (`ClimbPose`):** `ClimbPose` (`src/player/climbPose.js`) computes limb placements shared by first-person `ClimbHands` (`src/combat/climbHands.js`) and third-person `applyClimbRig` (`src/combat/climbRig.js`), snapshotted via `climbRigInput`. `ClimbFeel` and `applyClimbView` (`src/player/climbFeel.js`) drive the procedural camera.
- **Hands and Morrowind rig:** While `climbHandsWanted` is true, `src/combat/fpArm.js` lowers or hides weapons so weapon sprites never draw over climb hands. First-person hands stay anchored to the wall and switch to reach art when the view turns more than `LOOK_FROM_DEG` (`40` deg) off the wall face. `climbRequestToRig` and `climbRequestToFirstPerson` map world requests into third-person and first-person Morrowind rig spaces (`src/formats/mwFirstPerson.js`), while `BODY_TURN_TAU` (`0.08` s) smooths body yaw toward `climbFacing`.

## Wire Encoding and Peer Interpolation

- **Compact pose fields (`climbPoseOf`):** In `src/player/motor.js`, `climbPoseOf(player)` mints `cl` (`1` hang, `2` face, `3` move in flight), `cw` (facing yaw), and `ck` (`CLIMB_MOVE_KINDS` index + `1`). Off the wall, all three are omitted so grounded poses keep their byte size. `CLIMB_MOVE_KINDS` (`['catch', 'reach', 'mantle', 'vault', 'lower', 'corner', 'leap', 'wallrun']` in `src/net/wire.js`) is append-only.
- **Remote playback (`src/net/peerClimb.js`, `src/net/onlineWorld.js`):** Peers interpolate moves in flight via `PeerClimbTrack` and `peerMove` (`PEER_MOVE_DUR = 0.9` s) and play rate-limited audio via `peerClimbCues` and `PeerClimbSounds` (`PEER_CUE_MS = 150` ms gap, `PEER_RHYTHM_MS = 100` ms rhythm floor).
