---
slug: weapon-technique-roster-and-affix-line
title: "Technique Roster, Affix Line, and Item Law"
domain: items
kind: subcard
parent: weapon-techniques-overview
files:
  - src/combat/technique/techniqueRoster.js
  - src/items/lootRarity.js
  - src/items/rarityTier.js
  - src/items/itemLaw.js
  - src/characters/testRoom.js
  - src/characters/martialPaths.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Weapon-Techniques.md"
related:
  - weapon-techniques-overview
  - economy-ledger-and-item-judge
  - integrity-item-law-holds-and-wealth-budget
invariants:
  - "`techniquePass` rolls at the very end of a loot door; only `ROLLED_TIERS` (`magic`, `rare`, and `legendary`) are eligible, and a piece holds at most one technique line (`techniqueEligible`)."
  - "`TECHNIQUE_PER_MILLE` is `120` for magic, `300` for rare, and `450` for legendary."
  - "`TECHNIQUE_BANDS` are `[5, 15]` for magic, `[15, 30]` for rare, and `[30, 50]` for legendary percent; `techniqueMult(base, value) = base * (1 + value / 100)`."
  - "`AFFIX_WORTH.technique` is `30` gold per point."
  - "A technique line is the piece's last own line, placed before any socketed gem line."
  - "`techniqueFamily` maps across `TECHNIQUE_FAMILIES` (`archery`, `longBlade`, `shortBlade`, `axe`, `blunt`, and `handToHand`) by weapon skill, with Gauntlets (template `103`) carrying `handToHand`."
traps:
  - "`ITEM_LAW_VERSION` has moved far past the `2` that `TECH1` set; read the constant rather than hardcoding a version number."
  - "`techniqueFamily` resolves RRI weapon classes even when the RRI switch is off so valid lines are not flagged as forgeries."
  - "Reforge only offers techniques from the same weapon family (`techniqueFits`)."
dfu: []
tags:
  - techniques
  - loot
  - affix
  - item-law
---

`src/combat/technique/techniqueRoster.js` defines the twelve roster entries (`volley`, `pierce`, `leap`, `whirlwind`, `shadowstep`, `lunge`, `cleave`, `execute`, `slam`, `crush`, `kick`, and `haymaker`), their percentage bands, and their family mappings.

## Family Mapping and Roll Bands

`techniqueFamily` maps items by weapon skill: bows map to `archery`, melee weapons map to `longBlade`, `shortBlade`, `axe`, or `blunt`, and Gauntlets (template `103`) map to `handToHand`. To keep item validation consistent in `src/items/itemLaw.js`, `techniqueFamily` resolves custom RRI weapon classes even when the RRI toggle is off.

At the end of loot generation in `src/items/lootRarity.js`, `techniquePass` checks `techniqueEligible` across `ROLLED_TIERS` (`magic`, `rare`, and `legendary` in `src/items/rarityTier.js`). Roll chances in `TECHNIQUE_PER_MILLE` are `120` (magic), `300` (rare), and `450` (legendary). Rolled bonus values follow `TECHNIQUE_BANDS` (`[5, 15]`, `[15, 30]`, and `[30, 50]` percent) and scale the base multiplier via `techniqueMult(base, value) = base * (1 + value / 100)`.

## Ordering, Valuation, and UI Cards

An item carries at most one technique line, stored as the item's last own affix line ahead of any gem line, and valued at `AFFIX_WORTH.technique = 30` gold per point. Reforging checks `techniqueFits` so rerolls stay within the item's family. `techniqueParts`, `techniqueBrief`, and `techniqueCardView` format card text, while `seedTestLoot` and `TECHNIQUE_TEST_BASES` in `src/characters/testRoom.js` spawn one Rare test item per technique.
