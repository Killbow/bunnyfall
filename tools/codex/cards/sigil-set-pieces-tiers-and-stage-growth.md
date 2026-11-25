---
slug: sigil-set-pieces-tiers-and-stage-growth
title: "Set Piece Records, Worn Counting, Stages, and Catch-Up Growth"
domain: items
kind: subcard
parent: sigil-sets-overview
files:
  - src/items/sigil.js
  - src/items/sigilSets.js
  - src/items/setReach.js
  - src/items/lootRarity.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Sigil-Sets.md#1"
  - "11-Multiplayer/Sigil-Sets.md#2"
  - "11-Multiplayer/Sigil-Sets.md#4"
  - "11-Multiplayer/Sigil-Sets.md#5"
  - "11-Multiplayer/Sigil-Sets.md#set-catchup"
related:
  - sigil-sets-overview
  - aetheric-sets-and-set-powers
  - realm-saves-and-mod-save-hooks
invariants:
  - "`validSigil` requires a whole `party` (1..PARTY_MAX), whole `xp` (0..`SIGIL_XP_MAX`), and a `power` or a `set` or both, never neither."
  - "`wornSetPieces` counts the seven `SET_BODY_SLOTS`, a left-hand shield, and at most one weapon per set (right hand first); pack and wagon pieces never count."
  - "`SIGIL_STAGES` XP thresholds are 0/5000/12500/22500/37500 (Faint, Kindled, Bright, Radiant, Ascendant), opened by Renown 1/10/20/30/40."
  - "`setState` stage = min(lowest worn piece rank, `renownSigilStage(renown)`), or -1 when asleep; tier values interpolate Faint to Ascendant via `stageValue`."
  - "`drinkWorn` gives Renown XP to the held weapon and every counted worn piece once, only while sets are awake."
traps:
  - "The held-back piece is the one with the least XP, not the first lowest-stage piece in slot order (AUDIT SET U3)."
  - "Catch-up: a piece below the recorded reach for its set drinks `CATCH_UP_MULT` (3) times XP up to the XP threshold of that stage only. The reach is the `REACH_PIECES`-th (2nd) best worn rank, never lowered, and saved under the `SigilSetReach` modSaveData vendor."
  - "`rollSetSigil` needs a `SIGIL_BANDS` tier (magic/rare/legendary) and `sigilChance` (200 per mille + 40 per extra fighter); weapon sigils join a world set one time in `SET_WEAPON_JOIN_IN` (3)."
dfu: []
tags:
  - sigil
  - sets
  - stages
  - renown
  - catch-up
---

# Set Piece Records, Worn Counting, Stages, and Catch-Up Growth

Sigil records validate party size, XP, and set or power membership, while worn pieces advance across five Renown-gated stages with catch-up multipliers.

## Record Validation, Rolling, and Slot Counting

- **Validation and rolls (`sigil.js`, `sigilSets.js`, `lootRarity.js`):** `validSigil` requires integer `party` (`1..PARTY_MAX`), integer `xp` (`0..SIGIL_XP_MAX`), and `power`, `set`, or both. `setPieceKind` returns `'armor'`, `'shield'`, `'weapon'`, or `null` (jewelry, clothing, and ammunition are `null`). On `SIGIL_BANDS` drops (`magic`, `rare`, `legendary`), `rollSetSigil` checks `sigilChance` (`200` per mille + `40` per extra fighter) and picks from `WORLD_SET_IDS` (`rollWorldSet`); weapon sigils join a world set one time in `SET_WEAPON_JOIN_IN` (`3`).
- **Worn slots (`sigilSets.js`):** `SET_PLACES` lists nine places: seven `SET_BODY_SLOTS`, shield, and weapon. `wornSetPieces` counts body armor, a left-hand shield, and at most one weapon per set (right hand first); pack and wagon pieces never count.

## Stages and Catch-Up XP

- **Stages (`sigil.js`, `sigilSets.js`):** `SIGIL_STAGES` open at `0/5000/12500/22500/37500` XP (Faint, Kindled, Bright, Radiant, Ascendant) at Renown `1/10/20/30/40` (`renownSigilStage`). `setState` sets stage to `min(lowest worn piece rank, renownSigilStage(renown))` (or `-1` when asleep), marks the piece with the least XP as held back, and interpolates values via `stageValue`.
- **Drinking XP (`sigilSets.js`, `setReach.js`):** While awake, `drinkWorn` grants Renown XP once to the held weapon and each counted piece. High-water reach saves the `REACH_PIECES`-th (`2`nd) best worn rank under `SigilSetReach`; pieces below reach drink `CATCH_UP_MULT` (`3`x) XP up to that threshold.
