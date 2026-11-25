---
slug: "sifrit-forbidden-one-overview"
title: "Sifrit the Forbidden One: Necromancer Mini-Boss, Telegraph Blows, and Summons"
domain: "enemies"
kind: "overview"
parent: null
files:
  - "src/systems/sifrit/sifritLaw.js"
  - "src/systems/sifrit/sifritInstall.js"
  - "src/systems/sifrit/sifritFight.js"
  - "src/ai/blowShapes.js"
  - "src/ui/sifritBar.js"
  - "src/ui/gateBossBar.js"
  - "src/characters/foesWorld.js"
  - "src/scenes/frame/peopleFrame.js"
  - "src/characters/exteriorFoes.js"
  - "src/systems/eliteDungeons/edFoes.js"
  - "src/tools/staffCommandsHost.js"
  - "public/art/bunnyfall-sifrit/sifrit.png"
routes: []
tables: []
replacesBible:
  - "12-Enhanced-AI/Sifrit.md"
related:
  - "staff-events-packs-and-mini-boss"
  - "boss-traits-overview"
  - "boss-traits-carriers-wire-and-hud"
  - "arena-enemy-telegraph-blows"
invariants:
  - "`SIFRIT_ID = 3072` (`src/systems/sifrit/sifritLaw.js`, cloned from Mummy `SIFRIT_MUMMY = 19` at level `30` with `SIFRIT_ARCHIVE = 1700` across `SIFRIT_RECORDS = 25` records and `SIFRIT_PURPLE = [0.66, 0.22, 0.98]`) sets `SIFRIT_HP = 84000` (`SIFRIT_FIGHTERS = 4 * 600 * (5 + 30)`) via `promoteStaffBoss`, and `makeSifrit` runs idempotently inside `spawnFoe` for both owned enemies (`puppet` false) and peer puppets."
  - "`bossifyBlow` scales `BLOW[kind].mult` by `SIFRIT_BLOW_X = 2.5` across `SIFRIT_BLOWS` (lunge `26` m / `1.7` s, sweep `15` m `150` deg / `1.6` s, ring `5..20` m / `2.3` s), `sifritTitanDamage` caps single hits at `ceil(maxHealth / 4)`, and `sifritImmuneToKill` blocks instant-kill effects with `SIFRIT_IMMUNE_TEXT`."
  - "Owned living Sifrits summon `SIFRIT_SUMMON_N = 2` Mummies in `SIFRIT_SUMMON_RING` (`[4, 9]` m, first call `3` s after engagement, then every `SIFRIT_SUMMON_EVERY_S = 9` s or `0.75x` below half health, capped at `SIFRIT_SUMMONS_MAX = 8` and despawned when no owned Sifrit remains), while `sifritBarOf` and `sifritBarModel` (`src/ui/sifritBar.js`) drive `drawGateBossBar` within `120` m."
traps:
  - "`makeSifrit` sets `SIFRIT_SIZE_PCT = 34` after `promoteStaffBoss` to bypass the `150..300` boss scale clamp, and `sifritRow` `8400` health serves only table multipliers while `promoteStaffBoss` assigns `84000` HP."
  - "`sifritFrame` lives in `src/characters/foesWorld.js` and runs from `src/scenes/frame/peopleFrame.js` prior to enemy movement rather than directly in `src/scenes/world.js`."
dfu: []
tags:
  - "sifrit"
  - "boss"
  - "staff-event"
  - "necromancy"
  - "telegraph"
---

# Sifrit the Forbidden One: Necromancer Mini-Boss, Telegraph Blows, and Summons

Sifrit the Forbidden One (`SIFRIT_ID = 3072`) is a staff-event and elite-dungeon necromancer mini-boss combining custom telegraph shapes, hit caps, mummy summons, and a boss bar.

- **Identity and Promotion:** `src/systems/sifrit/sifritLaw.js` and `src/systems/sifrit/sifritInstall.js` clone `SIFRIT_MUMMY = 19` at level `30` (`SIFRIT_ARCHIVE = 1700`, `SIFRIT_RECORDS = 25`, `SIFRIT_PURPLE = [0.66, 0.22, 0.98]`, `public/art/bunnyfall-sifrit/sifrit.png`). Inside `spawnFoe` (`src/characters/exteriorFoes.js`, `src/systems/eliteDungeons/edFoes.js`), `makeSifrit` promotes owned enemies to `SIFRIT_HP = 84000` (`SIFRIT_FIGHTERS = 4 * 600 * (5 + 30)`, while `sifritRow` holds `8400` for table multipliers) via `promoteStaffBoss` (`hp = 0` on peer puppets) and sets `SIFRIT_SIZE_PCT = 34` afterward to bypass the `150..300` boss scale clamp. `src/tools/staffCommandsHost.js` registers `["Sifrit", SIFRIT_ID]` in `MONSTERS` for `/spawn sifrit`.
- **Telegraphs and Defenses:** In `src/systems/sifrit/sifritFight.js` and `src/ai/blowShapes.js`, `bossifyBlow` multiplies `BLOW[kind].mult` by `SIFRIT_BLOW_X = 2.5` across `SIFRIT_BLOWS` (`lunge` `26` m / `1.7` s, `sweep` `15` m `150` deg / `1.6` s, and `ring` `5..20` m / `2.3` s). `sifritTitanDamage` caps single hits at `ceil(maxHealth / 4)`, and `sifritImmuneToKill` blocks instant-kill effects with `SIFRIT_IMMUNE_TEXT`.
- **Summons and HUD Bar:** Executed via `sifritFrame` (`src/characters/foesWorld.js`, called from `src/scenes/frame/peopleFrame.js`), owned living Sifrits summon `SIFRIT_SUMMON_N = 2` Mummies in `SIFRIT_SUMMON_RING` (`[4, 9]` m) `3` s after engagement and every `SIFRIT_SUMMON_EVERY_S = 9` s (`0.75x` below half health, capped at `SIFRIT_SUMMONS_MAX = 8`). Within `120` m, `sifritBarOf` and `sifritBarModel` (`src/ui/sifritBar.js`) drive `drawGateBossBar` (`src/ui/gateBossBar.js`).
