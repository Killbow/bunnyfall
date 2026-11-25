---
slug: gilded-powers-hour-tolls-dragonfire-undertow
title: "Gilded Powers: The Hour Tolls, Dragonfire, Undertow"
domain: combat
kind: subcard
parent: gilded-rung-overview
files:
  - src/items/gilded.js
  - src/items/lootPowers.js
  - src/player/playerDoor.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Gilded.md"
related:
  - gilded-rung-overview
  - loot-arc-legendary-powers-and-proc-caps
  - combat-formulas-and-power-ceiling
invariants:
  - "HOUR_TOLLS { kind 'toll', every 3, pct 100, refund true }: `lootStrike` counts landed shots per weapon in a WeakMap modulo `every`. `lootBlow` adds +100% when `tollDue` (count === every-1), so the third landed shot deals double. Misses never advance the count."
  - "Toll refund: `lootKill` returns one `bowDamageArrow()` when the felled enemy is the last toll target and the kill comes within `TOLL_REFUND_S` (1 s)."
  - "DRAGONFIRE { kind 'dragonfire', group 'daedra', share 33, meters 3 }: a landed blow on a Daedra burns it again for 33% (`again`), then hits every other Daedra within 3 m through `playerDoor` records. No element resistance applies."
  - "UNDERTOW { kind 'undertow', pct 10, max 5, seconds 6, heal 10 }: each whole landed blow adds a stack per target (WeakMap, up to +50%), held 6 s after the last landing. A kill within 1 s of the last landing heals 10% max health and clears the stacks."
traps:
  - "Dragonfire's burst uses `near(door, ...)` over world-run enemy records. Relay-run bodies have no neighbors there, so only the burn on the struck body reaches them."
  - "No pellet refund path exists despite the comment. Hammerfall and Broadside are not implemented."
dfu: []
tags:
  - combat
  - gilded
  - powers
  - loot-powers
  - weakmap
---

# Gilded Powers: The Hour Tolls, Dragonfire, Undertow

Each Gilded weapon record in `src/items/gilded.js` attaches a unique combat power evaluated in `src/items/lootPowers.js` for the local player's weapon in hand outside duels. State maps (`_tolls`, `_lastToll`, `_undertow`) use WeakMaps and clear via `_resetForTests`.

- **The Hour Tolls (`HOUR_TOLLS`, `{ kind: 'toll', every: 3, pct: 100, refund: true }`):** `lootStrike` increments the weapon's landed-shot counter in `_tolls` modulo `3`; misses do not advance it. When `tollDue` holds (`count === 2`), `lootBlow` adds `+100%` damage and records the target in `_lastToll`. If `lootKill` fells that enemy within `TOLL_REFUND_S` (`1` second), it refunds one arrow via `bowDamageArrow()`.
- **Dragonfire (`DRAGONFIRE`, `{ kind: 'dragonfire', group: 'daedra', share: 33, meters: 3 }`):** On a landed blow against a Daedra, `lootBlow` deals an extra `33%` burn (`again`) to the struck enemy and splashes the same burn to every other Daedra within `3` meters found via `near(door, ...)` over world-run enemy records in `src/player/playerDoor.js`, bypassing elemental resistance.
- **Undertow (`UNDERTOW`, `{ kind: 'undertow', pct: 10, max: 5, seconds: 6, heal: 10 }`):** Each whole landed blow adds a `+10%` damage stack on that enemy in `_undertow` up to `5` stacks (`+50%`), expiring `6` seconds after the last hit. Felling the enemy within `1` second of the last hit heals `10%` of max health and clears its stacks.
