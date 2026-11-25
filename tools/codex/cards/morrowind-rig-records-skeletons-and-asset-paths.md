---
slug: "morrowind-rig-records-skeletons-and-asset-paths"
title: "Body-Part Records, Skeleton Choice, and Asset Path Correction"
domain: "characters"
kind: "subcard"
parent: "morrowind-first-person-rig-overview"
files:
  - "src/formats/mwFirstPerson.js"
  - "src/formats/mwTexture.js"
  - "src/formats/mwEsmFile.js"
  - "src/formats/mwBsaFile.js"
  - "src/formats/mwNpc.js"
  - "src/combat/fpArm.js"
routes: []
tables: []
replacesBible:
  - "02-Formats/Morrowind-Rules.md"
related:
  - "morrowind-first-person-rig-overview"
  - "morrowind-npc-bodies-overview"
  - "werewolf-body-overview"
invariants:
  - "A first-person part is chosen by its BODY record (the ID ending in .1st), never by splicing .1st into a mesh filename. Only hand, wrist, forearm and upper-arm slots fall back to the third-person record."
  - "fpSkeletonPath picks werewolf first, then beast, then female, then male: meshes/wolf/skin.1st.nif, meshes/base_animkna.1st.nif, meshes/base_anim_female.1st.nif, meshes/xbase_anim.1st.nif."
  - "correctActorModelPath adds the x prefix only when the matching .kf exists in the archive."
  - "Short subrecords are refused rather than read past: WPDT < 32 bytes, LHDT < 24 bytes, RADT under 140 bytes."
traps:
  - "WPDT mType is int16 at byte 8 and mHealth is uint16 at byte 10. MW-D22 fixed a reader and fixture that had both assumed byte 10."
  - "Retail Nord male hands are b_n_nord_m_hands.1st (plural), so name-guessing fails."
  - "meshes/base_anim.1st.nif is listed only as the name the reverted rig hardcoded."
dfu: []
tags:
  - "esm"
  - "bsa"
  - "bodypart"
  - "skeleton"
  - "texture-path"
---

# Body-Part Records, Skeleton Choice, and Asset Path Correction

Archive headers, ESM subrecords, first-person `BODY` lookups, skeleton selection, and resource path rewriting govern how Morrowind rig assets load (`src/formats/mwFirstPerson.js`, `src/formats/mwTexture.js`, `src/formats/mwEsmFile.js`, `src/formats/mwBsaFile.js`, `src/formats/mwNpc.js`, and `src/combat/fpArm.js`).

- **Archives and subrecord guards (`mwBsaFile.js`, `mwEsmFile.js`, `mwFirstPerson.js`):** BSA archives validate a 12-byte header with magic `0x100`, while ESM strings decode as `windows-1252`. Readers refuse truncated subrecords (`WPDT` under 32 bytes, `LHDT` under 24 bytes, and `RADT` under 140 bytes). In `WPDT`, `mType` is `int16` at byte 8 and `mHealth` is `uint16` at byte 10. `MW_LIGHT_CARRY = 0x2` and `MW_LIGHT_FIRE = 0x10` filter `pickTorchRecord` and `pickLanternRecord`, and `BODY` flag bit 1 marks `BPF_Female`.
- **Body records and skeletons (`mwFirstPerson.js`, `fpArm.js`, `mwTexture.js`):** First-person parts resolve by `BODY` record ID ending in `.1st` (such as plural `b_n_nord_m_hands.1st`), never by splicing `.1st` into mesh paths; only hand, wrist, forearm, and upper-arm slots fall back to third-person records. `fpSkeletonPath` selects `meshes/wolf/skin.1st.nif`, `meshes/base_animkna.1st.nif`, `meshes/base_anim_female.1st.nif`, or `FP_BASE_MODEL = 'meshes/xbase_anim.1st.nif'` (`FP_CLIP_PATH = 'meshes/xbase_anim.1st.kf'`). `correctActorModelPath` prepends `x` only when the matching `.kf` exists, while `correctTexturePath` (`correctResourcePath`) re-roots under `TEXTURE_TOP_LEVEL` (`['textures', 'bookart']`), swaps to `.dds`, and substitutes an 8x8 magenta warning texture on misses.
