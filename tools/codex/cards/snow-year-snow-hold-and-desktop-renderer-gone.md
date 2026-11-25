---
slug: snow-year-snow-hold-and-desktop-renderer-gone
title: "Black Screen: Snow Year Origins, Snowfall Queue Pruning, and Desktop Renderer Gone"
domain: world
kind: subcard
parent: belt-waist-lanterns-and-festival-cake-cap-overview
files:
  - src/weather/snowpack.js
  - src/weather/snowCoverHost.js
  - src/weather/snowfallRuntime.js
  - src/weather/snowfallHost.js
  - src/world/pixelBuild.js
  - app/lib/rendererGone.cjs
  - app/main.cjs
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-21b.md"
related:
  - belt-waist-lanterns-and-festival-cake-cap-overview
  - biome-precipitation-snowpack-and-ground
  - pixel-streaming-and-origin-shift
  - webgl2-renderer-and-textures
invariants:
  - "SNOW-YEAR: `yearOriginOf(t)` (snowpack.js) computes `eventMinuteOfSky(Math.round(sky - since))` before flooring onto `SNOWPACK.stepMinutes` (three hours), so each snow year has exactly one origin."
  - "`snowCoverHost.js` re-reads the clock's minute on every pass of a build's `settle` wait, so a pixel build waiting on snow (pixelBuild.js `await snowCover.settle(breather)`) completes across a year boundary."
  - "SNOW-HOLD: `_blanketPrune` (snowfallRuntime.js, every `BLANKET.pruneSeconds`, the mod's 5 s) filters `B.queue` to tiles still in the live rings and rebuilds `B.queued`. Deactivating the blanket lets the queue go."
  - "snowfallHost.js marks a rebuilt tile only with `replaced = true` and hands the old tile to the runtime through `promotions` (`terrainPromoted`). Tiles never hold the tile they replaced."
traps:
  - "Before the fix, a fractional float minute moved the floor in 2.7% of minutes, giving two origins a step apart. Askers a minute apart kept resetting each other's lattice points, and the pixel build waited forever."
  - "Before the fix, queued tiles stayed in the snowfall queue while the local tier kept recentring, about 1.8 MB of JS heap per map pixel streamed."
  - "RENDERER-GONE: app/lib/rendererGone.cjs offers Restart/Quit when the page process is gone and Wait/Restart on `unresponsive`, and writes the reason to `crash.log` beside the saves. A browser tab's 'Aw, Snap' cannot be drawn over."
dfu: []
tags:
  - snow
  - weather
  - streaming
  - memory
  - electron
  - crash-log
---

# Black Screen: Snow Year Origins, Snowfall Queue Pruning, and Desktop Renderer Gone

Snow-year origin rounding, snowfall blanket queue pruning, and desktop Electron renderer-crash recovery are implemented across `src/weather/snowpack.js`, `src/weather/snowCoverHost.js`, `src/weather/snowfallRuntime.js`, `src/weather/snowfallHost.js`, `src/world/pixelBuild.js`, `app/lib/rendererGone.cjs`, and `app/main.cjs`.

## Snow-Year Origin Rounding and Blanket Queue Pruning

- **Single snow-year origin:** In `src/weather/snowpack.js`, `yearOriginOf(t)` evaluates `eventMinuteOfSky(Math.round(sky - since))` before flooring onto `SNOWPACK.stepMinutes` (three hours), preventing float minutes from producing two origins one step apart. `src/weather/snowCoverHost.js` (with arrival budget `SNOW_COVER.arriveMs = 40`) re-reads the clock minute on each `settle` pass so `await snowCover.settle(breather)` in `src/world/pixelBuild.js` completes across year boundaries.
- **Snowfall queue pruning:** Every `BLANKET.pruneSeconds` (5 seconds), `_blanketPrune` (`src/weather/snowfallRuntime.js`) filters `B.queue` to tiles still inside live streaming rings and rebuilds `B.queued`, while deactivating the blanket releases the queue. `src/weather/snowfallHost.js` marks rebuilt tiles with `replaced = true` and passes prior tiles via `promotions` (`terrainPromoted`) without retaining replaced tile references.

## Desktop Renderer Crash and Hang Prompts

In the Electron shell, `app/main.cjs` imports `goneAsk`, `hangAsk`, `restarts`, `restartsHung`, `createStopCount`, `goneLine`, and `logWith` from `app/lib/rendererGone.cjs`, prompting Restart/Quit on renderer exit, Wait/Restart on `unresponsive`, and logging reasons to `crash.log` beside the saves.
