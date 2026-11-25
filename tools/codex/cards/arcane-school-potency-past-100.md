---
slug: arcane-school-potency-past-100
title: "School Potency Past 100 and Signature Cast School"
domain: magic
kind: subcard
parent: arcane-specializations-overview
files:
  - src/magic/spellPower.js
  - src/magic/effects.js
  - src/magic/spellcost.js
  - src/magic/hostMagic.js
  - src/characters/skillSoftcap.js
  - src/platform/onlineLane.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Arcane-Specialisations.md"
related:
  - arcane-specializations-overview
  - arcane-path-passives-and-signature-riders
  - balance-arc-reflection-leech-and-arcane-caps
invariants:
  - "`schoolPotency(caster, { online, school })` (src/magic/spellPower.js) returns 1 offline, for non-players, or while `_mentor` is set; otherwise `1 + (climbedSkill - SKILL_SOFT_CAP) * SCHOOL_POTENCY_PER_POINT` with `SCHOOL_POTENCY_PER_POINT = DESTRUCTION_POTENCY_PER_POINT = 0.01`."
  - "`schoolMult` applies potency only through `ownSpellAt` (my spell at a non-player) or, with `self`, `ownSpellOnSelf` (my own cast on myself, not during `sigilDueling()`)."
  - "In effects.js applySpell, `noSchool` forces potency 1 for a worn Cast When Held bundle (`ctx.heldItem`) or a reflected spell."
  - "`castSchool(entity, spell, e)` (src/magic/spellcost.js) wraps `pathCastSchool`, so price, skill tally (`tallySkill` in hostMagic.js), and potency all read the same school."
traps:
  - "A Regenerate entry reads Restoration potency every round, but only if it kept `school` and has no `heldItem`; an entry restored from a save without its caster gets no climb until recast."
  - "The x1.4 ceiling comes from effectiveSkill mapping raw 200 to effective 140 in src/characters/skillSoftcap.js, not from a clamp in schoolPotency."
  - "Below 100 nothing changes: potency is exactly 1 and classic pricing stands."
dfu:
  - EntityEffect.cs
  - CastWhenHeld.cs
tags:
  - spell-potency
  - softcap
  - magic-schools
  - online-only
---

# School Potency Past 100 and Signature Cast School

Mastered magic schools above `SKILL_SOFT_CAP` (100 in `src/characters/skillSoftcap.js`) gain online potency in `src/magic/spellPower.js` and `src/magic/effects.js`, while `src/magic/spellcost.js` unifies signature spell school routing.

- **Online climb formula and ceiling:** `schoolPotency(caster, { online, school })` returns `1` offline (`src/platform/onlineLane.js`), for non-players, at or below 100, or while `_mentor` is set. Above 100 online, it returns `1 + (climbedSkill - SKILL_SOFT_CAP) * SCHOOL_POTENCY_PER_POINT` (`SCHOOL_POTENCY_PER_POINT = DESTRUCTION_POTENCY_PER_POINT = 0.01`). The `x1.4` maximum at raw skill 200 derives from `effectiveSkill` (`src/characters/skillSoftcap.js`) mapping raw 200 to effective 140 rather than an internal clamp.
- **Target gates and school dimensions:** `schoolMult` scales offensive casts only through `ownSpellAt` (local player hitting a non-player enemy) and self-casts through `ownSpellOnSelf` (local player casting on self outside `sigilDueling()`). In `src/magic/effects.js`, `applySpell` sets `noSchool` to force potency `1` on reflected bundles and worn Cast When Held items (`ctx.heldItem`). Potency scales six dimensions: Destruction damage, Restoration heals and Regenerate rounds (re-evaluated each round only when the active effect entry keeps `school` and has no `heldItem`), Alteration Shield pools, Illusion concealment rounds, Thaumaturgy self-ward chance, and Mysticism enemy-effect chances (`Math.min(100, Math.round(chance * k))`).
- **Unified signature cast school:** `castSchool(entity, spell, e)` (`src/magic/spellcost.js`) wraps `pathCastSchool`, aligning out-of-pair effects on a held signature spell to the stronger mastered school of the path pair so magicka cost, `tallySkill` (`src/magic/hostMagic.js`), and `schoolPotency` all read the same school.
