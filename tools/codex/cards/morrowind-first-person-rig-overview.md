---
slug: "morrowind-first-person-rig-overview"
title: "Morrowind First-Person Rig and Reference Rules"
domain: "characters"
kind: "overview"
parent: null
files:
  - "src/combat/fpArm.js"
  - "src/formats/mwFirstPerson.js"
  - "src/formats/mwSkin.js"
  - "src/formats/mwAnim.js"
  - "src/formats/mwTexture.js"
  - "src/combat/weaponRig.js"
  - "src/tools/mwViewer.js"
  - "tools/mwArmProbe.mjs"
  - "tools/mwRigProbe.mjs"
  - "src/formats/mwCloakFit.js"
routes: []
tables: []
replacesBible:
  - "02-Formats/Morrowind-Rules.md"
related:
  - "morrowind-rig-records-skeletons-and-asset-paths"
  - "morrowind-weapon-groups-clips-and-pacing"
  - "morrowind-attachment-aim-and-declared-divergences"
  - "morrowind-npc-bodies-overview"
  - "mw-gpu-skinning-and-sprite-batch"
  - "mw-shoulder-camera-offset"
  - "body-motion-overview"
  - "two-hands-morrowind-mirror-rig-and-spread"
invariants:
  - "Rules are ported from the OpenMW reference implementation and cited by file:line in comments. A port departure is allowed only as a named DECLARED DIVERGENCE."
  - "A missing skeleton or part is REPORTED, never silently swapped for another asset."
  - "createWeaponRig (src/combat/weaponRig.js) owns the live first-person arm, and active() gates it on a built arm, a GPU mesh and a camera."
  - "The first-person near plane uses the idle reach (`idleReach / 200`, at least `1e-4`) and the far plane uses the reach swept over every clip (`reach * 4`), so a wide swing does not push the near plane out."
  - "`refreshWorn` (`src/combat/weaponRig.js`) only calls `syncWorn`, which reads the equip table back into the hands, so calling it again in the same frame is safe."
  - "`followCloak` installs `assembly.afterPose`, so stowed gear re-solves against the cloak after every `poseAssembly`, and a body with no cloak clears the hook."
traps:
  - "Morrowind modules are flat under src/formats/; there is no src/formats/morrowind/ directory, even though some comments still cite one."
  - "OpenMW class names in comments (NpcAnimation, CharacterController, RotateController) are citations, not port symbols."
  - "`frustum` lives in `src/combat/fpArm.js` rather than `src/world/mat4.js`, because the relay bundles `mat4.js` and a client-only lens change there would change the relay build."
  - "`drawLayer` returns before it draws anything while `fpArm.thirdActive()` is true, so in Morrowind third person no first-person layer draws, not even the classic spellcasting hands."
dfu: []
tags:
  - "morrowind"
  - "first-person"
  - "rig"
  - "openmw-parity"
  - "formats"
---

# Morrowind First-Person Rig and Reference Rules

The Morrowind first-person rig ports OpenMW skeletal, animation, and attachment rules with explicit `file:line` source citations, allowing departures only as named `DECLARED DIVERGENCE` blocks and reporting missing skeletons or body parts rather than silently substituting fallback assets.

- **Format and clip modules (`src/formats/mwFirstPerson.js`, `src/formats/mwSkin.js`, `src/formats/mwSkinTransfer.js`, `src/formats/mwAnim.js`):** All Morrowind format modules live flat under `src/formats/` (never `src/formats/morrowind/`), and OpenMW C++ identifiers in comments (`NpcAnimation`, `CharacterController`, `RotateController`) are reference citations rather than exported symbols. `mwFirstPerson.js` implements record readers, weapon tables, part binding (`bindPartsInto`), posing (`poseAssembly`), velocity extraction (`sourcesVelocity`), and attachment math (`hangAffine`, `placeNormalsAtBone`). `mwSkin.js` provides `poseSkeleton`, `skinBatch`, and `injectSkeletonNodes`; `mwSkinTransfer.js` provides `transferSkin`; and `mwAnim.js` runs the clip state machine (`resetClip`, `advanceClip`, `isLoopingAnimation`).
- **Runtime ownership and diagnostic probes (`src/combat/weaponRig.js`, `src/combat/fpArm.js`, `src/tools/mwViewer.js`):** `createWeaponRig` owns the live `fpArm.js` runtime, gating `active()` on a built arm, a GPU mesh, and a camera, while `morrowindDataGeneration` (`src/scenes/dataSource.js`) invalidates cached builds. Offline inspection runs through `tools/mwArmProbe.mjs` and `tools/mwRigProbe.mjs`, paired with the interactive viewer in `src/tools/mwViewer.js`.
