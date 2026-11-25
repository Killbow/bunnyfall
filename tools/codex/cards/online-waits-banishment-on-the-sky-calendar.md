---
slug: online-waits-banishment-on-the-sky-calendar
title: "Banishment Terms on the Sky Calendar"
domain: systems
kind: subcard
parent: online-waits-overview
files:
  - src/justice/standing.js
  - src/weather/skyCalendar.js
  - src/saves/offlineCopy.js
  - src/world/regionConditions.js
  - src/world/worldTick.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Online-Waits.md"
related:
  - online-waits-overview
  - online-time-sky-law-and-cutover
  - online-time-arc-overview
invariants:
  - "`banishmentEnd(worldNow) = eventMinuteOfSky(skyMinuteOfEvent(worldNow) + BANISHMENT_MINUTES)`, with `BANISHMENT_MINUTES = 30 * 1440`. The term is thirty sky-calendar days (about thirty real hours), stamped on the event clock."
  - "When `setSkyCalendar` is off (offline, or a shared clock with no sky), both conversions are the identity and the term is the classic thirty days on the one clock."
  - "`banishmentDaysLeft` measures the sky span from now to the end and returns `Math.max(1, Math.ceil((span - CALENDAR_EPSILON_MINUTES) / 1440))`, so a partial day counts as a full day."
  - "`worldSpanRealWords` rounds real minutes and hours up with `Math.ceil`, never down."
traps:
  - "Never size a term by multiplying by the rate at the stamp. Always go through `skyMinuteOfEvent`/`eventMinuteOfSky`, so a term that spans a sky-rate change stays exact (AUDIT WAITS B4)."
  - "When a save crosses between online and offline, `offlineCopyOf`/`onlineCopyOf` call `moveBanishments`, which rebases each `regionConditions` entry's serialized `b` (`banishedUntil`) using `skyOfEventLaw`/`eventOfSkyLaw`. These use the sky law regardless of what the page has installed. Otherwise a term could lift instantly or stretch for hundreds of days (AUDIT WAITS B1)."
  - "An untrusted world clock (`NaN`) stamps nothing and lifts nothing (AUDIT REP F2)."
dfu: []
tags:
  - justice
  - banishment
  - sky-calendar
  - online
  - banish-sky
  - saves
---

# Banishment Terms on the Sky Calendar

Before `BANISH-SKY`, regional banishment (`REP3`) ran for thirty days on the event clock (sixty real hours). `src/justice/standing.js` and `src/weather/skyCalendar.js` measure the thirty-day term on the sky calendar (`BANISHMENT_MINUTES = 30 * 1440`, about thirty real hours online) while stamping `banishedUntil` (`b` in `src/world/regionConditions.js`) on the event clock.

## Sky-Calendar Conversion, Expiry, and Save Rebasing

- **Stamp and conversion law (`banishmentEnd`):** Computes `eventMinuteOfSky(skyMinuteOfEvent(worldNow) + BANISHMENT_MINUTES)` rather than multiplying by a point-in-time rate, keeping terms exact across sky-rate cutovers (`AUDIT WAITS B4`). When `setSkyCalendar` is inactive (offline or without a sky clock), both functions act as the identity. An untrusted `NaN` world clock neither stamps nor lifts a banishment (`AUDIT REP F2`).
- **Remaining display, expiry, and pardon:** `banishmentDaysLeft` measures the remaining sky-minute span and returns `Math.max(1, Math.ceil((span - CALENDAR_EPSILON_MINUTES) / 1440))`, while `worldSpanRealWords` rounds real minutes and hours up with `Math.ceil`. `isBanished` clears the term on the first read past `banishedUntil`, and `grantPardon` clears it early at a temple for `PARDON_BASE_PRICE` (`2500`) multiplied by the regional pardon count plus one.
- **Cross-mode save rebasing (`src/saves/offlineCopy.js`):** `offlineCopyOf` and `onlineCopyOf` invoke `moveBanishments` to rebase each region's serialized `b` (`banishedUntil`) through `skyOfEventLaw` and `eventOfSkyLaw` independent of the active page state (`AUDIT WAITS B1`).
