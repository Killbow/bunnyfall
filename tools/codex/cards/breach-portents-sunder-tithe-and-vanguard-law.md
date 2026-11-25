---
slug: breach-portents-sunder-tithe-and-vanguard-law
title: "Breach Portents Sunder Rise, Tithe Priority, and Vanguard Scaling"
domain: multiplayer
kind: subcard
parent: breach-portents-overview
files:
  - src/net/gateBrain.js
  - src/net/bossSeam.js
  - src/net/gateStrike.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Breach-Portents.md"
related:
  - breach-portents-overview
  - breach-portents-relay-gate-and-spoils-budget
  - breach-portents-sundering-split
  - breach-portents-captive-and-tithe-imp
  - breach-portents-vanguard-waves
invariants:
  - "payTithe runs first in the beat, before kill and Wrath; also at catch in applyHostHit with relay rng."
  - "Sunder half rise h = min(SUNDER_RISE*m, max(other.h, SUNDER_RISE_MIN*m))."
  - "Vanguard boss share scaled by VG_SHARE_X = (BOSS_TTK_S - VG_TEAM_S)/BOSS_TTK_S."
  - "attacksFor kit is filtered through kitOf (SUNDER_KITS) before run law."
traps:
  - "windupOf exempts wrath, reckon, cross and chains from phase-three speedups."
dfu: []
tags:
  - breach
  - portents
  - sunder
  - tithe-imp
  - vanguard
---

# Breach Portents Sunder Rise, Tithe Priority, and Vanguard Scaling

Portent combat laws across `src/net/gateBrain.js`, `src/net/bossSeam.js`, and `src/net/gateStrike.js` govern Tithe-Imp resolution priority, Sundering rise formulas, Vanguard health scaling, and attack kit filtering.

- **Tithe Priority and Scaling:** `titheHpFor` sets Tithe-Imp health from `TITHE_S` (`10`) seconds of mean reference damage. `payTithe` executes first during the brain beat, ahead of kill resolution and Wrath checks, and also fires immediately at catch inside `applyHostHit` using the relay random generator.
- **Sunder Rise and Kit Filtering:** When a kneeling Sundering half rises, its restored health follows `h = min(SUNDER_RISE * m, max(other.h, SUNDER_RISE_MIN * m))`, using `SUNDER_RISE` (`0.3`), `SUNDER_RISE_MIN` (`0.05`), and post-rejoin fraction `SUNDER_LAST` (`0.26`). Before run law selects an action, `attacksFor` filters available moves through `kitOf` (`SUNDER_KITS`). In `windupOf`, phase-three windup speedups explicitly exempt `wrath`, `reckon`, `cross`, and `chains` (`CHAIN_HOLD_M = 16`).
- **Vanguard Share Scaling:** On Vanguard nights, each challenger's contribution to boss health scales by `VG_SHARE_X = (BOSS_TTK_S - VG_TEAM_S) / BOSS_TTK_S`, with `BOSS_TTK_S` set to `240` and `VG_TEAM_S` derived from `VG_STAGES` wave seconds.
