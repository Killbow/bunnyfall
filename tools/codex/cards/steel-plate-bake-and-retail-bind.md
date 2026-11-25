---
slug: "steel-plate-bake-and-retail-bind"
title: "Steel Plate Bake: FBX Import, Retail Bind, and Joint Weights"
domain: "assets"
kind: "subcard"
parent: "steel-plate-armor-overview"
files:
  - "tools/bakeSteelPlate.mjs"
  - "tools/fbxStrip.mjs"
  - "tools/fbxRead.mjs"
  - "tools/skinWeights.mjs"
  - "tools/nifWrite.mjs"
  - "tools/helmLiftProbe.mjs"
  - "vendor/weapon-sheathing/Data Files/Animations/xbase_anim/xbase_anim_sh.nif"
routes: []
tables: []
replacesBible:
  - "04-Characters/Steel-Plate.md"
related:
  - "steel-plate-armor-overview"
  - "steel-plate-worn-slots-and-helm-switch"
  - "mw-gpu-skinning-and-sprite-batch"
invariants:
  - "Scene axes follow Morrowind conventions: `SETTINGS` uses `{ placement: \"scene\", forward: \"+y\", up: \"+z\" }`."
  - "Every object must match its `PIECES` bounding box within `BOX_SLACK = 0.02` or `bakeObject` throws by name and `--import` aborts before writing."
  - "Reference head and neck meshes (`REFERENCE_PARTS` `Breton_Male.003` and `Breton_Male.006`) are stripped from committed sources via `stripFbx`, preserving only the 12 bound numbers in `SCENE_BODY`."
  - "`retailBind` rejects any skeleton whose skinned `Tri Shadow` node is missing, translated, rotated, or scaled."
traps:
  - "Runtime rig helpers (`fitShift`, `shiftBatch`, `bindPoseMats`, `rebindSkin`, `skeletonBindSkins`) are retired and absent from `src/`; never reintroduce runtime skin transfer for steel plate (`bindSkinnedFromBody` in `src/formats/mwFirstPerson.js` serves only `skinFrom` brigandine parts)."
  - "`HELM_LIFT = 4` raises only the open helm (`Sphere.002`); the closed helm stays at exported height (`z` `113.88..132.82`) because it hides the head."
dfu: []
tags:
  - "bake"
  - "fbx"
  - "skinning"
  - "nif"
  - "tooling"
  - "steel-plate"
---

# Steel Plate Bake: FBX Import, Retail Bind, and Joint Weights

`tools/bakeSteelPlate.mjs` imports exports (`--import=<export.fbx>` for the full set, `--open-helm` for `Sphere.002`) under `SETTINGS` `{ placement: "scene", forward: "+y", up: "+z" }` and bakes NIFs against `RETAIL_SKELETON` (`xbase_anim_sh.nif`).

- **Box gates and FBX stripping (`tools/fbxStrip.mjs`, `tools/fbxRead.mjs`):** Objects must match `PIECES` bounding boxes within `BOX_SLACK = 0.02` or `bakeObject` throws and aborts `--import`. `stripFbx` removes `REFERENCE_PARTS` (`Breton_Male.003` and `Breton_Male.006`), keeping only the 12 bound numbers in `SCENE_BODY`.
- **Retail bind and weights (`tools/skinWeights.mjs`, `tools/nifWrite.mjs`, `tools/helmLiftProbe.mjs`):** `retailBind` rejects skeletons whose `Tri Shadow` node is missing, translated, rotated, or scaled; `plateBind` adds `SCENE_FROM_BIND = [0, 2.5, 98.55]`. `PLATE_RIG` maps cuirass (`Tri Chest`), skirt (`Tri Groin`, top `84`, bottom `64.5`, share `0.7`, center `4`), pauldrons (`Tri Right/Left Clavicle`), gauntlets (`Tri Right/Left Hand`, `+X` `Imperial_Steel_Left_Gauntlet_20_Male` as `gauntlet_right`), greaves (`Tri Right/Left Upper Leg`), boots (`Tri Right/Left Foot`), and rigid `Bip01 Head` helms (`Tri Hair`). `jointWeights` and `skinnedMeshesToNif` emit `NiSkinInstance` and `NiSkinData`. `HELM_LIFT = 4` (`SCREENSHOT_SCALP_RATIO = 0.39`) lifts only `Sphere.002`, keeping the closed helm at `z` `113.88..132.82`. Runtime helpers (`fitShift`, `shiftBatch`, `bindPoseMats`, `rebindSkin`, `skeletonBindSkins`) are retired.
