---
slug: morrowind-npc-bodies-overview
title: "Morrowind NPC Bodies: Lanes, Budgets, and Settings"
domain: characters
kind: overview
parent: null
files:
  - src/characters/npcBodies.js
  - src/characters/foeBodies.js
  - src/net/peerBodies.js
  - src/render/characterSprite.js
  - src/formats/mwGpuSkin.js
  - src/mods/features.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Morrowind-NPCs.md"
related:
  - characters-paperdoll-and-bodies
  - mw-gpu-skinning-and-sprite-batch
  - npc-lanes-frame-budget-and-build-gate
  - npc-populations-wardrobe-and-creatures
  - npc-marks-crop-and-model-detail
  - webgl2-renderer-and-textures
invariants:
  - "Every non-player actor with Morrowind data attached can render as a GPU-skinned 3D body; outside the budget cut it falls back to its classic billboard."
  - "NPC lanes and peer (player) body lanes are separate, and NPC bodies never consume peer quotas."
  - "The `mwNpcBodies` pref (feature id `mw-npc-bodies`) selects `off`, `near`, or `all` (initial `near`); it is a viewer-local setting, never sent on the wire."
  - "When a 3D body renders, its billboard is marked `castOnly` so only the body draws."
traps:
  - "Do not add a population without routing it through `createPopulationLane` and `NPC_FRAME_BUDGET`; a lane outside the budget breaks the frame cap."
  - "Do not hardcode the relay version when touching enemy look wire fields `ls` and `lw`."
dfu: []
tags:
  - morrowind
  - npc-bodies
  - performance
  - overview
  - enemies
---

# Morrowind NPC Bodies: Lanes, Budgets, and Settings

When Morrowind data files are mounted, non-player characters, enemies, creatures, horses, and static room figures can render as GPU-skinned 3D NIF bodies instead of classic 2D sprites (`src/characters/npcBodies.js`, `src/characters/foeBodies.js`, and `src/render/characterSprite.js`).

- **Population lanes and billboard fallback (`npcBodies.js`, `peerBodies.js`):** Each NPC group registers a lane via `createPopulationLane` and competes under a shared per-frame budget (`NPC_FRAME_BUDGET`). Actors inside the distance and skinning budget render as 3D bodies and mark their classic billboard `castOnly` so the flat sprite only casts shadows. Actors outside the cut fall back cleanly to their classic billboards. NPC lanes stay separate from `peerBodies.js` player lanes so crowds never starve remote player rendering. During overworld travel transitions, `holdNpcBodies` suppresses NPC body updates for `NPC_HOLD_MS` (`250` ms).
- **Combat and death states (`npcBodies.js`, `foeBodies.js`):** Hit counters (`ht`) trigger `rig.hurt` recoil animations, while death counters (`dd`) drive `rig.die` and `rig.revive` so fallen actors hold their final death pose.
- **Viewer-local feature settings (`src/mods/features.js`):** Four client-only preferences control presentation without affecting network traffic: `mw-npc-bodies` (`mwNpcBodies`: `off`, `near`, or `all`, defaulting to `near`), `mw-billboard-look` (`mwBillboardLook`, defaulting to `false`), `mw-model-detail` (`mwModelDetail`: `pixel` or `sharp`, defaulting to `pixel`), and `npc-marks` (`npcMarks`, defaulting to `true`).
