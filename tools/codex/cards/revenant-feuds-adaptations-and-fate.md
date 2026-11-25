---
slug: revenant-feuds-adaptations-and-fate
title: "Revenant Feuds, Adaptations, and Fate"
domain: ai
kind: subcard
parent: feud-telegraphs-and-revenants
files:
  - src/revenants/feudLedger.js
  - src/combat/blowTaken.js
  - src/combat/harmMark.js
  - src/revenants/revenant.js
  - src/revenants/revenantFeud.js
  - src/revenants/revenantFate.js
  - src/revenants/revenantUnquiet.js
  - src/revenants/unquietMark.js
  - src/characters/exteriorFoes.js
  - src/scenes/dungeonContext.js
  - src/magic/hostMagic.js
  - src/magic/effects.js
replacesBible:
  - "12-Enhanced-AI/Feud-Arc.md#feud-ledger"
  - "12-Enhanced-AI/Feud-Arc.md#adaptations"
  - "12-Enhanced-AI/Feud-Arc.md#fate"
related:
  - feud-telegraphs-and-revenants
  - enemy-telegraphs-poise-and-punish
  - revenant-lairs-thefts-and-companions
  - combat-formulas-and-power-ceiling
invariants:
  - "Only special enemies >= level 3 (excluding Watch, `PlayerAlly`, quest, summons, bout, and wild enemies) carrying the unquiet mark (`UNQUIET_MARK` = 0.25) may become new revenants while fewer than `REVENANT_MAX` (3) hunt the player."
  - "Adaptations learn at most one entry per deed from >= 40% scar share (routed prioritized first, career-resisted elements blocked) capped at `min(rank, 3)`, and `adaptEdge` never reduces damage matching the weakness."
  - "From `WILL_RANK` (2), unbroken revenants tear away at 1 HP instead of kneeling; breaking will requires hitting the weakness or accumulating `WILL_STAGGERS` (1) stagger or perfect dodge (Dread never tears away)."
  - "From `LAST_STAND_RANK` (3), the first lethal hit triggers a 1.2 s invulnerable roar (clearing `ai.fleeLeft`), restores 30/35/40% HP (Dread receives a second last stand at 25% HP), and enables `PHASE_TWO` buffs."
  - "`ownersWholeKill` (the player's own Disintegrate or whole-health blow) bypasses last stand and unbroken will, forcing an immediate yield rather than instant deletion."
traps:
  - "Elemental adaptations (+25 via `registerEntityFold`) replaced the original +50 design because DFU `savingThrow` starts at 50 and hits 0% damage at 100 before the 95% cap; elemental weaknesses add -50 instead."
  - "Rank progression under Unquiet is asymmetric: surviving deeds (non-unbroken escapes, slips, and player routs) always rank up, tear-aways rank up every `TEAR_RANK` (2), and kills or ally fellings rank up every `BLOOD_RANK` (2)."
  - "In online dungeon rooms, shared room enemies (`isRoomFoe`) skip last stand and yield or fate logic on lethal hits."
tags:
  - revenants
  - feud-ledger
  - adaptations
  - weakness
  - last-stand
  - fate
---

Revenants track fight deeds in `feudLedger.js`, learn resistances in `blowTaken.js`, and resolve kneeling fates in `revenantFate.js`.

## Scaling, Escape, and Signatures

Active revenants gain `REVENANT_HEALTH_PER_RANK` (0.4), `REVENANT_DAMAGE_PER_RANK` (0.15), and `REVENANT_LEVEL_PER_RANK` (3 for class enemies). Flight triggers at 0.35 HP on a 0.5 roll for marked candidates (2.5 pace), 0.35 HP on 0.8 for `rank < 2`, and 0.2 HP on 0.35 for `rank >= 2`. Escapes resolve past 45 m or beyond 12 m after 8 s; Unquiet escape crafts (`smoke`, `blink`, `sink`, and `bolt`) unlock at `CRAFT.RANK` (2).

Signatures unlock at `SIG_RANK` (2) and gain iron at `SIG.IRON_RANK` (3), dealing x2.0 damage every 12 to 18 s (pitch 0.7); non-martial kinds cast `pyreSpell` (3 to 6 plus 1 per level). `PHASE_TWO` applies x1.2 blows, +20 speed, x0.85 wind-up, x0.7 cooldown, `chainMax` 2, 0.5 iron share, and x1.1 size.

## Weaknesses and Wounds

Weaknesses apply `WEAK.STRUCK` (1.5), `WEAK.DAYLIGHT` (1.25 for daylight hits and spells), and `WEAK.RESIST` (-50). `weakKnown` steps `0 -> 1` on a sub-50% HP flinch or 2/3 rumors, and `-> 2` on a weak blow or 1/3 rumors. Up to `WOUND.MAX` (3) wounds heal oldest first every 5 days: `bled` (x0.9 HP), `cracked` (x0.7 poise), `maimed` (x0.9 blows), `lamed` (-15 speed), and elemental (-15 resist).
