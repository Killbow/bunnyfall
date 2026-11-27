---
slug: "classic-enemy-motor-attack-and-targets"
title: "Classic Enemy Motor, Attack Timing, Casting, and Targets"
domain: "ai"
kind: "subcard"
parent: "enemy-ai-navmesh-and-combat-tactics"
files:
  - "src/characters/enemyMotor.js"
  - "src/characters/enemyAttack.js"
  - "src/characters/enemyCasting.js"
  - "src/characters/enemyTargets.js"
  - "src/characters/enemySounds.js"
  - "src/characters/mobileUnit.js"
routes: []
tables: []
replacesBible: []
related:
  - "enemy-ai-navmesh-and-combat-tactics"
  - "enhanced-ai-arc-overview"
  - "attack-tokens-engage-rings-and-enemy-retreat"
invariants:
  - "The ranged spell pick happens inside the band condition, before the 1/40 cast roll. The stored `selectedSpell` feeds the motor's stand-off band, so the already-on-target veto applies to the band, not only the cast."
  - "`blockedByIllusionEffect` rolls dice only for a concealed target. DFU rolls none for an unconcealed one, so the roll sequence must stay unchanged."
  - "Per classic tick the order is spawn-band recompute, target machine, then `_classicPostTarget`, which holds the illusion re-roll and the `lastHadLOSTimer` decrement. A tick with no target runs neither, so the timer freezes."
  - "The `giveUpTimer` refill and decrement run in `_step` outside the CanAct-gated decision, so a knocked-back or paralyzed enemy still runs down its blind-pursuit window."
  - "`stopDistance` is set before `_getDestination` in the classic TakeAction path, because the search ramp reads it. It is the player melee distance for the player and `CLASSIC_MELEE_DISTANCE_VS_AI` for other targets."
  - "`resolveGender` draws from the shared classic random stream directly, not from an injectable roll. A human enemy with unspecified gender is male on an even draw, and monsters stay unspecified."
  - "`wireRecipient` spells a target on the wire as `.` for the local player, the peer id for a peer, and an empty string for none. Every pool that streams a blow or cast target must use it."
traps:
  - "`EnemyAttack` draws one `DFRandom` byte on every classic tick, including mid-swing and for bow enemies, as the left operand of the melee check. Gating the draw shifts the shared stream for every later consumer."
  - "While `paused` (a transforming Seducer), the attack component steps its swing machine but skips the melee timer and the `DFRandom` draw. Drawing there desyncs the shared stream."
  - "`resetMeleeTimer` runs after every melee decision, even when the state change did nothing. A decision landing mid-swing only re-arms the timer, and one landing mid-bow-release cuts the release short and starts the strike."
  - "A silenced enemy still draws the touch spell pick before `SetReadySpell` refuses. The shared melee timer is then left alone for the ordinary swing, since the reset runs only after a successful ready."
  - "`_fallCheck` skips the fall test when `_obstacleCheck` has found an obstacle, an upward slope, or a door, so `_obstacleCheck` must run first."
  - "The ranged attack branch runs before the detour branch, so an archer in band with the target in sight holds its distance and shoots while an obstacle detour timer decays, instead of walking the detour."
  - "`volumeScale` changes only when an attract sound plays, so `attack()` reuses the last attract volume, and an enemy that never played one attacks at full volume. This matches the original game."
  - "`staticTeamOf` reads the static `ENEMY_BASICS` row, not the instance team, because a summoned ally's own copy is already `PlayerAlly` and a struck ally would never turn hostile."
  - "The player is walked after the other candidates, so the player loses priority ties to enemies. A caller that carries peers puts `PLAYER_TARGET` in the list itself, so peers walk after the local player."
  - "`setPlayerBout` stores the driver's own bout object, not a copy, because the driver changes `out` and `hold` while the bout runs and a copy would leave an eliminated player targeted."
  - "`enemyTransformPoint` is the point missile aim is measured from, even for arrows. Arrows leave from the separate `enemyArrowOrigin`, so the two points differ by design and must not be merged."
  - "On the classic path a seen secondary target sets `lastKnownTargetPos` to the origin, so pursuit starts at the world origin, as the original game does because it never stores a secondary position there."
  - "The step that makes the held target also target this enemy must stay outside the senses-gate branch, because `targetSenses` persists between ticks and a rejected tick still recruits the target it holds."
  - "The spell branch of `stateAnims` has no ghost or wraith special case, so they cast over the primary attack records. This matches the original game."
dfu: []
tags:
  - "enemy-motor"
  - "enemy-attack"
  - "dfrandom"
---

# Classic Enemy Motor, Attack Timing, Casting, and Targets

The classic (non-enhanced) enemy path ports DFU `EnemyMotor`, `EnemySenses`, `EnemyAttack`, and the ranged and touch spell decisions. Distances, timers, and rolls follow the source so the shared `DFRandom` stream stays in step across every consumer.

- **Motor tick (`src/characters/enemyMotor.js`):** spawn bands, the target machine, then the post-target step, with obstacle, fall, and detour checks.
- **Attacks and casting (`src/characters/enemyAttack.js`, `src/characters/enemyCasting.js`):** the melee timer, the swing machine, and the touch and ranged spell picks.
- **Targets (`src/characters/enemyTargets.js`):** candidate walk order, team checks, and the wire spelling of a target.
- **Animation and sound:** `src/characters/mobileUnit.js` and `src/characters/enemySounds.js`.
