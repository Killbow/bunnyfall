---
slug: elite-breach-lords-seam-and-vestiges
title: "Lords, Boss Seam, Fair Trail, and Vestige Caps"
domain: combat
kind: subcard
parent: elite-breach-spire-overview
files:
  - src/net/eliteGates/egLords.js
  - src/net/bossSeam.js
  - src/net/eliteGates/egBodies.js
  - src/net/eliteGates/egFloor.js
  - src/net/eliteGates/egFair.js
  - src/net/eliteGates/egVestige.js
  - src/net/eliteGates/egLegion.js
  - src/net/eliteGates/egBrain.js
  - src/systems/eliteGates/egLordFall.js
replacesBible:
  - "11-Multiplayer/Elite-Gates.md"
related:
  - elite-breach-spire-overview
  - breach-boss-brain-and-courts
  - enemy-telegraphs-poise-and-punish
  - combat-formulas-and-power-ceiling
invariants:
  - "Every Spire lord and champion executes through the single `EG_SEAM = bossSeam('eg', ...)` in `src/net/eliteGates/egLords.js`; director calls never bypass it."
  - "Lord health equals `egTtkRef(c)` times reference DPS, scaling from `EG_TTK_S` (180 s) by `EG_TTK_GROWTH` (1.07) per circle through circle 20 and `EG_TTK_GROWTH_DEEP` (1.03) thereafter, while fury starts at `EG_FURY_RATIO` (1.5) times `ttkRef`."
  - "Damage multipliers cap at `EG_BUCKET_X_MAX` (1.25 client), `EG_RELAY_X_MAX` (1.6), and `EG_BUCKET_ALL_MAX` (1.6); enemy share caps at `EG_SHARE_X_MAX` (1.5), and Vestige damage reduction caps at `EG_DR_MAX` (0.3)."
  - "The fair trail (`src/net/eliteGates/egFair.js`) drops poses lagging over `EG_TS_LAG_MAX_MS` (300 ms), and the union floor (`egUnionHolds`) withholds any blow that would leave zero safe floor cells."
traps:
  - "Enemy blows commit `EG_TELL_LEAD_MS` (400 ms) before wind-up, and feints cut at `EG_FEINT_AT` (0.55)."
  - "Downed members can be raised within `EG_DOWN_MS` (60 s) and `EG_REZ_REACH_M` (10 m) at `EG_REZ_PCT` (0.3) via `egLayDown` and `egRezMember`."
  - "`egFightProfile` folds decrees in `EG_LAW_UNIT` (1,000ths); `validEgDecrees` accepts at most `EG_DECREES_MAX` (9) with an `EG_PROFILE_CACHE_MAX` (256) LRU cache."
  - "Lords shun off-floor targets for `EG_SHUN_MS` (6 s)."
tags:
  - bosses
  - enemies
  - fairness
  - vestiges
  - authority
---

Spire combat (`src/net/eliteGates/egLords.js`, `src/net/eliteGates/egBodies.js`, `src/net/eliteGates/egLegion.js`, and `src/net/eliteGates/egBrain.js`) routes all boss and champion encounters through a shared authority seam with deterministic fairness guards and bounded Vestige scaling.

## Boss Seam, TTK Scaling, and Decrees

Every lord and champion registers on `EG_SEAM = bossSeam('eg', ...)` (`src/net/bossSeam.js` and `egLords.js`), which owns phase transitions, targeting, and downed-player raises. Lord health scales by `egTtkRef(c)` times reference DPS: base `EG_TTK_S` (`180` s) compounds by `EG_TTK_GROWTH` (`1.07`) per circle through circle 20 and `EG_TTK_GROWTH_DEEP` (`1.03`) beyond, with fury engaging at `EG_FURY_RATIO` (`1.5`) times `ttkRef`. Lords ignore off-floor targets for `EG_SHUN_MS` (`6` s), and defeated lords play `egLordFallAct` scaled by `EG_FALL_PER` (`src/systems/eliteGates/egLordFall.js`).

Circle decrees fold into `egFightProfile` in `EG_LAW_UNIT` (`1,000`ths), validated by `validEgDecrees` up to `EG_DECREES_MAX` (`9`) and cached in an `EG_PROFILE_CACHE_MAX` (`256`) LRU.

## Fair Trail, Union Floor, Raises, and Vestiges

`src/net/eliteGates/egFair.js` and `src/net/eliteGates/egFloor.js` prevent unavoidable overlap kills. Enemy attacks commit `EG_TELL_LEAD_MS` (`400` ms) before wind-up (feints cut at `EG_FEINT_AT = 0.55`). Hit checks discard pose samples lagging past `EG_TS_LAG_MAX_MS` (`300` ms), and `egUnionHolds` suppresses any hazard whose active union would empty all safe floor cells.

Downed players (`egLayDown` and `egRezMember`) have `EG_DOWN_MS` (`60` s) to be revived within `EG_REZ_REACH_M` (`10` m) at `EG_REZ_PCT` (`0.3` health). `src/net/eliteGates/egVestige.js` expands choices up to `EG_OFFER_MAX` (`6`) while clamping client multipliers to `EG_BUCKET_X_MAX` (`1.25`), relay and combined multipliers to `EG_RELAY_X_MAX` (`1.6`) and `EG_BUCKET_ALL_MAX` (`1.6`), enemy share to `EG_SHARE_X_MAX` (`1.5`), and damage reduction to `EG_DR_MAX` (`0.3`).
