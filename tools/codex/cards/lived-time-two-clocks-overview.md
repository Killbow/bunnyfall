---
slug: "lived-time-two-clocks-overview"
title: "Lived Time World Clock, Character Clock, and Tick Arms"
domain: "time"
kind: "overview"
parent: null
files:
  - "src/world/worldTick.js"
  - "src/scenes/shared.js"
  - "src/scenes/frame/motorFrame.js"
  - "src/player/rest.js"
  - "src/player/restSession.js"
  - "src/justice/arrestFlow.js"
  - "src/scenes/worldModes.js"
  - "src/player/deathRespawn.js"
  - "src/saves/onlineCheckpoint.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Lived-Time.md"
related:
  - "lived-time-saves-and-offline-copy"
  - "online-time-arc-overview"
  - "rest-arc-overview"
  - "online-time-lycanthropy-and-vampire-nights"
invariants:
  - "Offline, `ownMinutes()` returns the same value as `worldMinutes()`, matching the single DFU clock."
  - "Online, worldMinutes() reads the shared clock; ownMinutes() is _ownMinutes ?? the shared clock."
  - "Sky, weather, prices, shops and spawn day/night read the world clock (skyMinutes/worldMinutes); magic rounds, needs, cooldowns, rents and loans read ownMinutes."
  - "DAY_ARMS = { all, world, own }; runDayChange and runCalendarArms split world and own halves by arms."
  - "World halves run over worldArmsPieces(from, to) so no world minute is walked twice or lost."
  - "No online checkpoint is written while ownWalkWaiting(entity) is true."
traps:
  - "Character-time actions (rest, fast travel, training, prison) must call advanceOwnMinutes and must not move the world clock."
  - "Do not reintroduce _onlineSimMinutes or restSimMinutes; LIVED1 retired them."
  - "A raise made inside a tick (tickInFlight()) is walked as a second pass after the current window, not nested."
  - "Death and absence stand the character clock; skipDeadMinutes skips the dead span, and payAbsenceWhenHeard credits absence only once hearSharedClock has run."
dfu: []
tags:
  - "lived-time"
  - "clock"
  - "online"
  - "tick"
  - "calendar"
---

# Lived Time World Clock, Character Clock, and Tick Arms

In `src/world/worldTick.js`, base time advances at `CLASSIC_MINUTES_PER_SECOND = 12 / 60`. Offline, `ownMinutes()` returns `worldMinutes()`. Online, `worldMinutes()` reads the shared clock, while `ownMinutes()` resolves `_ownMinutes ??` the shared clock. Sky, weather, prices, shops, and spawn cycles read `skyMinutes` or `worldMinutes`, whereas magic rounds (via `runMagicRoundsFor` with a `skyMinutes` option, capped at `MAX_CATCHUP_ROUNDS = 2880`), needs, cooldowns, rents, and loans read `ownMinutes`. HUD helpers `worldNightfallText`, `ownTimeLeftText`, and `ownTimeLeftShort` format remaining spans.

Calendar transitions use `DAY_ARMS = { all, world, own }`, letting `runDayChange` and `runCalendarArms` split updates into world and personal halves. World halves iterate over `worldArmsPieces(from, to)` so no minute is walked twice or lost. If a raise occurs while `tickInFlight()` is true, it runs as a second pass after the current window rather than nesting.

Rest, fast travel, training, and prison call `advanceOwnMinutes` without moving the world clock, and `src/scenes/frame/motorFrame.js` computes `walkRaise` when `sharedClockOn()` and `travelScale > 1`. Do not reintroduce retired `_onlineSimMinutes` or `restSimMinutes`. Death and offline absence pause the character clock (`skipDeadMinutes` skips dead spans, and `payAbsenceWhenHeard` waits for `hearSharedClock`), while `src/saves/onlineCheckpoint.js` suppresses writes whenever `ownWalkWaiting(entity)` is true.
