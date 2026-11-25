---
slug: abyss-dungeon-director-and-census
title: "Hub Director, Census, and Site Placement"
domain: multiplayer
kind: subcard
parent: abyss-dungeons-overview
files:
  - src/net/sdLaw.js
  - src/net/sdHerald.js
  - src/net/wire.js
  - server/src/index.js
  - src/worldEvents/sdSite.js
routes:
  - "/internal/sd/census"
  - "/internal/sd/found"
  - "/internal/sd/live"
  - "/internal/sd/fell"
  - "/internal/sd/in"
tables: []
replacesBible:
  - "11-Multiplayer/Super-Dungeons.md"
related:
  - abyss-dungeons-overview
  - abyss-dungeon-discovery-and-rift
invariants:
  - "The relay never loads `MAPS.BSA`; it picks a region and slot while clients deterministically select the dungeon site from local map data."
  - "Hollow slot numbers (`sdslot`) strictly increase up to `SD_SLOT_MAX` (999,999,999) without reuse."
traps:
  - "Iterate over `SD_REGION_COUNT` (`CHAT_REGION_COUNT`) for census queries rather than a hardcoded integer."
  - "`SD_FADE_GRACE_MS` (15 seconds) is a hub-only grace delay after `until` expires; clients compare timestamps against `until` directly."
tags:
  - super-dungeons
  - hub
  - census
  - discord
---

The hub director in `server/src/index.js` and `src/net/sdLaw.js` schedules one global Hollow at a time, persists state under the `sdev` room key (`SD_KEY` in `src/net/wire.js`), and tracks the highest assigned slot in `sdslot` (`SD_SLOT_KEY`). After a fresh hub boot, the first Hollow rises after `SD_FIRST_RISE_MS` (10 minutes).

## Region Census and Fallback

When rising, the hub queries every region room across `SD_REGION_COUNT` via `/internal/sd/census`. The census counts distinct verified accounts per region and excludes guests. Qualifying regions need at least `SD_CENSUS_MIN` (2) verified accounts and must not appear in `SD_TOWNLESS_REGIONS` (19 excluded regions, including sea region 31 and Cybiades 61). The hub breaks ties with a slot hash and skips the previous Hollow's region whenever another region qualifies. If no region meets the threshold, a region `-1` fallback selects one of the `SD_GREAT_CITIES` (8) by slot hash.

## Deterministic Site Placement and Herald

Because the relay holds no map archives, `src/worldEvents/sdSite.js` resolves the exact dungeon on the client from the slot and region, filtering for labyrinth or keep templates with at least `SD_TEMPLATE_MIN_BLOCKS` (12) interior blocks.

Found Hollows fade `SD_FADE_GRACE_MS` (15 seconds) after `until` expires, while unfound Hollows fade silently. The Discord Herald (`src/net/sdHerald.js`, state key `sdherald`) posts rise and discovery notices with a role ping, and posts fall and found-fade notices without a ping.
