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
  - "`claimMagicRounds` runs once per frame and its window goes to every subscriber through `runMagicRoundsFor`. A per-entity claim advances the marker, so a second caller finds no rounds."
  - "Within a magic round, `updateDiseases` runs first so an ending disease's last day lands and the same round's tick removes it, and `runInfections` follows in the same round."
  - "`computeEntityMods` and `passiveSpecialsMagicRound` run after `enchantmentMagicRound` in each round, because the magery arm sums both producers into the one `maxMagickaModifier`."
  - "The day-change block runs after the fatigue band and before the per-minute calendar loop. Swim, price, and loan rolls share one generator, and the loan default's reputation hit must land before the reputation normalization."
  - "`worldRegionPricesOn` draws the day's roll for every region in order and spends it only where the walk applies. Skipping the draw for a region shifts every later region's roll."
traps:
  - "Calling setSyntheticTimeIncrease re-arms the flag even when a previous raise was never claimed. Skipping the raise on a clock jump causes held-item degrade and health-leech charges for the skipped time."
  - "Treating months as variable length breaks the calendar: gameDate uses DAYS_PER_MONTH = 30 and DAYS_PER_YEAR = 360."
  - "Every catch-up magic round reads the window's end as the current clock (`clockMinutes = to`) for sun, satiation, and infection day, while `r + 1` is only the round number. Per-round minutes burn vampires for the road behind them."
  - "The `lastGameMinutes` write is monotonic. The exhaustion collapse re-enters the tick and raises the clock an hour, and a marker pulled back afterward makes one midnight be processed twice."
  - "The swimming fatigue test checks for an Argonian before the dice roll. An Argonian draws no roll, and a roll drawn where Daggerfall draws none shifts every later roll from the same generator."
  - "`runCalendarArms` tests minute values `[last, now)` with no `+1`, unlike the broker's rounds at `[last+1, now]`. The reputation normalization lands one minute earlier than a round index would suggest, as in Daggerfall."
  - "The torch timer and `killIfAnyLiveStatZero` take `realSeconds`, not `dt`. A rest or journey fabricates `dt` in large frames, and feeding them burns a torch or kills a sleeper."
  - "On the 266-day minute where the 7-day and 38-day cadences align, `regionPowerUpdate` runs twice, as Daggerfall does. Each call draws from the day's one generator, so the second must not replay the first's rolls."
  - "The fatigue band fires once when the floored minute changes, so a multi-minute jump costs one minute of fatigue while the broker counts many magic rounds. The two markers are separate on purpose."
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
