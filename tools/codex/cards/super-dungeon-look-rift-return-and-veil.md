---
slug: super-dungeon-look-rift-return-and-veil
title: "Abyss Dungeon Look: Rift Ring, Return Portal, and Hour Veil"
domain: multiplayer
kind: subcard
parent: super-dungeon-look-overview
files:
  - src/world/sdDungeon.js
  - src/world/sdRiftModel.js
  - src/world/sdRiftArt.js
  - src/worldEvents/sdEnd.js
  - src/worldEvents/sdFx.js
  - src/render/sdRiftPass.js
  - src/render/sdBeam.js
  - src/render/gateVeil.js
  - src/ui/gateVeil.js
  - src/worldEvents/sdRiftSound.js
  - src/net/sdLaw.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Super-Dungeons-Look.md"
related:
  - super-dungeon-look-overview
  - abyss-dungeon-discovery-and-rift
  - world-modes-and-transitions
invariants:
  - "`riftLook(rec, s, now)` (`src/world/sdDungeon.js`) derives the Rift state fresh every frame from the hub record without caching: `SD_RIFT_NOT_YET` when absent or `risen`, `SD_RIFT_CLOSED` for a different slot, `SD_RIFT_REFUSED` (red) when caller-supplied `fallen` is true, one of 24 hour looks while `found`, or the 24-stud collapse look over `SD_COLLAPSE_MS` (`3` minutes) while `fell`."
  - "Animated Rift and Return meshes carry `noShadow` so their motion never triggers shadow-cube rebuilds under `everyLightCasts`."
  - "`sdReturnPlace` places the Return portal beside the Rift at `SD_RETURN_GAP_M` past the rim on the first unobstructed bearing, falling back to `1.5` meters out or a lower floor."
  - "`returnOut()` releases every GPU mesh handle created for the Return portal."
traps:
  - "`riftLook` returns a single shared, mutated `COLLAPSE_LOOK` object during collapse; consume it within the current frame and never store a reference across frames."
  - "Late-joining clients rebuild Return assembly progress and beacon state from elapsed time (`sdHomeAge` over `SD_HOME_RISE_MS = 1500` ms) rather than waiting for a replayed event."
dfu: []
tags:
  - super-dungeons
  - rift
  - portal
  - veil
  - transition
---

The Rift ring, Return arch, and Hour Veil render portals between the Hollow and the Shattered Hour (`src/world/sdDungeon.js`, `src/worldEvents/sdEnd.js`, and `src/render/gateVeil.js`).

## Rift States, Geometry, and Return Placement

`riftLook(rec, s, now)` evaluates the hub record (`src/net/sdLaw.js`) each frame: `SD_RIFT_NOT_YET` when missing or `risen`, `SD_RIFT_CLOSED` when the slot differs, `SD_RIFT_REFUSED` when `fallen` is true, an hour look (`1` to `24`) while `found`, or the shared `COLLAPSE_LOOK` (24 studs counting down over `SD_COLLAPSE_MS = 3` minutes) while `fell`.

`sdRiftFit` and `sdRiftSweep` fit the ring in cramped rooms (`SD_RIFT_PROBE_M = 12`, `SD_RIFT_AIR_M = 0.3`, and `SD_RIFT_TOP = riftCentreY(1) + 0.5`). `src/world/sdRiftModel.js` and `src/world/sdRiftArt.js` build the ring via `buildRiftStatic`, `buildRiftGear`, `buildHourRing`, `buildRiftStuds`, and `buildRiftShard`, drawn by `src/render/sdRiftPass.js` and `src/render/sdBeam.js`. `buildReturnModel(w, h)` builds the Return arch (`SD_RETURN_SIZE` `{ w: 1.3, h: 2.3 }` scaled by `SD_HOME_SCALE = 1.5`), placed by `sdReturnPlace` and freed by `returnOut()`. `inSdPortal(feet, at, reach, height)` checks entry (`SD_RIFT_PRESS_M = 0.35`).

## Audio, Effects, and Veil Timings

`src/worldEvents/sdRiftSound.js` plays a `RIFT_BELL_SECONDS` (`6.5` s) toll (`SD_HOME_TOLL` `{ pitch: 4/3, refDistance: 6, maxDistance: 70 }`), while `src/worldEvents/sdFx.js` drops peer effects older than `SD_FX_LATE_MS` (`1500` ms) and ages the Return via `sdHomeAge` (`SD_HOME_RISE_MS = 1500` ms). `GateVeilRenderer` (`src/render/gateVeil.js` and `src/ui/gateVeil.js`) applies `VEIL_CLOSE_S` (`1.2` s), `VEIL_OPEN_S` (`1.7` s), `VEIL_HOLD_MAX_S` (`20` s), `VEIL_FRONT_IN` (`-0.55`), and `VEIL_FRONT_OUT` (`1.4`) across `VEIL_THEMES` (`hourIn`, `hourBack`, `hourHome`, and `hourCast`) and `VEIL_HOUR_CUES`, skipping shut-phase ratchet and blade motion under `prefers-reduced-motion`.
