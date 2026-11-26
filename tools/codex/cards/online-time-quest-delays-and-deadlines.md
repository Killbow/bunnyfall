---
slug: online-time-quest-delays-and-deadlines
title: "Quest Short Waits, Deadlines, and Restamps Online"
domain: systems
kind: subcard
parent: online-time-arc-overview
files:
  - src/systems/quest/clock.js
  - src/systems/quest/questStamps.js
  - src/systems/quest/machine.js
  - src/guilds/crimeGuilds.js
  - src/afflictions/racialQuests.js
  - src/guilds/bountyBoard.js
  - src/guilds/bountyHost.js
  - src/saves/save.js
  - src/player/restSession.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Online-Time-Arc.md"
related:
  - online-time-arc-overview
  - quests-macros-and-main-spine
invariants:
  - "Online, `Clock.chargeSeconds` charges only the lived step (the raw gap minus raised seconds, clamped between `0` and `questClockStepMax`), never charging raised time; offline play charges the full raw gap."
  - "An online delay clock (`waitsShort`: shared clock active and not `isDeadline`) is capped at `ONLINE_DELAY_SECONDS = 24 * 60` classic seconds (about two real minutes)."
  - "`isDeadline` is set from `ONLINE_DEADLINES` (a maintained table) or when a quest script calls `clockIsDeadline`, and remains a deadline until the quest succeeds."
  - "A clock declared at an explicit zero time with no travel arm, whose script name does not start with `_2`, is never a deadline unless `ONLINE_DEADLINES` names it; saves carry this as `declaredAtOnce`."
  - "A quest envelope without `ownSecondsAt` predates the own-clock split, so its own-clock stamps sit on the event clock; `questBlockOnOwnClock` shifts them once at load and `markOwnClock` then marks the envelope."
  - "Restoring a clock from a save or a party member's shared quest envelope resets `_lastRaisedSample` so no prior raise is subtracted across the load."
traps:
  - "Any quest timer whose expiry causes quest failure must be listed in `ONLINE_DEADLINES` (such as `N0B00Y17` `time2`, `K0C30Y03` `S.13`, and `B0B81Y02` `S.30`) so `waitsShort` does not compress it to two minutes."
  - "The `ONLINE_CLOSINGS` table is retired and must not be reintroduced."
  - "Bounty ledgers older than `BOUNTY_LEDGER_VERSION` (`2`) are restamped once online by `restampNeverLapsed` so existing bounties do not expire on the first tick."
dfu:
  - Clock.cs
tags:
  - quests
  - deadlines
  - delays
  - bounty
  - online
---

Online quests charge real played time instead of rest skips, compress flavor wait timers to two real minutes, and restamp legacy save timers onto the active clock.

## Lived-Step Charging and Short Waits

In `src/systems/quest/clock.js`, `Clock.chargeSeconds` subtracts session `raisedMinutes` deltas (`_lastRaisedSample`) from each character-clock step and clamps the result between `0` and `questClockStepMax` (`src/systems/quest/machine.js` and `src/player/restSession.js`). Rest, travel, and training raises never burn down online quest timers, whereas offline clocks charge the full raw time gap.

When a shared clock is active and a timer is not marked `isDeadline` (`waitsShort`), `clock.js` caps wait durations to `ONLINE_DELAY_SECONDS` (`24 * 60` classic seconds, or two real minutes at TimeScale 12). Timers that gate quest failure are protected via `isDeadline`, set either by the `ONLINE_DEADLINES` table (covering entries such as `N0B00Y17` `time2`, `K0C30Y03` `S.13`, and `B0B81Y02` `S.30`) or dynamically when a quest reads `clockIsDeadline`. Related online intervals use the same 24-classic-minute cadence: `CRIME_GUILD_LETTER_ONLINE_MINUTES = 24` (`src/guilds/crimeGuilds.js`) and `ONLINE_RACIAL_INTERVAL_MINUTES = 24` (`src/afflictions/racialQuests.js`).

## Save and Party Clock Restamping

`questBlockOnOwnClock` (`src/systems/quest/questStamps.js`, called by `src/saves/save.js`) migrates older quest timestamps onto `ownMinutes()` once per save, while `questDataOnThisClock` shifts a shared party quest envelope onto the receiving player's clock and resets `_lastRaisedSample`. For bounties (`src/guilds/bountyBoard.js` and `src/guilds/bountyHost.js`), `restampNeverLapsed` upgrades ledgers below `BOUNTY_LEDGER_VERSION` (`2`) so held contracts do not lapse on login.
