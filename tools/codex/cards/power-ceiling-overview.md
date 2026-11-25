---
slug: power-ceiling-overview
title: "Power Ceiling: Rarity Ladder Bounds and Composite Blow and Guard Caps"
domain: combat
kind: overview
parent: null
files:
  - src/characters/powerCeiling.js
  - src/items/lootRarity.js
  - src/characters/entityMods.js
  - src/characters/playerEntity.js
  - src/characters/martialPowers.js
  - src/combat/blowTaken.js
  - src/net/firmament/firmamentLaw.js
  - tools/powerCeiling.mjs
  - selfhost/upstream-ci/workflows/account-deploy.yml
routes: []
tables: []
replacesBible:
  - "05-Combat/Power-Ceiling.md"
related:
  - power-ceiling-set-catchup
  - combat-formulas-and-power-ceiling
  - loot-rarity-ladder-overview
  - loot-rarity-affix-lines-and-armor-lean
  - firmament-budget-caps-and-powers
invariants:
  - "`RARITY_ORDER` (`src/items/lootRarity.js`) fixes seven rungs (`common`, `magic`, `rare`, `legendary`, `aetheric`, `artifact`, `gilded`), and `validAffix` rejects rolled affix values above the `legendary` band ceiling in `AFFIX_RANGES`."
  - "`BLOW_TOPS = { sigil: 12, sets: 200, loot: 240, firmament: 50, mastery: 80, martial: 40 }` caps composite damage at `BLOW_MOST` (`43.18x`), while `GUARD_TOPS = { loot: 55, sets: 50, firmament: 15, martial: 30, arcane: 20 }` floors kept damage at `GUARD_LEAST` (`10.71%`)."
  - "`blowRoom` and `guardRoom` (`src/characters/powerCeiling.js`) clamp each registry strictly at its own cap without borrowing room from sibling registries."
traps:
  - "Inspect `item.rarity` directly on minted items rather than `rarityOf` so an unrecognized rung cannot masquerade as a lower rung."
  - "Registry keys absent from `BLOW_TOPS` receive zero room, and flat reductions, ward pools, health caps, and full dodges sit outside `GUARD_LEAST`."
dfu: []
tags:
  - power-ceiling
  - horizontal-progression
  - rarity
  - blow
  - guard
---

# Power Ceiling: Rarity Ladder Bounds and Composite Blow and Guard Caps

`src/characters/powerCeiling.js` and `src/items/lootRarity.js` bound horizontal progression across item affixes, sigil sets, Firmament stars, and martial paths, verified statically by `tools/powerCeiling.mjs`.

- **Rarity Ladder and Affix Bounds (`src/items/lootRarity.js`):** `RARITY_ORDER` fixes seven rungs (`common`, `magic`, `rare`, `legendary`, `aetheric`, `artifact`, and `gilded`), and `validAffix` rejects rolled values exceeding the `legendary` maximum in `AFFIX_RANGES`. Auditors inspect `item.rarity` directly on minted items rather than `rarityOf` so unrecognized rungs cannot masquerade as lower tiers. For affix line weights and folding, see `loot-rarity-affix-lines-and-armor-lean`.
- **Composite Blow and Guard Registries (`src/characters/powerCeiling.js`, `src/characters/entityMods.js`, `src/characters/playerEntity.js`, `src/combat/blowTaken.js`):** `BLOW_TOPS` (`{ sigil: 12, sets: 200, loot: 240, firmament: 50, mastery: 80, martial: 40 }`) bounds composite damage at `BLOW_MOST` (`43.18x`), while `GUARD_TOPS` (`{ loot: 55, sets: 50, firmament: 15, martial: 30, arcane: 20 }`) floors kept damage at `GUARD_LEAST` (`10.71%`). `blowRoom` and `guardRoom` clamp each registry strictly at its own ceiling without borrowing room from siblings (matching `MARTIAL_BLOW_MOST = 40` in `src/characters/martialPowers.js` and `BLOW_TOTAL_CAP = 50` in `src/net/firmament/firmamentLaw.js`; see `firmament-budget-caps-and-powers`). `weaponBlowMods` and `playerDamageMods`/`hurtPlayer` open and close composite products; flat reductions, wards, health caps, and full dodges sit outside `GUARD_LEAST`.
- **Static Audit and Catch-Up (`tools/powerCeiling.mjs`, `selfhost/upstream-ci/workflows/account-deploy.yml`):** `tools/powerCeiling.mjs` audits `FIELD_ROLES`, `powerNumbers`, `PATH_FIELD_ROLES`, `pathNumbers`, and `skyNumbers`, while `account-deploy.yml` watches `lootRarity.js`, `powerCeiling.js`, and `setReach.js`. See `power-ceiling-set-catchup` and `combat-formulas-and-power-ceiling`.
