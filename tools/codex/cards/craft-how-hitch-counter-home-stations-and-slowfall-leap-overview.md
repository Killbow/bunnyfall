---
slug: craft-how-hitch-counter-home-stations-and-slowfall-leap-overview
title: "Craft How-To Notes, Hitch Counter, Account Home Stations, and Slowfall Leaps"
domain: ui
kind: overview
parent: null
files:
  - src/ui/profPages.js
  - src/ui/tutorialCatalogue.js
  - src/ui/fpsCounter.js
  - src/platform/frameClock.js
  - src/homes/onlineHomes.js
  - src/homes/homeRent.js
  - src/scenes/worldModes.js
  - src/ui/inputActions.js
  - src/ui/plusPad.js
  - src/player/motor.js
  - src/combat/techniques.js
routes:
  - /v1/homes/town
tables:
  - homes
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-18d.md"
related:
  - elite-breach-duel-ring-storeys-and-sapper-burnout
  - dungeon-seat-live-host-arbitration
  - home-station-door-overview
  - market-vendors-and-professions
  - weapon-technique-runner-and-refusals
  - performance-priority-overview
invariants:
  - "`CRAFT_HOW` (`src/ui/profPages.js`) renders how-to notes for Smithing, Building, Outfitting, and Provisioning (`GATHER_HOW` covers gathering), while `journalKeyLabel` formats `Chronicle: <page> (Enhanced Plus) / <classic> (Classic)`."
  - "`src/ui/fpsCounter.js` flags frames taking `HITCH_MS = 50` ms or longer, retains hitch seconds for `HITCH_KEEP_MS = 60_000` ms alongside `frameSampleAt(stamp)` (`src/platform/frameClock.js`), and listens to `visibilitychange` so hidden tabs never report `0` FPS."
  - "`homeStationsServe(home)` checks `home?.mine === true`, and `stationOwnerHere` grants crafting-station access to every character on the owning account outside private visits while keeping storage, bed (`homeBedIsMine`), and decorator gated on `decorOwnerHere()`."
  - "`motor.techniqueLaunch` and `src/combat/techniques.js` refuse leaps under Slowfall only while airborne, allowing grounded Leap Strike and Flying Kick launches under normal gravity (`techFlight`) before resuming Slowfall glide."
traps:
  - "`homeStationsServe` applies to online service homes (`home.mine`), not offline deed-house furniture stored inside per-character saves."
  - "`ONLINE_CHECKPOINT_MS` in `src/saves/onlineCheckpoint.js` is `300_000` ms (`5` min), and `LIFT_FIELDS_KEPT` in `src/world/landformLiftWorld.js` is `32`."
dfu: []
tags:
  - crafting
  - fps
  - home-stations
  - keybinds
  - slowfall
  - techniques
---

# Craft How-To Notes, Hitch Counter, Account Home Stations, and Slowfall Leaps

Profession how-to notes, hitch tracking, account-wide home crafting stations, and grounded Slowfall leaps span `src/ui/profPages.js`, `src/ui/fpsCounter.js`, `src/homes/onlineHomes.js`, `src/player/motor.js`, and `src/combat/techniques.js`.

## Profession Notes and Frame Hitch Counter

- **Craft and keybind notes:** `CRAFT_HOW` (`src/ui/profPages.js`) renders how-to notes for Smithing, Building, Outfitting, and Provisioning (`GATHER_HOW` covers gathering), while `journalKeyLabel` (`src/ui/tutorialCatalogue.js`, `src/ui/inputActions.js`, and `src/ui/plusPad.js`) formats `Chronicle: <page> (Enhanced Plus) / <classic> (Classic)`.
- **Hitch window and pacing constants:** `src/ui/fpsCounter.js` marks frames taking `HITCH_MS = 50` ms or longer, retains hitch seconds for `HITCH_KEEP_MS = 60_000` ms alongside `frameSampleAt(stamp)` (`src/platform/frameClock.js`), and listens to `visibilitychange` so hidden tabs never report `0` FPS. Related background bounds include `ONLINE_CHECKPOINT_MS = 300_000` (`src/saves/onlineCheckpoint.js` `checkpointWhenDue`) and `LIFT_FIELDS_KEPT = 32` (`src/world/landformLiftWorld.js`).

## Account Home Stations and Slowfall Leaps

- **Account-shared stations (`/v1/homes/town`, `homes`):** `homeStationsServe(home)` (`src/homes/onlineHomes.js` and `src/homes/homeRent.js`) checks `home?.mine === true` on online service homes (not offline per-character save houses), and `stationOwnerHere` (`src/scenes/worldModes.js`) grants station use to any character on the owning account outside private visits while storage, bed (`homeBedIsMine`), and decorator stay gated on `decorOwnerHere()`.
- **Grounded Slowfall launches:** `motor.techniqueLaunch` (`src/player/motor.js`) and `src/combat/techniques.js` refuse leaps under Slowfall only while airborne, running grounded Leap Strike and Flying Kick arcs under normal gravity (`techFlight`) before resuming Slowfall glide.
