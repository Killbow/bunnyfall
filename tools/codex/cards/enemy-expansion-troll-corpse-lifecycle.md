---
slug: enemy-expansion-troll-corpse-lifecycle
title: "Enemy Expansion Troll Corpse Respawn and Burn"
domain: combat
kind: subcard
parent: enemy-expansion-overview
files:
  - src/mods/enemyExpansion/dexTroll.js
  - src/characters/corpseMarker.js
  - src/characters/corpsePrefabHost.js
  - src/saves/modSaveData.js
  - src/net/wire.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Enemy-Expansion.md"
related:
  - enemy-expansion-overview
  - enemy-expansion-mudex-and-network-bounds
  - realm-saves-and-mod-save-hooks
invariants:
  - "`trollCorpseEntity` spawns with `1` of `1` health, level `0`, all stats at `50`, `corpseDisabled: true` (no loot), and the fallen troll's career."
  - "Melee strikes, arrows, touch spells, and area explosions cannot damage a troll corpse; only a spell missile intersecting its radius-`1` trigger sphere (`TROLL_TRIGGER_RADIUS`) deals damage."
  - "`TROLL_CORPSE.respawnTime` (`10` seconds) counts down only on the authority runner, and `Cheat.DisableTrollRespawn` freezes the timer."
  - "Dropping corpse health to `0` plays the death sound, places ash flat `1618/21` at `0.1` units above the corpse foot, and permanently destroys the troll."
  - "If `host.rise` returns `false` when the timer expires, the corpse remains on the ground and resets its countdown to retry later."
traps:
  - "On a non-owning peer, a spell missile strike (`struck()`) does not apply damage locally; it forwards the hit bundle to the authority runner via `host.send`."
  - "Quickloading restores saved timers into `_pending` before corpse markers spawn, skipping any entry whose remaining `respawnBuffer` is `0` or less."
dfu:
  - vendor/daggerfall-enemy-expansion/Scripts/BestiaryTrollCorpseBillboard.cs
  - vendor/daggerfall-enemy-expansion/Scripts/BestiaryTrollCorpseEntity.cs
  - vendor/daggerfall-enemy-expansion/Scripts/BestiaryTrollCorpseSerializer.cs
  - vendor/daggerfall-enemy-expansion/Scripts/BestiarySaveInterface.cs
tags:
  - enemy-expansion
  - troll
  - corpse-prefab
  - respawn
  - mod-save
---

# Enemy Expansion Troll Corpse Respawn and Burn

Slain trolls leave a regenerative corpse prefab (`1618_20`) that rises again unless burned to ash by a direct spell missile (`src/mods/enemyExpansion/dexTroll.js`, `src/characters/corpseMarker.js`, and `src/characters/corpsePrefabHost.js`).

- **Corpse entity and missile-only damage (`dexTroll.js`, `corpsePrefabHost.js`):** `installDexTroll` registers prefab `1618_20` through `registerCorpsePrefab`. Each downed troll creates a `trollCorpseEntity` with `1` of `1` health, level `0`, all stats at `50`, `corpseDisabled` set so no loot window opens, and the troll's career resistances. Weapons, arrows, touch spells, and splash explosions are ignored; only a spell missile hitting the radius-`1` trigger sphere (`TROLL_TRIGGER_RADIUS`) registers via `struck()`, while ongoing magic effects tick through `rounds()` and `runMagicRoundsFor`. When health hits `0`, the corpse plays its death cue and swaps to ash archive `1618/21` offset `0.1` above the foot.
- **Respawn timer, saves, and wire sync (`dexTroll.js`, `modSaveData.js`, `wire.js`):** The authority runner counts down `TROLL_CORPSE.respawnTime` (`10` seconds, paused by `Cheat.DisableTrollRespawn`) and calls `host.rise`; if blocked, the timer resets and retries. Non-owning peers forward missile hits to the runner through `host.send`, and the enemy wire record (`src/net/wire.js`) syncs `bg` (`1` for risen, `2` for burnt), which `validFoeRecord` and `validSharedFoe` allow only on dead records. `registerModSaveData` persists `{ activeCorpses: [{ key, respawnBuffer }] }` via `trollSaveData` and `restoreTrollSaveData`, queuing positive timers in `_pending`.
