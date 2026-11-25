---
slug: aetheric-sets-and-set-powers
title: "Aetheric Boss Sets, Drop Chances, and Set Power Hooks"
domain: items
kind: subcard
parent: sigil-sets-overview
files:
  - src/items/aetheric.js
  - src/items/sigilSetPowers.js
  - src/items/sigilSets.js
  - src/items/itemLaw.js
  - src/items/loot.js
  - src/items/rarityTier.js
  - src/net/eliteGates/egPay.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Sigil-Sets.md#3"
  - "11-Multiplayer/Sigil-Sets.md#6"
  - "11-Multiplayer/Sigil-Sets.md#6b"
  - "11-Multiplayer/Sigil-Sets.md#6c"
  - "11-Multiplayer/Sigil-Sets.md#6d"
  - "11-Multiplayer/Sigil-Sets.md#6e"
  - "11-Multiplayer/Sigil-Sets.md#6f"
  - "11-Multiplayer/Sigil-Sets.md#6g"
  - "11-Multiplayer/Sigil-Sets.md#6h"
  - "11-Multiplayer/Sigil-Sets.md#8"
related:
  - sigil-sets-overview
  - dagons-breach-world-boss
  - sea-serpent-world-boss
  - brass-remnant-fight-and-rewards
  - elite-breach-spire-overview
  - starfall-overview
  - witches-festival-wyrd-sister-sales
  - eltheric-ocean-overview
invariants:
  - "`AETHERIC_RECORDS` concatenates REGALIA, `RAID_SET_PIECES`, `SERPENT_SET_PIECES`, `NUMIDIUM_SET_PIECES`, `PANOPLY_SET_PIECES`, `WYRD_SET_PIECES`, `STARSPUN_SET_PIECES`, `ELTHERIC_SET_PIECES`; `mintAetheric` mints a record whole."
  - "`validSetMarks` (used by src/items/loot.js and src/items/itemLaw.js) rejects a set sigil on a non-piece, a power on a non-weapon, an Aetheric set on a non-Aetheric item, and affixes above the record."
  - "Aetheric is never in `ROLLED_TIERS` (magic, rare, legendary); it is a stamped tier only (`stampedTier`)."
  - "Drop chances: `REGALIA_CHANCE` 1/6, `RAID_SET_CHANCE` 1/4 (and `SERPENT_SET_CHANCE`, `STARSPUN_SET_CHANCE`), `NUMIDIUM_SET_CHANCE` 1/3, `ELTHERIC_CHANCE` per source/band table."
traps:
  - "`REGALIA_FIRE_RESIST` is 10 per piece (lowered from band top so two pieces no longer reach fire immunity)."
  - "Blows with zero damage never trigger set procs (`sigilSetPowers.js`), and `target.warded` (the gate Warden's stand-in) turns blows whole."
  - "World-boss blows (`setBossStruck`, Brass Remnant) carry no enemy mark, so only Gearward answers them. Spire blows (`setSpireStruck`) wake only Shed Skin and Reprieve."
  - "In an Elite Breach (`setSpireRecovery`), Unbroken, The Hour Turns, Shed Skin, and Reprieve recover at the next Redoubt (`spireRedoubtTaken`), not on their timers. Mephala's Veil keeps its own timer and wakes even at the 1-HP full-health guard."
  - "Off-hand partial-weight blows do not lay Bound in Silk strands."
dfu: []
tags:
  - aetheric
  - sets
  - boss-loot
  - set-powers
  - procs
---

# Aetheric Boss Sets, Drop Chances, and Set Power Hooks

Aetheric sets are fixed-template rewards minted whole from boss, raid, Spire, festival, and sea encounters, paired with guarded combat hooks in `src/items/sigilSetPowers.js`.

## Aetheric Catalog, Drop Chances, and Validation

- **Stamped catalog (`aetheric.js`, `rarityTier.js`, `egPay.js`):** `Aetheric` sits outside `ROLLED_TIERS` (`magic`, `rare`, `legendary`) as a `stampedTier` adding `AETHERIC_WORTH` (`2500` gold). `AETHERIC_RECORDS` concatenates Regalia (`ruhn`, with `REGALIA_FIRE_RESIST = 10`), `RAID_SET_PIECES` (`oath`, `thieftaker`, `orcsbane` via `raidSetOf`), `SERPENT_SET_PIECES` (`coilscale`), `NUMIDIUM_SET_PIECES` (`numidium`), `PANOPLY_SET_PIECES` (`panoply`, `EG_PANOPLY_IDS`), `WYRD_SET_PIECES` (`wyrd`), `STARSPUN_SET_PIECES` (`starspun`), and `ELTHERIC_SET_PIECES` (`eltheric`). `mintAetheric` mints each record whole.
- **Drop odds and validation (`aetheric.js`, `itemLaw.js`, `loot.js`):** Drops use `REGALIA_CHANCE` (`1/6`), `RAID_SET_CHANCE` (`1/4`), `SERPENT_SET_CHANCE` (`1/4`), `STARSPUN_SET_CHANCE` (`1/4`), `NUMIDIUM_SET_CHANCE` (`1/3`), and `ELTHERIC_CHANCE`. `validSetMarks` rejects set sigils on non-pieces, powers on non-weapons, Aetheric sets on non-Aetheric items, and affixes above the record.

## Set Power Guards and Encounter Doors

- **Hit guards (`sigilSetPowers.js`):** Zero-damage blows never fire set procs, `target.warded` turns blows whole, and off-hand partial-weight blows never lay Bound in Silk strands.
- **Encounter doors (`sigilSetPowers.js`, `sigilSets.js`):** Enemyless world-boss blows (`setBossStruck`) wake only Gearward; Spire blows (`setSpireStruck`) wake only Shed Skin and Reprieve. Under `setSpireRecovery`, Unbroken, The Hour Turns, Shed Skin, and Reprieve recover at `spireRedoubtTaken` instead of timers, while Mephala's Veil keeps its timer and wakes at the 1-HP full-health guard. `setSetPowersAllies` routes ally casts for Battlemage's Reprieve, and `captainsDue` exposes the Eltheric ship bonus.
