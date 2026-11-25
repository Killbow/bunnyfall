---
slug: "waist-lantern-bodies-and-peer-light"
title: "Waist Lantern Light Point, Swing, Third-Person Bodies, and Peer Pose Bits"
domain: "player"
kind: "subcard"
parent: "handheld-torches-overview"
files:
  - "src/player/playerTorch.js"
  - "src/player/lanternSwing.js"
  - "src/player/eotbLantern.js"
  - "src/player/eotbBody.js"
  - "src/combat/fpArm.js"
  - "src/net/wire.js"
  - "src/net/peerBodies.js"
  - "src/net/peerRiders.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Handheld-Torches.md"
related:
  - "handheld-torches-overview"
  - "belt-waist-lanterns-and-festival-cake-cap-overview"
  - "online-coop-peer-presence-and-crowd-fans"
  - "morrowind-npc-bodies-overview"
invariants:
  - "playerTorchLight places a waist lantern at LANTERN_HIP { left -0.2, up 1.0, forward 0.1 } off the feet in the yaw frame, unless Eye of the Beholder sets setPlayerWaistLightOverride. Held torches use TORCH_OFFSET { left 0.3, up 1.2, forward 0.2 }."
  - "Lantern sway (LANTERN_SWING) is a damped pendulum: length 0.25 m (period about 1 s), damping 2.0, clamped to maxAngle 35 degrees."
  - "HIP_LANTERN_HEIGHT = 0.3 m is the one lantern height for both bodies. The Morrowind body hooks it at HIP_LANTERN_HOOK [14, 5, 9.5] on HIP_LIGHT_BONE 'Bip01 Pelvis' (fpArm.js)."
  - "Eye of the Beholder draws the waist lantern only on rear views (`isRearView(orientation)`, `BACK_RECORD = 4`) using the Lantern template world texture (`loadLanternArt` in `src/player/eotbLantern.js`)."
  - "Pose bits: `hl` = waistLanternPoseBit (1 at the waist, otherwise absent) and `lt` = torchPoseByte (radius x2, +1 guttering, otherwise absent). peerTorchLight clamps the radius to peerLightRangeMax and puts the light at the hip when `hl` is set."
traps:
  - "The `hl` bit alone lights nothing. The peer light comes from `lt` (PEERLIGHT1). Older notes saying the light is not broadcast are stale."
  - "Never hardcode the relay version string. Read RELAY_VERSION from src/net/wire.js."
dfu:
  - "Assets/Scripts/Game/PlayerTorch.cs"
tags:
  - "lantern"
  - "waist"
  - "eye-of-the-beholder"
  - "morrowind-body"
  - "peer-pose"
---

# Waist Lantern Light Point, Swing, Third-Person Bodies, and Peer Pose Bits

Waist lantern placement, pendulum motion, third-person meshes, and network pose bits coordinate across `src/player/playerTorch.js`, `src/player/lanternSwing.js`, `src/player/eotbLantern.js`, `src/player/eotbBody.js`, `src/combat/fpArm.js`, `src/net/wire.js`, `src/net/peerBodies.js`, and `src/net/peerRiders.js`.

- **Light offset and pendulum sway:** `playerTorchLight` (`src/player/playerTorch.js`) positions a waist lantern (`LANTERN_TEMPLATE = 248`) at `LANTERN_HIP` (`{ left: -0.2, up: 1.0, forward: 0.1 }`) relative to feet in the yaw frame unless overridden by `setPlayerWaistLightOverride`, whereas handheld lights use `TORCH_OFFSET` (`{ left: 0.3, up: 1.2, forward: 0.2 }`). `LANTERN_SWING` (`src/player/lanternSwing.js`) models a damped pendulum with length `0.25` m, damping `2.0`, and `maxAngle = 35` degrees.
- **Third-person bodies:** Both body styles share `HIP_LANTERN_HEIGHT = 0.3` m. Morrowind bodies attach the lantern at `HIP_LANTERN_HOOK` (`[14, 5, 9.5]`) on `HIP_LIGHT_BONE` (`'Bip01 Pelvis'` in `src/combat/fpArm.js`), while Eye of the Beholder (`src/player/eotbBody.js`, `src/player/eotbLantern.js`) renders `loadLanternArt` only on rear views (`isRearView(orientation)`, `BACK_RECORD = 4`).
- **Peer pose bits:** `src/net/wire.js` (always read `RELAY_VERSION` from `wire.js`) validates `hl` (`waistLanternPoseBit`, `1` at the waist) and `lt` (`torchPoseByte`, radius times `2`, plus `1` while guttering). `peerTorchLight` derives illumination from `lt` (clamped to `peerLightRangeMax`, `PEER_LIGHT_RADIUS_MAX = 63`) and shifts the light to the hip when `hl` is set.
