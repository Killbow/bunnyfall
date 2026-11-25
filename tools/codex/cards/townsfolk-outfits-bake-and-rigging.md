---
slug: "townsfolk-outfits-bake-and-rigging"
title: "Townsfolk Outfit Bake: Pack Bind Pose and Garment Island Weighting"
domain: "characters"
kind: "subcard"
parent: "townsfolk-outfits-overview"
files:
  - "tools/bakeTownsfolk.mjs"
  - "tools/bakeSteelPlate.mjs"
  - "tools/skinWeights.mjs"
  - "tools/fbxStrip.mjs"
  - "tools/fbxMesh.mjs"
routes: []
tables: []
replacesBible:
  - "04-Characters/Townsfolk-Outfits.md"
related:
  - "townsfolk-outfits-overview"
  - "townsfolk-outfits-worn-composition-and-fallback"
invariants:
  - "Outfits are skinned in packBind (retail bind with arms turned) without moving vertices; inverse binds are written for that pose."
  - "PACK_ARM_FALL = 0.5; ARM_REACH = 6; ARM_FADE = 1.5; HANG_TOP = 84; HANG_SHARE = 1; HANG_CENTRE = 4; KNEE_BLEND = 3."
  - "HELM_LIFT = 4 is imported from tools/bakeSteelPlate.mjs to raise hood islands onto the head bone."
traps:
  - "Do not refit vertices to retail bind; the T-pose source has raised arms and only packBind matches it."
dfu: []
tags:
  - "bake"
  - "skinning"
  - "fbx"
  - "tools"
---

# Townsfolk Outfit Bake: Pack Bind Pose and Garment Island Weighting

The build tool `tools/bakeTownsfolk.mjs` converts source FBX townsfolk meshes (`tools/fbxMesh.mjs`, `tools/fbxStrip.mjs`) into skinned NIF garments (`tools/skinWeights.mjs`) aligned to the Morrowind skeleton.

## Pack Bind Pose and Island Weighting

- **Pack Bind Pose**: Because the T-pose source geometry has raised arms, outfits are skinned directly in `packBind` (the retail bind skeleton with arms rotated by `PACK_ARM_FALL = 0.5`) without moving mesh vertices. Inverse bind matrices are written for `packBind`; refitting vertices to the retail bind pose would distort the shoulders and sleeves.
- **Island Classification**: `islandClass` sorts connected garment islands by bounding box into hood, arm, hanging cloth, torso, leg, or pelvis regions.
- **Hood and Arm Tuning**: Hood islands import `HELM_LIFT = 4` from `tools/bakeSteelPlate.mjs` to lift weights onto the head bone, while sleeves weight across `ARM_REACH = 6` and `ARM_FADE = 1.5`.
- **Skirts and Knees**: `hangOf` blends hanging cloth across hip and thigh weights starting at `HANG_TOP = 84` with `HANG_SHARE = 1` and `HANG_CENTRE = 4`. Lower legs blend thigh influence across `KNEE_BLEND = 3` past the knee joint.
