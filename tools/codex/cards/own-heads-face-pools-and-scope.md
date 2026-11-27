---
slug: "own-heads-face-pools-and-scope"
title: "Own Heads Face Pools: Player Eligibility, Portrait Table, and Fallbacks"
domain: "characters"
kind: "subcard"
parent: "own-heads-overview"
files:
  - "src/formats/mwFirstPerson.js"
  - "src/formats/mwFaceTable.json"
  - "src/combat/fpArm.js"
  - "src/combat/weaponRig.js"
  - "src/net/peerBodies.js"
  - "src/characters/npcBodies.js"
  - "src/characters/wardrobe.js"
  - "src/tools/mwViewer.js"
  - "src/scenes/world.js"
  - "src/scenes/exterior.js"
  - "src/scenes/worldModes.js"
  - "src/scenes/dungeonContext.js"
  - "src/characters/roxArgonians.js"
routes: []
tables: []
replacesBible:
  - "04-Characters/Own-Heads.md"
related:
  - "own-heads-overview"
  - "characters-paperdoll-and-bodies"
invariants:
  - "`facePools(parts, race, female, { has, own })` (`src/formats/mwFirstPerson.js`) substitutes custom Breton male heads and hairs all-or-none only when `own` is requested and `archiveHas` (`src/combat/fpArm.js`) confirms all six meshes exist."
  - "Only `src/combat/weaponRig.js` (`ownHeads: true`) and `src/net/peerBodies.js` (`playerBuildOpts`) request `ownHeads`; NPC, escort, portrait, and kin bodies never enable it."
  - "`FACE_INDEX_MAX` (`src/characters/roxArgonians.js`) is the bound `src/net/wire.js` applies to a received `faceIndex`. Adding faces to any race must raise it, or the wire clamps the new faces away."
traps:
  - "`npcFaceOf` (`src/characters/wardrobe.js`) seeds always index Morrowind data pools."
  - "Vampire Breton men keep the retail vampire head (`b_v_breton_m_head_01`) while pairing it with custom hair."
dfu: []
tags:
  - "face-pools"
  - "player"
  - "peer"
  - "fallback"
---

# Own Heads Face Pools: Player Eligibility, Portrait Table, and Fallbacks

Custom Breton male face substitution runs through `facePools` in `src/formats/mwFirstPerson.js` and curated portrait pairings in `src/formats/mwFaceTable.json`, restricted strictly to player and remote peer rigs.

- **All-or-none pool substitution (`src/formats/mwFirstPerson.js`, `src/combat/fpArm.js`):** `facePools(parts, race, female, { has, own })` substitutes custom Breton male heads and hairs all-or-none only when `own` is requested and `archiveHas` confirms all six custom meshes exist. Vampire Breton men keep the retail vampire head (`b_v_breton_m_head_01`) while pairing it with custom hair.
- **Player-only scope (`src/combat/weaponRig.js`, `src/net/peerBodies.js`, `src/characters/npcBodies.js`, `src/characters/wardrobe.js`):** `playerBodyRows(..., { has, ownHeads })` wires `facePools` across `src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/worldModes.js`, and `src/scenes/dungeonContext.js`. Only `weaponRig.js` (`ownHeads: true`) and `peerBodies.js` (`playerBuildOpts`) request `ownHeads`; NPC, escort, portrait, and kin bodies never enable it, and `npcFaceOf` seeds always index Morrowind data pools.
- **Curated portrait table (`src/formats/mwFaceTable.json`, `src/tools/mwViewer.js`):** `mwFaceTable.json` curates ten Breton male portraits (such as portrait `6` pairing `h0411` with hair `01`), bypassing runtime face matching when both head and hair resolve from the table.
