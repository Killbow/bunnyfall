---
slug: "own-heads-overview"
title: "Own Heads: Breton Male NIF Bake, -Y Orientation, and Paintings"
domain: "characters"
kind: "overview"
parent: null
files:
  - "tools/bakeHeads.mjs"
  - "tools/fbxMesh.mjs"
  - "tools/helmLiftProbe.mjs"
  - "src/assets/mw/source/Breton_Heads.fbx"
  - "src/characters/ownHeadModels.js"
  - "src/formats/mwFaceMatch.js"
  - "src/formats/mwFirstPerson.js"
routes: []
tables: []
replacesBible:
  - "04-Characters/Own-Heads.md"
related:
  - "own-heads-face-pools-and-scope"
  - "characters-paperdoll-and-bodies"
invariants:
  - "Only player Breton men wear custom port heads (`OWN_HEADS` and `ownHeadModelPaths` in `src/characters/ownHeadModels.js`); all other race/sex pairs and all NPCs use Morrowind data pools."
  - "`HEAD_FORWARD = \"-y\"` in `tools/bakeHeads.mjs` rotates exported meshes half round about the crown without mirroring so faces match retail `-Y` head orientation (`partFrame(mesh, basisMap(HEAD_FORWARD, HEAD_UP))`)."
  - "`FACE_MATCH_VERSION = 2` (`src/formats/mwFaceMatch.js`) measures `headFeatures` along `-Y`."
traps:
  - "Reverting `HEAD_FORWARD` to `+y` flips baked faces backward and invalidates `mwFaceMatch.js` verdicts."
  - "Legacy subpaths under `ownModels/`, `formats/morrowind/`, `combat/weapon/`, and `net/peer/` do not exist in the live tree."
dfu: []
tags:
  - "mw-heads"
  - "breton"
  - "bake"
  - "nif"
---

# Own Heads: Breton Male NIF Bake, -Y Orientation, and Paintings

Custom Breton male heads and hairs (`OWN_HEADS` and `ownHeadModelPaths` in `src/characters/ownHeadModels.js`) replace Morrowind face meshes for player Breton men while all other race and sex pairs and all NPCs keep Morrowind data pools.

- **FBX bake and six rigid NIFs (`tools/bakeHeads.mjs`, `tools/fbxMesh.mjs`, `tools/helmLiftProbe.mjs`):** `tools/bakeHeads.mjs` bakes six rigid NIFs and DDS textures from `src/assets/mw/source/Breton_Heads.fbx` and `PAINTINGS` (`src/assets/mw/source/*.png`): heads `breton_m_head_h04`, `breton_m_head_h0411` (full-face UV eyepatch), and `breton_m_head_h0423`, plus hairs `breton_m_hair_widow`, `breton_m_hair_01`, and `breton_m_hair_0111` (red headband). Because all three heads share one crown profile, any head pairs cleanly with any hair across nine interchangeable combinations.
- **Retail `-Y` orientation and face matching (`tools/bakeHeads.mjs`, `src/formats/mwFaceMatch.js`, `src/formats/mwFirstPerson.js`):** `HEAD_FORWARD = "-y"` rotates exported meshes half round about the crown without mirroring via `partFrame(mesh, basisMap(HEAD_FORWARD, HEAD_UP))` so faces align with retail `-Y` head orientation. `FACE_MATCH_VERSION = 2` measures `headFeatures` along `-Y`; reverting `HEAD_FORWARD` to `+y` flips baked faces backward and invalidates `mwFaceMatch.js` verdicts. Legacy subpaths under `ownModels/`, `formats/morrowind/`, `combat/weapon/`, and `net/peer/` do not exist in the live tree.
