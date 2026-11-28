---
slug: wererat-encounters
title: Wererat Encounters
domain: characters
kind: overview
files:
  - src/characters/wererat.js
  - src/characters/wereratInstall.js
  - src/characters/wereratSummon.js
  - src/characters/dungeonEnemies.js
  - src/characters/encounters.js
  - src/characters/campEncounters.js
  - src/characters/enemyCasting.js
  - src/net/grantHost.js
  - src/net/foeBounds.js
routes: []
tables: []
invariants:
  - "Only ordinary Rat selections can become a Wererat. Dungeon markers use their own stable seed, and grant-rolled exterior encounters use the member's species die."
  - "The owner calls ten ordinary Rats once while the Wererat is alive, hostile, and at or below half health. The call is retained by saves and foe streams."
traps:
  - "Spawn the swarm through the usual loose foe path and mark the Rats as summoned so corpse loot stays empty."
  - "Place the Wererat in the original dungeon slot so saved and streamed foe indices keep their meaning."
tags:
  - wererat
  - encounters
  - enemy
---

The Wererat replaces 4% of eligible Rat spawns. She uses her own directional frames, a stronger melee attack, the ranged Fireball spell, and a small table of coin and loot. Her art uses a vendored texture archive. The dungeon and exterior pools use their existing spawn, cast, and summon synchronization paths.
