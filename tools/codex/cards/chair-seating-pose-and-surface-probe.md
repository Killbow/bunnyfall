---
slug: chair-seating-pose-and-surface-probe
title: "Chair Seating Pose and Surface Probe"
domain: player
kind: subcard
parent: zone-respawn-hold-monument-and-honor-banners-overview
files:
  - src/world/chairSeat.js
  - src/player/seatPose.js
  - src/scenes/interiorContext.js
  - src/scenes/dungeonContext.js
routes: []
tables: []
replacesBible:
  - "01-Overview/handoffs/Five-Asks-2026-10-14.md"
related:
  - zone-respawn-hold-monument-and-honor-banners-overview
  - tavern-card-tables-seating-and-physics
invariants:
  - "CHAIR_MODELS = {41100, 41105, 41106, 41122, 41123, 43307}."
  - "chairSeatOf probes the seat height and falls back to CHAIR_SEAT_DEFAULT 0.45 m when no surface is found."
  - "CHAIR_FLOOR_STEP 0.6 m: seating is refused when the chair floor is farther than that, vertically, from the player."
  - "`chairProbeOver` probes against a physics `Collider`."
traps:
  - "Chairs in dungeon interiors are geometry only."
  - "Touch swings and spell casting stand the player up."
  - "While seated, the third-person orbit centers on the chair."
dfu: []
tags:
  - chairs
  - sit
  - seat-pose
---

# Chair Seating Pose and Surface Probe

Interior chair and bench interaction (`src/world/chairSeat.js`, `src/player/seatPose.js`, `src/scenes/interiorContext.js`, and `src/scenes/dungeonContext.js`) probes seat geometry against physics colliders, resolves facing for backless benches, and drives the seated character rig and third-person camera orbit.

## Chair Models, Height Probe, and Floor Step

Interactive seating applies to the six furniture models in `CHAIR_MODELS` (`41100`, `41105`, `41106`, `41122`, `41123`, and `43307`) inside building interiors (`src/scenes/interiorContext.js`). In dungeon interiors (`src/scenes/dungeonContext.js`), chairs remain static geometry only. When activated, `chairSeatOf` calls `chairProbeOver` against a physics `Collider` to measure seat height, falling back to `CHAIR_SEAT_DEFAULT` (`0.45` m) when no surface is found. Seating is refused when the chair floor is vertically farther than `CHAIR_FLOOR_STEP` (`0.6` m) from the player.

## Bench Facing, Rig Pose, and Seated Orbit

Because benches lack a backrest, `src/world/chairSeat.js` aligns the sitter along whichever bench axis lies closest to the approach direction. In `src/player/seatPose.js`, `seatRigInput(feet, yaw, top, race)` computes the seated articulation for the player model. While seated, the third-person camera orbit centers on the chair rather than the standing capsule, and any touch swing or spell cast stands the player up.
