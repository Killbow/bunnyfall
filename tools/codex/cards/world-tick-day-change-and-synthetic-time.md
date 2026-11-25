---
slug: "world-tick-day-change-and-synthetic-time"
title: "World Tick, Day Change, Calendar, and Synthetic Time"
domain: "systems"
kind: "subcard"
parent: "classic-systems-spine-overview"
files:
  - "src/world/worldTick.js"
  - "src/magic/effectBroker.js"
  - "src/world/gameDate.js"
  - "src/trade/banking.js"
  - "src/trade/shopStock.js"
  - "src/magic/enchantments.js"
  - "src/world/holidays.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Systems-Arc.md"
related:
  - "classic-systems-spine-overview"
  - "save-snapshots-and-character-identity"
  - "lived-time-two-clocks-overview"
invariants:
  - "tickPlayerMinutes (src/world/worldTick.js:611) runs runDayChange (:500) on day boundaries. That pass covers updateRegionalPrices, rollClimateWeathersForDay, removeExpiredRooms, and checkOverdueLoans."
  - "claimMagicRounds (src/world/worldTick.js:301) caps catch-up at MAX_CATCHUP_ROUNDS = 2880, one classic minute per round."
  - "claimSyntheticTimeIncrease (src/magic/effectBroker.js:75) retires the flag a previous window claimed, then claims it for the current window, so lowering the flag is deferred by one claim."
traps:
  - "Calling setSyntheticTimeIncrease re-arms the flag even when a previous raise was never claimed. Skipping the raise on a clock jump causes held-item degrade and health-leech charges for the skipped time."
  - "Treating months as variable length breaks the calendar: gameDate uses DAYS_PER_MONTH = 30 and DAYS_PER_YEAR = 360."
dfu:
  - "Assets/Scripts/Game/MagicAndEffects/EntityEffectBroker.cs"
  - "Assets/Scripts/Game/LoanChecker.cs"
  - "Assets/Scripts/Utility/DaggerfallDateTime.cs"
tags:
  - "time"
  - "calendar"
  - "day-change"
  - "loans"
  - "magic-rounds"
---

# World Tick, Day Change, Calendar, and Synthetic Time

Time progression in `src/world/worldTick.js` coordinates calendar math, daily economic rollovers, magic catch-up rounds, and synthetic clock jumps (`lived-time-two-clocks-overview`).

- **Calendar constants and lunar phases (`src/world/gameDate.js`, `src/world/holidays.js`):** The calendar anchors on `CLASSIC_EPOCH_IN_SECONDS = 12566016000` and `CLASSIC_GAME_START_TIME = 523530`, using fixed `DAYS_PER_MONTH = 30`, `DAYS_PER_YEAR = 360`, `DUSK_HOUR = 18`, and `SECONDS_PER_WEEK = 7 * 86400`. `lunarPhase` uses a 32-day ratio with offset `+3` for Masser and `-1` for Secunda, while holidays index from `HOLIDAYS_START_ID = 8349`.
- **Day-change rollover (`src/world/worldTick.js`, `src/trade/banking.js`, `src/trade/shopStock.js`):** When `tickPlayerMinutes` crosses a day boundary, `runDayChange` calls `updateRegionalPrices`, `rollClimateWeathersForDay`, `removeExpiredRooms`, and `checkOverdueLoans` (with `settleOverdueLoan` in `banking.js` and `LOAN_REMINDER_HUD_DELAY = 3`). In `shopStock.js`, adjusted regional prices below `500` set `PricesLow` and above `2000` set `PricesHigh`.
- **Magic rounds and synthetic time (`src/world/worldTick.js`, `src/magic/effectBroker.js`, `src/magic/enchantments.js`):** `claimMagicRounds` processes one classic minute per round up to `MAX_CATCHUP_ROUNDS = 2880`. On clock jumps, `setSyntheticTimeIncrease` arms the synthetic-time flag, and `claimSyntheticTimeIncrease` retires the prior claim before claiming the current window, preventing `HELD_DEGRADE_RATE = 4` (`HELD_DEGRADE_RATE_RESTING = 60`) and health-leech penalties across skipped time.
