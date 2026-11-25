---
slug: online-waits-overview
title: "Online Waits: Service Hours and the Sweep of Unrestable Clocks"
domain: systems
kind: overview
parent: null
files:
  - src/world/buildingLocks.js
  - src/characters/interiorPeople.js
  - src/scenes/worldModes.js
  - src/world/worldTick.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Online-Waits.md"
related:
  - online-time-arc-overview
  - online-time-quest-delays-and-deadlines
  - online-waits-awaited-quest-waves
  - online-waits-daedra-summoning-by-name
  - online-waits-banishment-on-the-sky-calendar
  - lockpicking-overview
invariants:
  - "Offline, every wait in this arc keeps DFU behavior exactly: classic service hours, wave intervals, calendar-day summoning and a thirty-day banishment on the one clock."
  - "Online, `onlineReliefBuilding(type)` is true for shops, GuildHall, Bank, Library and Palace. `buildingHoursState` returns `{ open: true, classicOpen: false, staffing: SHOP_STAFFING.ONLINE_SHIFT }` for a relieved building outside its classic hours."
  - "`online` in `buildingHoursState` defaults to `sharedClockOn()`, the shared clock and not the URL."
  - "Residences, ships and every other non-relieved type keep `classicBuildingOpen` exactly. Temples and taverns are 0-25 in `OPEN_HOURS`/`CLOSE_HOURS` and never close."
traps:
  - "Suns Rest is a shop closure (`holidayClosed`). Online, it is covered by the relief shift like any other classic closure. Do not describe it as unchanged online."
  - "`onlineReliefBuilding` is a predicate, not a second hours table. Door access (`buildingIsUnlocked`, `resolveBuildingUnlocked`), interior people (`AddPeople`/`UpdateNpcPresence`) and shelves all read `buildingHoursState`. Add new relieved types only there."
  - "`SHOP_STAFFING` keeps its OL4 name even though it now covers every relieved type."
dfu:
  - Assets/Scripts/Game/PlayerActivate.cs
tags:
  - online
  - waits
  - service-hours
  - bank
  - library
  - palace
  - ol6
---

# Online Waits: Service Hours and the Sweep of Unrestable Clocks

Online play binds the sky day to one real hour (`TimeScale 24`) and the event day to two real hours (`TimeScale 12`), while rests, loiters, and journeys advance only the character clock. Because players cannot rest through shared-clock schedules, the Online Waits arc adjusts four unrestable timers while keeping offline DFU behavior unchanged: service hours (`WAIT1`/`OL6`), awaited quest waves (`WAIT2`), Daedra summoning by name (`WAIT3`), and sky-calendar banishment terms (`WAIT4`).

## Service Hours and the Online Relief Shift

- **Relieved building types (`src/world/buildingLocks.js`):** `onlineReliefBuilding(type)` returns `true` for shops, `GuildHall`, `Bank` (classic `8-15`), `Library` (`9-23`), and `Palace` (`10-16`). When `online` holds (defaulting to `sharedClockOn()` rather than URL parameters), `buildingHoursState` returns `{ open: true, classicOpen: false, staffing: SHOP_STAFFING.ONLINE_SHIFT }` outside classic hours, including during the Suns Rest shop closure (`holidayClosed`).
- **Single hours authority (`src/characters/interiorPeople.js`, `src/scenes/worldModes.js`):** Door locks (`buildingIsUnlocked` and `resolveBuildingUnlocked`), interior NPCs (`AddPeople` and `UpdateNpcPresence` keeping clerks, scholars, and court NPCs present), and shop shelves all read `buildingHoursState`.
- **Unchanged schedules:** Residences, ships, and other non-relieved buildings obey `classicBuildingOpen` (`OPEN_HOURS`/`CLOSE_HOURS`, where temples and taverns already span `0-25`), while loiter night intervals, holiday windows, the full-moon lock, and relay cadences remain untouched.
