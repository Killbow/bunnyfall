---
slug: online-time-arc-overview
title: "Online Time: Sky, Event, and Character Clocks"
domain: systems
kind: overview
parent: null
files:
  - src/world/worldTick.js
  - src/net/skyLaw.js
  - src/net/wire.js
  - src/scenes/world.js
  - src/weather/skyCalendar.js
  - src/ui/enhancedMenu.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Online-Time-Arc.md"
related:
  - online-time-sky-law-and-cutover
  - online-time-lycanthropy-and-vampire-nights
  - online-time-quest-delays-and-deadlines
  - sky-weather-and-lighting
  - world-modes-and-transitions
invariants:
  - "Offline, `skyMinutes()`, `worldMinutes()`, and `ownMinutes()` all read the same `_worldMinutes`."
  - "Online, `worldMinutes()` is the event clock (`sharedClassicMinutes` in `src/net/wire.js`, TimeScale 12) and its rate never changes."
  - "Online, `skyMinutes()` is read for the current moment only; any value saved, sent, or compared later comes from `worldMinutes()` or `ownMinutes()`."
  - "`advanceOwnMinutes` (rest, travel, jail, and training) moves only the character clock online and never moves the sky or event clock."
traps:
  - "Do not stamp or persist a `skyMinutes()` reading. Nothing stores the sky."
  - "`trustedWorldMinutes()` returns `NaN` while a shared clock is installed but has not yet heard from the relay."
dfu:
  - DaggerfallDateTime.RaiseTime
tags:
  - time
  - online
  - clocks
  - sky
  - timescale
---

Online multiplayer separates time into three distinct clocks managed by `src/world/worldTick.js`, while offline play collapses `skyMinutes()`, `worldMinutes()`, and `ownMinutes()` onto the single local `_worldMinutes` counter.

## Shared Installation and Clock Roles

`setSharedClock(source, wallOf, { sky, skyWall })` (`src/world/worldTick.js`) installs the online event clock and sky clock together and enables `skyCalendar` via `setSkyCalendar` (`src/weather/skyCalendar.js`). `src/scenes/world.js` binds the online sky reading to `skyClassicMinutes(Date.now() + _sharedOffsetMs)` (`src/net/skyLaw.js`). Until the client receives a relay timestamp, `trustedWorldMinutes()` returns `NaN`.

- **Event clock (`worldMinutes()`):** Reads `sharedClassicMinutes` (`src/net/wire.js`) at a fixed TimeScale 12 rate. Shared world schedules, timers, and persisted event stamps anchor to this clock.
- **Sky clock (`skyMinutes()`):** Computes the current visual time of day, moon phase, and calendar date at TimeScale 24. It is evaluated for the current instant only and is never saved or transmitted. `skyDayWords()` (`src/ui/enhancedMenu.js`) displays the sky day length in the online rules text.
- **Character clock (`ownMinutes()`):** Tracks personal progression for a character. It restores on save load, ticks forward while logged in, pauses while logged off, and advances on `advanceOwnMinutes` during rest, fast travel, jail, and training (`DaggerfallDateTime.RaiseTime`). `raisedMinutes()` reports how many minutes `advanceOwnMinutes` has added during the current session (`0` offline).

## Subcards

- `online-time-sky-law-and-cutover`: piecewise linear `SKY_SEGMENTS`, aligned rate switches, and event-to-sky calendar mapping.
- `online-time-lycanthropy-and-vampire-nights`: dusk-to-dawn full-moon werewolf transformations and vampire sun checks.
- `online-time-quest-delays-and-deadlines`: lived-step quest clock charging, 2-minute online delays, and `ONLINE_DEADLINES`.
