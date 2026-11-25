---
slug: wild-zone-overview
title: "Wild Zone: Region 16 Cut, Depth Rings, and the Cromwark Override"
domain: multiplayer
kind: overview
parent: null
files:
  - src/world/wildZone.js
  - src/world/wild/cromwark.js
  - src/world/wild/etherWild.js
  - src/scenes/world.js
  - src/characters/exteriorFoes.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Wild-Zone.md"
related:
  - wild-zone-pvp-death-drops-and-remains
  - wild-zone-daily-halls-and-greater-giants
  - wild-zone-travel-strangers-and-zone-limits
  - eltheric-ocean-open-pvp-zone-and-crossing
  - integrity-pvp-duel-and-wild-referees
invariants:
  - "The mountain zone covers region `WILD_REGION` (`16`) clipped by the `WILD_CUT` polygon, excluding `WILD_KEEPOUT_TOWNS` (`['Wrothgaria']`) padded by `WILD_KEEPOUT_PX` (`2`); `buildWildMask` and `wildMaskOf` build the bitmap with a `WILD_NEAR_PX` (`6`) hiding margin."
  - "`wildRingAt` maps pixel depth to rings `1` through `WILD_RINGS` (`4`), named by `wildRingName` (`The Foothills`, `The Passes`, `The High Crags`, and `The Heart`), with `WILD_RING_LOOT` multipliers `[1.25, 1.5, 1.75, 2]`."
  - "`setWildHere(on, ring, kind)` tracks active membership across two zone kinds: `'wroth'` (`WILD_KIND`, the Wrothgarian Mountains) and `'ether'` (`ETHER_KIND`, the Eltheric Ocean)."
  - "`cromwarkPeace(kind)` returns true for `'wroth'` while `CROMWARK_ON` is enabled, disabling mountain PvP, clamping `wildRingLoot` to `1`, and making `applyWildFoe` skip the 4x stat multipliers."
  - "Outside the peace (at sea), `applyWildFoe` scales enemy health and damage by `WILD_FOE_HEALTH_MULT` (`4`) and `WILD_FOE_DAMAGE_MULT` (`4`) times the ring tier."
traps:
  - "Never treat the Wrothgarian Mountains as an active PvP zone without checking `cromwarkPeace(wildZoneKind())` before running stranger, drop, or referee logic."
  - "Wild zones activate only in online play; offline sessions treat region `16` and the ocean as standard Daggerfall territory."
dfu: []
tags:
  - wild-zone
  - pvp
  - cromwark
  - rings
  - region-16
---

Wild-zone membership, depth rings, and the Cromwark peace override live in `src/world/wildZone.js`, `src/world/wild/cromwark.js`, `src/world/wild/etherWild.js`, `src/scenes/world.js`, and `src/characters/exteriorFoes.js`.

## Region 16 Mask, Depth Rings, and Frame Updates

In the Wrothgarian Mountains (`WILD_REGION` = `16`), `buildWildMask` and `wildMaskOf` intersect the region bitmap with the `WILD_CUT` polygon and carve out `WILD_KEEPOUT_TOWNS` (`['Wrothgaria']`) expanded by `WILD_KEEPOUT_PX` (`2` pixels), with `WILD_NEAR_PX` (`6` pixels) as the approach margin. `wildRingAt` assigns each inside pixel to rings `1` through `WILD_RINGS` (`4`), titled `The Foothills`, `The Passes`, `The High Crags`, and `The Heart` (`wildRingName`).

Every online frame, `wildFrame` in `src/scenes/world.js` updates `setWildHere(on, ring, kind)`, announces ring transitions, and refreshes pace caps, stranger markers, and remains for either `'wroth'` (`WILD_KIND`) or `'ether'` (`ETHER_KIND`).

## The Cromwark Peace Override vs. Open-Sea Scaling

While `CROMWARK_ON` is true in `src/world/wild/cromwark.js`, `cromwarkPeace('wroth')` disables open PvP in the mountains (`wildCan()` and `wildIsStranger()` return false). In the Cromwark reach, `applyWildFoe` sets `wildTierMult = 1` and returns before applying `WILD_FOE_HEALTH_MULT` (`4`) or `WILD_FOE_DAMAGE_MULT` (`4`), `wildRingLoot` returns `1` instead of `WILD_RING_LOOT` (`[1.25, 1.5, 1.75, 2]`), and ring depth instead governs Dusk Token drop odds via `nyxCoinChance` (`NYX_COIN_CHANCE` = `[0.01, 0.03, 0.06, 0.12]`). Active enemy caps (`encounterCap` in `src/characters/exteriorFoes.js`) allow `25` enemies in the Cromwark reach versus `MAX_ACTIVE_ENCOUNTER_FOES` (`8`) times `WILD_PACK_MULT` (`4`, or `32`) in an active PvP zone such as the Eltheric Ocean.
