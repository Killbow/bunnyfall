---
slug: elite-breach-orrery-stone-reach
title: "Orrery Stone Client Reach Gate and Activation Routing"
domain: multiplayer
kind: subcard
parent: elite-breach-orrery-sight-overview
files:
  - src/systems/eliteGates/egClient.js
  - src/systems/eliteGates/spireOrrery.js
  - src/player/activate.js
  - src/worldEvents/sdHall.js
  - src/scenes/worldModes.js
  - src/scenes/world.js
  - src/scenes/dungeonContext.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-17e.md"
related:
  - elite-breach-orrery-sight-overview
  - elite-breach-orrery-fair-still-and-landed-overview
invariants:
  - "When planar distance from player to stone exceeds `EG_STONE_REACH_M` (`3.5` m), `egClient.js` suppresses the turn packet and displays `SD_HALL_TEXT.closer` (`Stand closer to the stone.`)."
  - "`src/scenes/worldModes.js` forwards `egstone:` activation keys to `dungeonCtx.egPress` (`registerSpireObjs` and `registerSpireAct` in `src/scenes/world.js`)."
traps:
  - "`DEFAULT_ACTIVATION_DISTANCE` (`3.2` m in `src/player/activate.js`) can intersect a stone handle box from `4.4` m planar distance, where the relay silently drops out-of-reach turns unless gated client-side."
dfu: []
tags:
  - orrery
  - reach
  - activation
  - elite-breach
---

# Orrery Stone Client Reach Gate and Activation Routing

Client-side reach gating and activation routing for Athenaeum Orrery stones span `src/systems/eliteGates/egClient.js`, `src/systems/eliteGates/spireOrrery.js`, `src/player/activate.js`, `src/worldEvents/sdHall.js`, `src/scenes/worldModes.js`, `src/scenes/world.js`, and `src/scenes/dungeonContext.js`.

## Activation Ray Versus Planar Reach (`EG_STONE_REACH_M`)

- **Handle box geometry trap:** A player activation ray cast at `DEFAULT_ACTIVATION_DISTANCE` (`3.2` m in `src/player/activate.js`) can intersect the elevated handle box of an Orrery stone while the player stands up to `4.4` m away in planar distance. Because the relay enforces planar proximity and silently drops out-of-reach turn packets, ungated lever presses at the edge of the activation ray fail without feedback.
- **Client reach gate:** When the planar distance from the player to the target stone center exceeds `EG_STONE_REACH_M` (`3.5` m), `src/systems/eliteGates/egClient.js` suppresses the outbound turn packet and immediately displays `SD_HALL_TEXT.closer` (`Stand closer to the stone.` from `src/worldEvents/sdHall.js`), giving clear player feedback without altering relay protocol rules.

## Activation Key Routing (`egstone:`)

In `src/scenes/world.js`, `registerSpireObjs` and `registerSpireAct` bind Spire interactions onto `dungeonCtx.egPress` (`src/scenes/dungeonContext.js`), and `src/scenes/worldModes.js` forwards `egstone:` activation keys directly to `dungeonCtx.egPress`.
