---
slug: living-world-ii-outlaw-bands-and-hideouts
title: "Outlaw Bands, Hideout Camps, Simulated Robberies, and Loot Recovery"
domain: world
kind: subcard
parent: living-world-ii-overview
files:
  - src/systems/livingWorld/outlaws.js
  - src/systems/livingWorld/trouble.js
  - src/systems/livingWorld/hideouts.js
  - src/systems/livingWorld/lines.js
  - src/ui/travelViewHud.js
  - src/systems/survival/camp.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Living-World-II.md"
related:
  - living-world-ii-overview
  - living-world-ii-wagon-trains-and-caravan-counters
  - living-world-roads-trips-and-encounters
  - travel-view-roaming-bands-and-threat
invariants:
  - "`bandCount` caps regional outlaw camps at `BANDS_MAX` (`4`) hideouts per region, scaling at one base camp plus one per `BAND_TOWNS_PER` (`40`) towns."
  - "Clearing a hideout leaves it vacant for `BAND_VACANT_DAYS` (`20`) game days before `genAt` and `outlawBandAt` mint a new band generation; unrouted bands also rotate every `BAND_ERA_DAYS` (`60`) days."
  - "Simulated road encounters rout the attacking band at `ROUT_CHANCE` (`0.45` on patrolled roads and `0.15` on unpatrolled wild roads)."
traps:
  - "Lock hideout chest contents on the first container delta (`bandChest`, budgeted at `CHEST_SLICE_MS` = `3` ms) so players cannot duplicate recovered spoils."
  - "Wait for road path planning to complete before confirming a dry-ground hideout camp position."
dfu: []
tags:
  - outlaws
  - bandits
  - hideouts
  - robbery
  - loot
---

Named outlaw bands establish roadside hideout camps, ambush nearby travelers, store stolen coin and goods in camp chests, and regenerate after a rout.

## Regional Bands and Hideout Placement

In `outlaws.js`, `bandCount` assigns up to `BANDS_MAX` (`4`) bands per region (one plus one per `BAND_TOWNS_PER` = `40` settlements). `hideoutsOf` places each camp `BAND_LEG_PX` (`3` to `14` map pixels) along a road near a town of at least `BAND_TOWN_BLOCKS` (`4`) blocks, offset by `HIDEOUT_OFF_PX` (`1` to `2` pixels). `outlawBandName` combines `BAND_WORDS` and `BAND_NOUNS`, while `bandPeople` populates `BAND_SIZE` (`4` to `8`) members drawn from `OUTLAW_CLASSES`. `genAt` and `outlawBandAt` advance the band generation every `BAND_ERA_DAYS` (`60`) days or `BAND_VACANT_DAYS` (`20`) days after a rout.

## Simulated Robberies, Scene Camps, and Spoils

`bandTrouble` (`trouble.js`) attributes road ambushes within `OUTLAW_REACH_PX` (`2` pixels) to the local band and rolls `ROUT_CHANCE` (`0.45` under patrol cover, `0.15` otherwise). When a band robs a caravan, `takeOf` retains spoils from the past `TAKE_DAYS` (`14`) days: `TAKE_PURSE_SHARE` (`0.25`) of each victim purse plus `TAKE_GOODS` (`2`) stolen items per robbery, capped at `TAKE_GOODS_MAX` (`16`) items.

At runtime, `hideouts.js` spawns camp scenes within `BAND_LIVE_M` (`200` m) and despawns them beyond `BAND_KEEP_M` (`280` m), placing tents (`TENT_MODEL` = `41606`) around a `TENT_RING_M` (`6` m) ring and filling `bandChest` within `CHEST_SLICE_MS` (`3` ms). Town rumors (`lines.js`) trigger within `HEARD_PX` (`3` pixels), and `travelViewHud.js` draws discovered camps at radius `TV_HIDEOUT_R` (`11`).
