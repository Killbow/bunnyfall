---
slug: elite-breach-spire-client-rules-and-telegraphs
title: "Spire Made-Level Rules, Telegraphs, Camera, and HUD"
domain: rendering
kind: subcard
parent: elite-breach-spire-overview
files:
  - src/characters/madeLevel.js
  - src/worldEvents/courtRules.js
  - src/player/motor.js
  - src/player/mwView.js
  - src/render/gateTelegraph.js
  - src/world/eliteGates/egTelegraph.js
  - src/world/eliteGates/egDangerPalettes.js
  - src/world/eliteGates/pseudoArchives.js
  - src/systems/eliteGates/egOcclude.js
  - src/systems/eliteGates/egArch.js
  - src/ui/eliteGates/egBoardWindow.js
  - src/ui/eliteGates/egSpireHud.js
  - src/systems/eliteGates/egScore.js
replacesBible:
  - "11-Multiplayer/Elite-Gates.md"
related:
  - elite-breach-spire-overview
  - four-hosts-and-modal-frame
  - ui-overlays-and-localization
  - audio-midi-and-soundscape
invariants:
  - "`madeLevelOf` returns `court`, `hour`, `spire`, or `ketch`; the `spire` row bans Levitate and Slowfall, disables running leap and AvoidDeath, and sets `EG_JUMP_BUFFER_S` and `EG_LATE_PRESS_S` to 0.12 s."
  - "Natural regeneration in made levels runs at `REGEN_HELD_SHARE` (0.5) and pauses for `REGEN_HELD_HURT_MS` (5,000 ms) after taking damage (`src/worldEvents/courtRules.js`)."
  - "Enemy telegraph borders use `TELEGRAPH_EDGE_DAGON` (`[1.0, 0.24, 0.28]`), and the floor pass draws at most `EG_FLOOR_DRAWS_MAX` (32) shapes ordered by `egShapeOrder`."
traps:
  - "Foreground occluders fade to `EG_OCCLUDE_KEEP` (0.25) over `EG_OCCLUDE_FADE_S` (0.2 s) across up to `EG_OCCLUDE_VIEWS_MAX` (64) views, but first-person and witness cameras skip occlusion fading."
  - "Shaft camera pitch bias (`SPIRE_SHAFT_PITCH` 20 degrees and `SPIRE_SHAFT_RISE_M` 1 m in `src/player/mwView.js`) turns off when reduced motion is enabled."
  - "Spire pseudo-archives reserve `EG_BAND_ARCHIVES` (38241, 38251, 38261, and 38271) and `EG_ARCH_ARCHIVES` (38281–38289)."
  - "The hub signs whatever arch site the opener reports. `standCollider` therefore adds a collider only for the opener company (`mine`), so a stranger arch never blocks movement."
  - "`EG_PERIL` copies `PERIL_BEARINGS`, `PERIL_STEP_M`, `PERIL_REACH_M`, and `PERIL_RIM_M` from `src/worldEvents/gateCourt.js`, and `EG_FLOOR_NEAR_M` matches the pad of `egStampFloors` on the relay; change them together."
tags:
  - made-levels
  - telegraphs
  - camera
  - hud
  - accessibility
---

Spire client modules enforce made-level movement rules, floor telegraphs, camera occlusion, exterior arch placement, and HUD scoring.

## Made-Level Rules, Motor Buffers, and Regeneration

`madeLevelOf` (`src/characters/madeLevel.js`) classifies `court`, `hour`, `spire`, and `ketch` spaces. Inside `spire`, Levitate, Slowfall, running leap, and AvoidDeath are disabled, while `src/player/motor.js` applies a `0.12` s jump window (`EG_JUMP_BUFFER_S` and `EG_LATE_PRESS_S`). Under `src/worldEvents/courtRules.js`, passive regeneration ticks at `REGEN_HELD_SHARE` (`0.5`) and pauses for `REGEN_HELD_HURT_MS` (`5,000` ms) after taking a hit.

## Telegraphs, Occlusion, Camera, and Arch Placement

`src/world/eliteGates/egTelegraph.js`, `src/world/eliteGates/egDangerPalettes.js`, and `src/render/gateTelegraph.js` tint enemy hazard edges with `TELEGRAPH_EDGE_DAGON` (`[1.0, 0.24, 0.28]`) and cap floor overlays at `EG_FLOOR_DRAWS_MAX` (`32`), sorted by `egShapeOrder`.

In third-person views (excluding first-person and witness cameras), `src/systems/eliteGates/egOcclude.js` fades blocking geometry to `EG_OCCLUDE_KEEP` (`0.25`) over `EG_OCCLUDE_FADE_S` (`0.2` s) across up to `EG_OCCLUDE_VIEWS_MAX` (`64`) views. Vertical shafts tilt the camera by `SPIRE_SHAFT_PITCH` (`20` degrees) and `SPIRE_SHAFT_RISE_M` (`1` m in `src/player/mwView.js`) unless reduced motion is active.

`src/systems/eliteGates/egArch.js` renders the exterior breach arch at `EG_ARCH_SCALE` (`0.62`) of the gate mesh with an `EG_ARCH_BEACON_UP_M` (`400` m) beacon, requiring `EG_ARCH_CLEAR_M` (`8` m) and `EG_ARCH_ROCK_M` (`14` m) clearance, `EG_ARCH_GATE_NEAR_M` (`300` m) from gates, and `EG_ARCH_NEAR_M` (`150` m) from other arches. `src/world/eliteGates/pseudoArchives.js` maps `EG_BAND_ARCHIVES` (`38241`, `38251`, `38261`, and `38271`) and `EG_ARCH_ARCHIVES` (`38281–38289`). `createEgBoardDoor` (`src/ui/eliteGates/egBoardWindow.js`), `src/ui/eliteGates/egSpireHud.js`, and `src/systems/eliteGates/egScore.js` drive the board UI, HUD, and run score breakdown.
