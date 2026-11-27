---
slug: "spell-cost-skill-scaling-and-callers"
title: "Spell Cost Skill Scaling Past 100 and Pricing Callers"
domain: "magic"
kind: "overview"
parent: null
files:
  - "src/magic/spellcost.js"
  - "src/magic/hostMagic.js"
  - "src/magic/spellMaker.js"
  - "src/characters/enemyCasting.js"
  - "src/magic/absorption.js"
  - "src/magic/enchantments.js"
  - "src/platform/onlineLane.js"
  - "src/characters/skillSoftcap.js"
  - "src/characters/masterSkills.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-12c.md"
related:
  - "arcane-school-potency-past-100"
  - "arcane-path-passives-and-signature-riders"
  - "magic-bundles-and-reflection-quirks"
  - "enemy-expansion-encounters-spells-and-combat-hooks"
invariants:
  - "All skill-based spell pricing routes through `skillScaledCost(value, skill, divisor, { online })` in `src/magic/spellcost.js`, with `effectCost` using divisor `400` and `classicCastingCost` using divisor `100`."
  - "Online above `SPELL_COST_SKILL_REFERENCE` (`100`), `skillScaledCost` computes `trunc(value * 10 * 100 / (skill * divisor))` in one division so skill `200` pays half of skill-`100` cost and effects never price below `0`."
  - "Offline, or at `skill <= 100`, `skillScaledCost` preserves classic `trunc(value * (110 - skill) / divisor)`, and `calculateCastCost` clamps total spell point cost to `CAST_COST_FLOOR` (`5`)."
  - "`hostMagic.js`, `spellMaker.js` (`spellMakerCost`), and `enemyCasting.js` call `calculateCastCost`; `absorption.js` (`effectCastingCost`) floors `effectCost` at `CAST_COST_FLOOR`; `enchantments.js` (`spellEnchantPtCost`, `assignHeldSpell`) reads `classicCastingCost`."
  - "A spell record with `minimumCastingCost` costs exactly `CAST_COST_FLOOR` (5) however much its effects price, as DFU sets for vampire clan and lycanthropy spells. Player cost mods and free casts still apply after that."
traps:
  - "Offline past effective skill `110`, classic `(110 - skill)` turns negative and can offset other effects down to `CAST_COST_FLOOR` (`5`), whereas online `100 / skill` prices higher than classic between effective `101` and `110`."
  - "`enemyCasting.js` intentionally prices enemy casts against `playerEntity` skills with `{ portMods: false }`, and `spellMaker.js` `editedEffectCost` displays raw unfloored effect costs."
dfu: []
tags:
  - "magic"
  - "spell-cost"
  - "skills-past-100"
  - "online"
---

# Spell Cost Skill Scaling Past 100 and Pricing Callers

Skill-based magicka pricing for mastered magic schools past `100` routes through `skillScaledCost(value, skill, divisor, { online })` in `src/magic/spellcost.js`, keeping online effect costs positive up to raw skill `200` (`src/characters/masterSkills.js` and `src/characters/skillSoftcap.js`).

- **Classic versus online scaling past 100:** `effectCost` passes divisor `400` and `classicCastingCost` passes divisor `100` to `skillScaledCost`. Offline (`src/platform/onlineLane.js`), or when `skill <= SPELL_COST_SKILL_REFERENCE` (`100`), `skillScaledCost` returns the classic formula `trunc(value * (110 - skill) / divisor)`; offline above effective `110`, `(110 - skill)` becomes negative and can offset other effects in a bundle down to `CAST_COST_FLOOR` (`5`). Online above `100`, `skillScaledCost` switches to `trunc(value * 10 * 100 / (skill * divisor))` in one integer division so effects never price below `0`, skill `200` pays half of skill-`100` cost, and effective skills `101` to `110` price slightly higher than the classic linear drop.
- **Pricing callers and post-skill modifiers:** `calculateCastCost` sums effect costs, applies set bonuses and focus modifiers after the skill term, and floors the total at `CAST_COST_FLOOR` (`5`). `src/magic/hostMagic.js`, `src/magic/spellMaker.js` (`spellMakerCost`, while `editedEffectCost` displays raw unfloored per-effect costs), and `src/characters/enemyCasting.js` (pricing against `playerEntity` skills with `{ portMods: false }`) all call `calculateCastCost`. `src/magic/absorption.js` (`effectCastingCost`) floors `effectCost` at `CAST_COST_FLOOR`, and `src/magic/enchantments.js` (`spellEnchantPtCost`, `assignHeldSpell`) reads `classicCastingCost`.
