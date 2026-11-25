---
slug: "standing-banishment-pardon-and-drift"
title: "Regional Banishment on the Sky Calendar, Pardons, Penance, and Standing Drift"
domain: "justice"
kind: "subcard"
parent: "standing-reputation-overhaul-overview"
files:
  - "src/justice/standing.js"
  - "src/justice/court.js"
  - "src/world/regionConditions.js"
  - "src/world/worldTick.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Standing-Arc.md"
related:
  - "standing-reputation-overhaul-overview"
  - "online-time-sky-law-and-cutover"
  - "online-waits-banishment-on-the-sky-calendar"
invariants:
  - "Only `BANISHABLE_CRIMES` (`Murder`, `High Treason`, `Treason`) trigger regional banishment (`BANISHMENT_MINUTES = 30 * 1440` in `src/justice/standing.js`), with `banishmentEnd` measured on the sky calendar."
  - "Negative standing recovers `+1` point every `RECOVERY_INTERVAL_MINUTES` (`7` days), while positive standing decays solely on the upstream `112`-day tick."
  - "`PARDON_BASE_PRICE` (`2500`) and `PENANCE_BASE_PRICE` (`200`, granting `PENANCE_POINTS = 5`) scale upward with repeated purchases."
traps:
  - "Always convert banishment timestamps through `skyMinuteOfEvent` and `eventMinuteOfSky` rather than raw event-clock minutes so online clock cutovers never skew expiry."
dfu:
  - "Assets/Scripts/Game/Entities/PlayerEntity.cs"
tags:
  - "banishment"
  - "pardon"
  - "penance"
  - "drift"
---

# Regional Banishment on the Sky Calendar, Pardons, Penance, and Standing Drift

Regional banishment terms, temple pardons, penance purchases, and passive standing recovery run across `src/justice/standing.js`, `src/justice/court.js`, `src/world/regionConditions.js`, and `src/world/worldTick.js`.

- **Banishable crimes and sky-calendar duration (`src/justice/standing.js`, `src/justice/court.js`):** Only convictions for `BANISHABLE_CRIMES` (`Murder`, `High Treason`, and `Treason`) impose regional banishment instead of applying banishment to every severe offense. The thirty-day banishment span (`BANISHMENT_MINUTES = 30 * 1440`) calculates `banishmentEnd` on the sky calendar by converting timestamps through `skyMinuteOfEvent` and `eventMinuteOfSky` rather than adding raw event-clock minutes, preventing clock cutovers from skewing the release date.
- **Temple pardons and penance scaling (`src/justice/standing.js`, `src/justice/court.js`):** Temples lift active regional banishments early for `PARDON_BASE_PRICE` (`2500`) and sell standing recovery for `PENANCE_BASE_PRICE` (`200`), with each penance purchase restoring `PENANCE_POINTS = 5`. Both prices scale upward with repeated regional purchases.
- **Asymmetric standing recovery and decay (`src/world/regionConditions.js`, `src/world/worldTick.js`):** As `src/world/regionConditions.js` and `src/world/worldTick.js` advance world time and evaluate banishment expiry, negative regional standing recovers by `+1` point every `RECOVERY_INTERVAL_MINUTES` (`7` days). Positive regional standing never uses the weekly timer and decays only on the classic `112`-day upstream tick.
