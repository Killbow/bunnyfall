---
slug: balance-arc-reflection-leech-and-arcane-caps
title: "Reflection, Leech, and Arcane Loot Caps"
domain: combat
kind: subcard
parent: balance-arc-overview
files:
  - src/items/lootPowers.js
  - src/player/playerDoor.js
  - src/items/sigilSetPowers.js
  - src/items/lootRarity.js
  - src/magic/spellPower.js
  - src/magic/effects.js
  - src/characters/skillSoftcap.js
  - src/magic/hostMagic.js
  - src/characters/powerCeiling.js
replacesBible:
  - "05-Combat/Balance-Arc.md"
related:
  - balance-arc-overview
  - combat-formulas-and-power-ceiling
  - economy-ledger-and-item-judge
invariants:
  - "`paidBack(f, n)` returns `Math.min(n, Math.ceil(health) - 1)` for any attacker with finite health so thorns and Spite of the Spurned never deal a killing blow; records without finite health take `n` unchanged."
  - "Per-wearer loot and sigil totals clamp at `THORNS_CAP = 10`, `LEECH_CAP = 10` (weapon affixes plus socketed gems), `POTENCY_CAP = 30`, `SPELL_POWER_MOST = 50`, and `WELLSPRING_CAP = 10` (percentage of maximum magicka restored per kill)."
  - "`RARE_FLAVOURS` entries marked `retired` (Troll Blood regeneration and Vampiric Effect) are excluded from new `rareFlavour` rolls in `src/items/lootRarity.js` but remain in the table so existing saved items stay valid."
  - "`schoolPotency` (`src/characters/skillSoftcap.js`) adds `DESTRUCTION_POTENCY_PER_POINT = 0.01` per effective Destruction point above `100`, up to `1.4x` at effective skill `140`."
  - "`UNCHALLENGED_MAGIC_WEIGHT = 0.25` sets the floor for uncontested spell training, whereas landing a spell on a non-allied enemy calls `noteSkillChallenge` (`src/magic/hostMagic.js`) to raise the training weight against stronger targets."
traps:
  - "Never delete `retired` entries from `RARE_FLAVOURS`; persisted player inventories and account items still resolve their flavor definitions from that array."
  - "Per-stat arcane caps (`POTENCY_CAP`, `SPELL_POWER_MOST`, `THORNS_CAP`, `LEECH_CAP`, and `WELLSPRING_CAP`) clamp wearer totals before the composite `BLOW_MOST` and `GUARD_LEAST` ceilings in `src/characters/powerCeiling.js` run."
tags:
  - balance
  - thorns
  - leech
  - loot-caps
  - destruction
  - spell-potency
---

Itemized reflection, life leech, and arcane spell multipliers enforce strict per-wearer ceilings, non-lethal thorns damage, retired sustain affixes, and Destruction potency scaling past skill 100.

## Non-Lethal Reflection, Leech, and Retired Affixes

`paidBack(f, n)` (`src/items/lootPowers.js`, applied in `src/player/playerDoor.js` and `src/items/sigilSetPowers.js`) clamps reflected damage to `Math.min(n, Math.ceil(health) - 1)` whenever the attacker has finite health, ensuring thorns and Spite of the Spurned leave targets at `1` HP minimum. Total reflected damage caps at `THORNS_CAP = 10` (reduced from `25`), and combined life steal from weapon affixes plus socketed gems caps at `LEECH_CAP = 10` (down from `17%` on an Exalted line paired with a Perfect Emerald).

In `src/items/lootRarity.js`, `RARE_FLAVOURS` marks Troll Blood regeneration and Vampiric Effect as `retired`. `rareFlavour` skips retired entries during loot generation, while keeping their definitions intact for existing items. `ARCANE_LEGENDARIES` exports a frozen list shared with `server-account/src/service.js`.

## Arcane Caps, Destruction Potency, and Training Weight

Equipment spell bonuses clamp at `POTENCY_CAP = 30`, `SPELL_POWER_MOST = 50` (`src/magic/spellPower.js`), and `WELLSPRING_CAP = 10` percent magicka restored on kill before composite `powerCeiling.js` bounds apply. For Destruction skills above `100`, `schoolPotency` (`src/characters/skillSoftcap.js`) adds `DESTRUCTION_POTENCY_PER_POINT = 0.01` per point up to `1.4x` at `140`, applied through `casterDamageScaled` (`src/magic/effects.js`). Casting without opposition trains at `UNCHALLENGED_MAGIC_WEIGHT = 0.25`, while hitting a non-allied enemy invokes `noteSkillChallenge` (`src/magic/hostMagic.js`).
