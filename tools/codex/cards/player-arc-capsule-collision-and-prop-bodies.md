---
slug: "player-arc-capsule-collision-and-prop-bodies"
title: "Capsule Sphere Chain, Step-Up, One-Way Floors, and Prop Bodies"
domain: "world"
kind: "subcard"
parent: "player-arc-overview"
files:
  - "src/player/collider.js"
  - "src/player/motor.js"
  - "src/player/bodyClamp.js"
  - "src/world/propBodies.js"
  - "src/world/signSolid.js"
  - "src/world/houseSigns.js"
  - "src/ai/cover.js"
routes: []
tables: []
replacesBible:
  - "03-World/Player-Arc.md"
related:
  - "player-arc-overview"
  - "late-solid-gate-mover-substeps-and-dungeon-void-rescue"
  - "doorway-clearance-and-enemy-spacing"
invariants:
  - "A face within radius + SKIN (SKIN = 0.02) grounds the body or is leaned on. Contact push and ceiling flags use the bare radius."
  - "Capsule beads are spaced at 2 * CAPSULE_RADIUS * BEAD_OVERLAP (BEAD_OVERLAP = 0.95). Beads must overlap, never just touch."
  - "A step-up retry is taken only when the plain move made less than a quarter of the wanted distance (movedSq < wantedSq * 0.25) and the raised path is truly clear. This prevents wall-laddering."
  - "Props taller than STEP_OFFSET act as walls (SH1). A one-way floor is a floor only where the body has headroom over it (RAIL-HANG, _standsOn)."
traps:
  - "Keep bodyFeetAt() (the physical capsule feet) separate from feetAt() (the smoothed camera feet). Grounding from the camera reintroduces DISC18."
  - "Shop signs (ARCH3D 43700-43755) more than SIGN_HANG_M = 1 above the foot are ray- and sight-only. Making them solid stops riders under hanging signs."
dfu:
  - "Assets/Scripts/Game/Player/PlayerGroundMotor.cs"
  - "Assets/Scripts/Game/PlayerCollision.cs"
  - "Assets/Scripts/Game/Player/FrictionMotor.cs"
tags:
  - "collision"
  - "capsule"
  - "stairs"
  - "step-up"
  - "props"
  - "signs"
---

# Capsule Sphere Chain, Step-Up, One-Way Floors, and Prop Bodies

Capsule collision, stair stepping, one-way floors, and cylindrical prop boundaries operate across `src/player/collider.js`, `src/player/motor.js`, `src/player/bodyClamp.js`, `src/world/propBodies.js`, `src/world/signSolid.js`, `src/world/houseSigns.js`, and `src/ai/cover.js`.

- **Sphere chain and grounding:** The spatial triangle grid indexes geometry at `CELL = 2`. Capsule spheres are spaced by `2 * CAPSULE_RADIUS * BEAD_OVERLAP` (`BEAD_OVERLAP = 0.95`) so adjacent beads overlap. Faces within `radius + SKIN` (`SKIN = 0.02`) ground or support the capsule, whereas contact push and ceiling flags test the bare radius. `capsuleContact`, `restFloor`, and `findClearFloor` manage slope rest heights and unstick recovery, while `standHeadClear` verifies standing headroom. Physical feet (`bodyFeetAt()`) remain distinct from smoothed camera feet (`feetAt()`).
- **Step-up, stairs, and one-way floors:** Move-and-slide attempts a step-up retry only when the initial move covers less than a quarter of the requested squared distance (`movedSq < wantedSq * 0.25`) and the raised path is clear. Stair descent snaps downward in `STEP_OFFSET / 8` increments, props taller than `STEP_OFFSET` behave as walls, and one-way floors (`_standsOn`) support the capsule only when headroom is clear above them.
- **Prop cylinders and shop signs:** `flatBody` and `footShare` register upright cylinders (`COVER_TRUNK_R = 0.3`, filtering `NOT_COVER_ARCHIVES`) in the cover grid, and `keepOffBodies` pushes the player outside them without blocking rays. Shop signs (`ARCH3D` `43700` to `43755`) hanging more than `SIGN_HANG_M = 1` above the foot remain ray-only and sight-only so riders pass underneath.
