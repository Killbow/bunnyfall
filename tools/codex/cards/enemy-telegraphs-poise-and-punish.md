---
slug: enemy-telegraphs-poise-and-punish
title: "Enemy Telegraphs, Poise, and Punish Windows"
domain: ai
kind: subcard
parent: feud-telegraphs-and-revenants
files:
  - src/ai/tells.js
  - src/ai/blowShapes.js
  - src/ai/foeBlows.js
  - src/ai/tactics.js
  - src/combat/blowTaken.js
  - src/combat/blowEffects.js
  - src/characters/mobileUnit.js
  - src/characters/enemyMotor.js
  - src/characters/enemyAttack.js
  - src/player/motor.js
  - src/combat/formulas.js
  - src/combat/hostCombat.js
  - src/magic/hostMagic.js
  - src/characters/cityGuards.js
  - src/render/foeTelegraph.js
  - src/render/telegraphStyle.js
  - src/ui/hudFoeTarget.js
  - src/ui/enhancedHud.js
  - src/ui/hitNumbers.js
replacesBible:
  - "12-Enhanced-AI/Feud-Arc.md#tell"
related:
  - feud-telegraphs-and-revenants
  - revenant-feuds-adaptations-and-fate
  - feud-online-wire-and-revenant-ui
  - enemy-ai-navmesh-and-combat-tactics
  - combat-formulas-and-power-ceiling
invariants:
  - "Wind-up poise equals `max` of `POISE_FLOOR_MASSIVE` (when massive) and `(maxHealth / healthMult) * W`, multiplied by `poiseSpecial(entity)`, where `W` is 0.2, 0.3, 0.4, or 0.5 at classic weight bounds 200, 700, and 1500."
  - "Hits during `windup` suppress knockback and `Hurt` while adding `damage * K * backMult * weakMult` to poise; iron blows and `staffBoss` entities ignore poise accumulation and return `hold`."
  - "Poise break staggers for 0.8 to 1.4 s (x1.25 damage taken, x1.5 withheld knockback, 3 s `STAGGER_IMMUNE`); breaking poise during `STAGGER_IMMUNE` cancels the wind-up to `wait` with plain x1 knockback."
  - "Missed non-aimed blows open an `overreach` window (0.8 to 1.4 s, +0.3 s if iron, x1.5 on perfect dodge) taking x1.3 damage; the first landed hit outside `STAGGER_IMMUNE` staggers the enemy."
  - "At most one active wind-up within `BLOW_NEAR` (20 m) targets the same feet; chains count as one blow and delay `overreach` until the last hit (`chainMax` 1 normally, 2 in phase two)."
traps:
  - "`src/ai/tactics.js` `s.state` values are `wait`, `engage`, `swing`, `recover`, `backoff`, `windup`, `dash`, `chain`, `overreach`, and `staggered`; `roar` and `leap` run inside `windup` rather than separate FSM states."
  - "`fitBlowToGround` and cliff-safe push checks use `Collider.surfaceHit` rather than mesh-only raycast so outdoor heightfield terrain is sampled properly."
  - "Dead players clear queued blow effects and bleeds; climbers, mantlers, swimmers, and levitators refuse `blowKnockDown` and receive horizontal push instead."
  - "`enhancedHud.js` suppresses the `empty` poise state so `.hud-foepoise` never carries `poise-empty`."
tags:
  - ai
  - telegraphs
  - poise
  - stagger
  - punish
  - combat
---

Enhanced enemies telegraph attacks via `src/ai/tactics.js`, `src/ai/blowShapes.js`, and `src/ai/tells.js`.

## Shapes, Iron Blows, and Feints

Eight shapes define wind-up, reach, and damage: `lunge` (0.7 s, 4.5 m, x1.5), `sweep` (0.8 s, 3.2 m, x1.25), `slam` (0.9 s, 2.0 m, x1.75), `ring` (1.0 s, 1.6 to 4.0 m, x1.5), `charge` (0.9 s, 9.0 m, x1.5), `leap` (1.0 s, 1.8 m, x1.6), `aimed` (0.6 s, x1.4 damage, x1.3 speed), and `pyre` (1.2 s, 2.2 m, 12 m). Iron blows add `TELL_IRON_EXTRA` (+0.2 s) and `PUNISH_IRON` (+0.3 s) for heavy or massive `slam` and `ring`, 1/3 elite blows, half of Steadfast or phase-two revenant blows, and rank 3+ signatures. Feints require `higherTier` blades (1/5 chance, 1/3 for Patient revenants, three-blow gap) and cancel at 0.55 without glint or wind audio.

## Poise, Dodges, and Effects

`blowK` scales poise damage: blunt 1.5, axe 1.25, two-handed 1.15, long blade and claws 1.0, initial spell hit 0.75 (rounds 0), short blade 0.7, hands 0.6, and arrow 0.5, multiplied by `POISE_BACK` (1.5 past 110 deg) and `POISE_WEAK` (2). Exiting between `TELL_LATE` (0.25 s pre-land) and impact grants a perfect dodge (`SOUND.Parry6`, `Perfect`). `BLOW_EFFECT` (`blowEffects.js`) applies push (`lunge`, `charge`), rattle (`slam`, `ring`, `leap`), 30% bleed (`sweep`), and 0.9 s knockdown (iron `slam`, `ring`, `charge`). `foeTelegraph.js` renders ground shapes; `hudFoeTarget.js` tracks targets for `FOE_TARGET_SECONDS` (6 s).
