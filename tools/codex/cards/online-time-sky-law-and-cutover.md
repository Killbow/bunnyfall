---
slug: online-time-sky-law-and-cutover
title: "Sky Law, Segments, and Aligned Rate Cutover"
domain: systems
kind: subcard
parent: online-time-arc-overview
files:
  - src/net/skyLaw.js
  - src/net/wire.js
  - src/weather/skyCalendar.js
  - src/net/nodeLaw.js
  - server-account/src/festival.js
  - src/weather/weatherSim.js
  - src/world/climateSwaps.js
  - src/systems/quest/questMacros.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Online-Time-Arc.md"
related:
  - online-time-arc-overview
  - sky-weather-and-lighting
invariants:
  - "The sky is a pure function of relay-clock milliseconds (`skyLawOf(SKY_SEGMENTS).minutesAt`) with no mutable state."
  - "Before the first segment `fromMs`, the sky equals `sharedClassicMinutes` (the event clock)."
  - "Each segment starts at the minute the previous segment reached, so a rate switch never skips forward or steps backward."
  - "Each `fromMs` must be an aligned instant where the old sky hour already matches the new schedule; at TimeScale 24, midnights fall on the UTC hour."
  - "`src/net/skyLaw.js` imports only `src/net/wire.js` and must stay outside the relay import graph (`server/src` never imports it)."
traps:
  - "If a merge lands after a segment `fromMs`, move the row to the next aligned instant (`alignedSkySwitches` or `tools/skyCutover.mjs`) rather than keeping a past timestamp."
  - "Browser tabs still running pre-cutover code display a different sky until reloaded; the discrepancy is visual only and never stored."
dfu: []
tags:
  - sky
  - cutover
  - timescale-24
  - relay-isolation
  - weather
  - season
---

`src/net/skyLaw.js` computes the online sky clock as a pure piecewise linear function of relay wall time through `skyLawOf(SKY_SEGMENTS)`, exporting `skyClassicMinutes`, `wallMsForSkyMinutes` (the inverse), `skyMinutesPerMsAt`, and `alignedSkySwitches`.

## Segments and Aligned Cutovers

Before the first row in `SKY_SEGMENTS`, `skyClassicMinutes` matches `sharedClassicMinutes` (`src/net/wire.js`) at TimeScale 12. `SKY_SEGMENTS` defines the cutover row at `fromMs: Date.UTC(2026, 9, 3, 17, 7, 30)` with `minutesPerMs: 24 / 60 / 1000` (TimeScale 24, or one game day per real hour, chosen after a 30-minute day at TimeScale 48 proved too fast).

Every segment begins at the exact classic minute reached by the preceding segment, and its `fromMs` must sit on an aligned instant where the old and new schedules share the same time of day. If a deployment misses `fromMs`, developers advance the entry to the next aligned timestamp using `alignedSkySwitches`. `src/net/skyLaw.js` depends only on `src/net/wire.js` and is never imported by `server/src`.

## Calendar Mapping, Weather, and Festivals

`skyMinuteOfEvent` and `skySecondsOfEvent` (`src/weather/skyCalendar.js`) convert event-clock timestamps into the corresponding sky reading. Quest journal `%qdt` dates (`src/systems/quest/questMacros.js`) and weather simulations (`src/weather/weatherSim.js` and `climateSeasonFromMinutes` in `src/world/climateSwaps.js`) use this mapping so weather fronts keep event-clock cadence while drawing their hour and season from the sky.

On the account service, `server-account/src/festival.js` checks `skyClassicMinutes` for the sky day of the year, while `dayDate` and `daySeason` (`src/net/nodeLaw.js`) sample the sky at each UTC day start and can trail the live sky by up to one day.
