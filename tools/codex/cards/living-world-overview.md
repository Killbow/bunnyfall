---
slug: living-world-overview
title: "Living World: Persistent Scheduled Residents"
domain: world
kind: overview
parent: null
files:
  - src/systems/livingWorld/livingSwitch.js
  - src/systems/livingWorld/livingTown.js
  - src/systems/livingWorld/seed.js
  - src/systems/livingWorld/census.js
  - src/systems/livingWorld/trips.js
  - src/systems/livingWorld/relations.js
  - src/systems/livingWorld/livingIndoors.js
  - src/net/skyLaw.js
  - src/characters/townPopulation.js
dfu:
  - Assets/Scripts/Game/Utility/PopulationManager.cs
  - Assets/Scripts/Game/MobilePersonNPC.cs
replacesBible:
  - "06-Systems/Living-World.md"
related:
  - living-world-census-schedules-and-watch
  - living-world-roads-trips-and-encounters
  - living-world-relations-and-deeds
  - living-world-indoors-and-lodgers
  - naval-and-come-sail-away
  - world-modes-and-transitions
invariants:
  - "`livingWorldOn()` checks `LIVING_WORLD_TUNING.override` and otherwise enables the simulation in Enhanced mode unless `getPref(LIVING_WORLD_KEY)` is `false`, falling back to classic random walkers (`src/characters/townPopulation.js`) when disabled or in Classic mode."
  - "Every resident identity, daily schedule, path, and street incident is a deterministic pure function of the `lwSeed` seed, static world data, and the sky clock, requiring zero network replication across multiplayer clients."
  - "Online play advances the simulation clock via `skyMinutesPerMsAt` (`SKY_SEGMENTS` in `src/net/skyLaw.js`), while offline play uses `CLASSIC_MINUTES_PER_SECOND` multiplied by the world time scale."
  - "The population timer resets to zero when it fires, so a slow frame runs at most one tick and drops the remainder. Carrying the remainder would spawn a crowd after a stall."
traps:
  - "Town builders sample `livingWorldOn()` when a settlement loads, so toggling `livingWorld` takes effect only on the next town load."
  - "Never consume shared random state or local wall-clock time outside `lwSeed` and the simulation clock, or connected players will see different residents."
tags:
  - living-world
  - residents
  - determinism
  - sky-clock
  - enhanced-skin
---

Living World replaces classic Daggerfall's disposable ambient pedestrians with deterministic, permanently named residents who follow daily schedules, travel between towns, and remember how each player character treats them.

## Switch, Clock, and Determinism

`livingWorldOn()` (`src/systems/livingWorld/livingSwitch.js`) checks `LIVING_WORLD_TUNING.override` and enables the simulation by default in Enhanced mode unless `getPref(LIVING_WORLD_KEY)` is `false`. Because town builders read this switch at settlement load, changing the preference takes effect the next time a town loads; when off, towns spawn classic walkers via `src/characters/townPopulation.js`.

Every resident minted by `mintResident` (`src/systems/livingWorld/census.js`) derives their identity, schedule, overland trips, and street encounters purely from `lwSeed` (`src/systems/livingWorld/seed.js`), static region data, and the active simulation clock. Online sessions read `skyMinutesPerMsAt` (`SKY_SEGMENTS` in `src/net/skyLaw.js`), while offline sessions multiply `CLASSIC_MINUTES_PER_SECOND` by the world time scale. Because the math is purely functional, peers see identical townsfolk without network sync.

## Architecture and Subcards

Pure simulation modules live under `src/systems/livingWorld/`, while runtime scene hosts live under `src/scenes/livingWorld/` alongside `src/systems/livingWorld/roadFights.js`, `src/systems/livingWorld/roadStands.js`, and `src/systems/livingWorld/dungeonDivers.js`.

- `living-world-census-schedules-and-watch`: town census, 04:00 day plans, street pathing, incidents, and watch shifts.
- `living-world-roads-trips-and-encounters`: caravans, road ambushes, dungeon divers, keepsakes, and port crews.
- `living-world-relations-and-deeds`: per-character regard ledger, witnessed deeds, and first-offense watch cautions.
- `living-world-indoors-and-lodgers`: interior room sounding, tavern table seating, and rental bed lodgers.
