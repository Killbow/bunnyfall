---
slug: "morrowind-attachment-aim-and-declared-divergences"
title: "Part Attachment, Aim Pitch, Held Items, and Declared Divergences"
domain: "combat"
kind: "subcard"
parent: "morrowind-first-person-rig-overview"
files:
  - "src/formats/mwFirstPerson.js"
  - "src/formats/mwSkin.js"
  - "src/combat/fpArm.js"
  - "src/combat/spineAim.js"
  - "src/combat/heldPose.js"
  - "src/formats/mwItemMap.js"
  - "src/mods/features.js"
  - "src/player/pitchLimit.js"
  - "src/characters/ownArmorModels.js"
  - "src/combat/weaponSheathing.js"
routes: []
tables: []
replacesBible:
  - "02-Formats/Morrowind-Rules.md"
related:
  - "morrowind-first-person-rig-overview"
  - "third-person-trunk-clearance-and-bow-aim-overview"
  - "waist-lantern-bodies-and-peer-light"
  - "held-map-sprite-and-hands-lanes"
  - "handheld-torches-overview"
  - "steel-plate-worn-slots-and-helm-switch"
invariants:
  - "Skinned parts bind onto the master skeleton by bone name (`bindPartsInto` in `src/formats/mwFirstPerson.js`, including custom sets from `src/characters/ownArmorModels.js`), rigid parts parent under the attach bone, and left-side rigid parts mirror across `X`."
  - "`WEAPON_ATTACH_BONE` overrides attach bones per weapon type: `MarksmanBow` -> `\"Weapon Bone Left\"`, `Arrow` -> `\"Bip01 Arrow\"`, and `Bolt` -> `\"ArrowBone\"`."
  - "`applySpineAim` (`src/combat/spineAim.js`) rotates `SPINE_AIM_BONES` (`[\"bip01 spine1\", \"bip01 spine2\"]`) by half pitch each around `-X` in third person only, gated by `spinePitchFactor`."
  - "`rootSpaceTurn` converts OpenSceneGraph row-vector `RotateController` rotations into the column-vector convention."
traps:
  - "IG6c: in the default mode (dagger.mwArmsFollowCamera3 = true) neckPitch and lens pitch are both 0, so camera look never enters the arm pass."
  - "carriedLeftVisible hides a carried torch when the weapon is two-handed. The torch overlays the left arm through blendMaskBones('bip01 l clavicle')."
  - "BEAST-BOOTS: the mwBeastFeet tiers are worn/shafts/hidden and the mwBeastHelm tiers are worn/open/hidden (src/mods/features.js). beastCut applies them in src/formats/mwItemMap.js."
  - "PITCH_LIMIT = (PI/2)*0.99, not PI/2 - 1e-6."
  - "Holster, scabbard, and quiver parts (`src/combat/weaponSheathing.js`) attach bare at the sheathing bone with no BoneOffset and no mirror, thrown weapons never show holstered, and the one-handed axe sheathes at the long blade bone (`Bip01 LongBladeOneHand`)."
dfu:
  - "Assets/Scripts/Game/Entities/PlayerEntity.cs"
tags:
  - "attachment"
  - "bow-aim"
  - "torch"
  - "lantern"
  - "held-map"
  - "beast"
  - "divergence"
---

# Part Attachment, Aim Pitch, Held Items, and Declared Divergences

Skeletal binding, weapon and lantern mounts, spine pitch, torch overlays, and declared divergences shape how first-person and third-person Morrowind rigs assemble (`src/formats/mwFirstPerson.js`, `src/formats/mwSkin.js`, `src/combat/fpArm.js`, `src/combat/spineAim.js`, `src/combat/heldPose.js`, and `src/formats/mwItemMap.js`).

- **Part binding and weapon mounts (`mwFirstPerson.js`, `mwSkin.js`, `ownArmorModels.js`):** `bindPartsInto` binds skinned meshes (including custom armor sets from `src/characters/ownArmorModels.js`) onto the master skeleton by bone name, parents rigid parts under their attachment bone with `X` mirroring on left-side slots, and converts row-vector rotations via `rootSpaceTurn`. `WEAPON_ATTACH_BONE` routes `MarksmanBow` to `"Weapon Bone Left"`, `Arrow` to `"Bip01 Arrow"`, and `Bolt` to `"ArrowBone"`, while `injectSkeletonNodes` grafts sheath and quiver bone addons.
- **Aim pitch, held items, and divergences (`fpArm.js`, `spineAim.js`, `heldPose.js`, `mwItemMap.js`, `features.js`, `pitchLimit.js`):** `PITCH_LIMIT` is `(Math.PI / 2) * 0.99`. In default `dagger.mwArmsFollowCamera3 = true`, `neckPitch` and lens pitch stay `0`, while `fpFrameWindow` aligns the viewport to the active weapon widget rect. In third person, `applySpineAim` rotates `SPINE_AIM_BONES` (`["bip01 spine1", "bip01 spine2"]`) by half pitch around `-X` under `spinePitchFactor`. `carriedLeftVisible` hides a left-hand torch during two-handed stances, `blendMaskBones('bip01 l clavicle')` masks the torch arm, `heldTracksFor` layers `HELD_POSE_DEFAULT` via `HELD_BONE_ALIASES`, `hangAffine` hooks waist lanterns at `HIP_LANTERN_HOOK = [14, 5, 9.5]` on `HIP_LIGHT_BONE = "Bip01 Pelvis"`, and `beastCut` applies `mwBeastFeet` (`worn`/`shafts`/`hidden`) and `mwBeastHelm` (`worn`/`open`/`hidden`).
