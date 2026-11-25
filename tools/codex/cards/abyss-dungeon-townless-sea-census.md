---
slug: abyss-dungeon-townless-sea-census
title: "Abyss Dungeon Townless Region List and Sea Census"
domain: multiplayer
kind: subcard
parent: abyss-dungeons-overview
files:
  - src/net/sdLaw.js
  - src/worldEvents/sdHost.js
  - src/worldEvents/sdSite.js
  - src/formats/mapsFile.js
  - src/net/wire.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-20b.md"
related:
  - abyss-dungeons-overview
  - abyss-dungeon-director-and-census
  - abyss-dungeon-discovery-and-rift
invariants:
  - "pickSdRegion never returns a region listed in SD_TOWNLESS_REGIONS."
  - "`pickSdRegion` returns `-1` (the great cities of the Bay) when no region qualifies."
  - "SD-SEA changed no frame shapes; relay and clients deploy in either order."
  - "SD_TOWNLESS_REGIONS is a frozen list of 19 region indices: 2,3,4,6,7,8,10,12,13,14,15,24,25,27,28,29,30,31,61."
  - "The relay holds no map files, so the list is hardcoded and pinned to MAPS.BSA."
  - "getRegionIndexAt maps politic 64 (water) to region 31 (High Rock sea coast), following PlayerGPS.CurrentRegionIndex."
  - "findSdSite returns null when sdCities gives no city; hollowOf then logs '[sd] slot N: the world offers no Hollow (no site)'."
traps:
  - "`MAPS.BSA` changes require regenerating `SD_TOWNLESS_REGIONS` from `sdCities`."
  - "Every player at sea counts toward region 31, so census logic must exclude `SD_TOWNLESS_REGIONS` explicitly."
dfu: []
tags:
  - abyss-dungeon
  - hollow
  - census
  - townless
  - maps
---

# Abyss Dungeon Townless Region List and Sea Census

In `src/formats/mapsFile.js`, `getRegionIndexAt` maps politic `64` (water) to region `31` (High Rock sea coast), matching `PlayerGPS.CurrentRegionIndex`. Because every player at sea counts toward region `31`, and region `31` has no town, region census logic in `src/net/sdLaw.js` explicitly excludes townless regions.

## Townless Regions and Selection

Because the relay holds no map files, `SD_TOWNLESS_REGIONS` is a frozen hardcoded list of 19 region indices pinned to `MAPS.BSA`: `2, 3, 4, 6, 7, 8, 10, 12, 13, 14, 15, 24, 25, 27, 28, 29, 30, 31, 61`. Region `61` (Cybiades) has one place and no town, region `31` has no town, and the remaining 17 regions have no places.

A region qualifies for Hollow placement when it has at least `SD_CENSUS_MIN` (2) distinct verified accounts and has a town. `pickSdRegion(s, counts, last)` never returns a region in `SD_TOWNLESS_REGIONS`, rests the previous Hollow region while another qualifies, breaks ties with `sdRoll(s, 1)`, and returns `-1` when none qualify (`SD_LIFETIME_MS` is 48 hours; `SD_COOLDOWN_MS` is 2 hours).

## Client Site Resolution

In `src/worldEvents/sdSite.js` and `src/worldEvents/sdHost.js`, `sdCities(locations, r)` lists regional cities and `findSdSite(rec, scan, cities, ground)` picks the first dry site, or falls back to the great cities when `sdCities` returns empty.
