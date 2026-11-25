---
slug: attack-tokens-engage-rings-and-enemy-retreat
title: "Attack Tokens, Engage Rings, Kiting, and Retreat"
domain: ai
kind: subcard
parent: tactics-arc-enhanced-enemy-ai-overview
files:
  - src/ai/tactics.js
  - src/ai/tacticsClock.js
  - src/characters/enemyMotor.js
  - src/characters/enemyAttack.js
  - src/characters/enemyCasting.js
  - src/scenes/frame/streamFrame.js
routes: []
tables: []
replacesBible:
  - "12-Enhanced-AI/Tactics-Arc.md"
related:
  - tactics-arc-enhanced-enemy-ai-overview
  - enemy-telegraphs-poise-and-punish
  - doorway-clearance-and-enemy-spacing
invariants:
  - "Each target board allows at most `TACT.MELEE_TOKENS` 2 melee and `TACT.RANGED_TOKENS` 2 ranged attackers. The rest hold an engage ring at reach + `RING_GAP` 1.5 m +- `RING_SLACK` 0.6 m."
  - "A waiting enemy engages without a token after `PATIENCE` 6 s, when the target comes within reach + 0.9 m (ring - slack), or when the target's back is turned (`BACK_TURNED_DEG` 110) inside ring + slack."
  - "Losing >= `HURT_SHARE` 25% health within `HURT_WINDOW` 3 s backs an enemy off `BACKOFF_GAP` 2 m past the ring for `BACKOFF` 2 s, at most once per `BACKOFF_COOLDOWN` 10 s."
  - "Cowards (`isCoward`: `COWARD_CLASSES` Mage, Sorcerer, Healer, Bard, Burglar, Acrobat, Thief, plus Animal affinity) call `flee` for `FLEE_SECONDS` 8 s below `FLEE_SHARE` 20% health. Undead, daedra, constructs and guards never flee."
  - "Shooters inside `KITE_IN` 6 m kite out to `KITE_OUT` 7 m for at most `KITE_MAX` 2 s, once per `KITE_COOLDOWN` 8 s. When cornered they fight hand to hand for `KITE_CORNERED` 3 s."
traps:
  - "Token holders unseen for `STALE` 1.5 s lose their token; `releaseTactics` must run when an enemy dies or unloads."
  - "A ranged token held for `RANGED_LEASE` 5 s without a shot is handed on."
  - "Call `offsetTactics` on world recenter (streamFrame.js) or the ring positions drift."
dfu:
  - Assets/Scripts/Game/EnemyMotor.cs
tags:
  - ai
  - tactics
  - attack-tokens
  - engage-ring
  - kiting
  - flee
  - tact2
  - tact5
---

# Attack Tokens, Engage Rings, Kiting, and Retreat

In `src/ai/tactics.js`, `tacticsStep(ai, dx, dz)` paces group combat through per-target token boards, engage rings, kiting windows, and retreats clocked by `src/ai/tacticsClock.js`.

- **Tokens and Engage Rings:** Each target board (fed by `noteLocalPlayer(feet, fwd)` and `judgedHere`) grants up to `TACT.MELEE_TOKENS` (`2`) melee and `TACT.RANGED_TOKENS` (`2`) ranged tokens, writing `_tacDir`, `_tacStrike`, `_tacShoot`, and `_tacSkipped` for `src/characters/enemyMotor.js`, `src/characters/enemyAttack.js`, and `src/characters/enemyCasting.js`. Others hold an engage ring at `reach + RING_GAP` (`1.5` m) `+/- RING_SLACK` (`0.6` m) until `PATIENCE` (`6` s) expires, the target enters `reach + 0.9` m (`ring - slack`), or turns its back (`BACK_TURNED_DEG = 110`) inside `ring + slack`. Tokens expire after `STALE` (`1.5` s) unseen, after `RANGED_LEASE` (`5` s) without shooting, or via `releaseTactics`, and `offsetTactics` shifts boards on recenter (`src/scenes/frame/streamFrame.js`).
- **Backoff, Kiting, and Recover Hop:** After a blow, an attacker steps out for `RECOVER_HOP` (`0.4` s). Losing `HURT_SHARE` (`25%`) health within `HURT_WINDOW` (`3` s) triggers a `BACKOFF` (`2` s) retreat `BACKOFF_GAP` (`2` m) past the ring every `BACKOFF_COOLDOWN` (`10` s). Shooters inside `KITE_IN` (`6` m) kite to `KITE_OUT` (`7` m) for `KITE_MAX` (`2` s) every `KITE_COOLDOWN` (`8` s), or fight melee for `KITE_CORNERED` (`3` s) when cornered.
- **Coward Retreat:** Below `FLEE_SHARE` (`20%`) health, cowards (`isCoward`: `COWARD_CLASSES` Mage, Sorcerer, Healer, Bard, Burglar, Acrobat, Thief, plus Animal affinity; never undead, daedra, constructs, or guards) flee for `FLEE_SECONDS` (`8` s). Retreating bodies (`walkAway`) turn before stepping within `WALK_FACE_DEG` (`45` deg) and spend `FACE_BACK` (`1` s) turning back.
