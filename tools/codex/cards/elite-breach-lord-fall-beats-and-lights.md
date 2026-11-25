---
slug: elite-breach-lord-fall-beats-and-lights
title: "Elite Breach Lord Fall Burst, Flash, Glow, and Spark Pass"
domain: rendering
kind: subcard
parent: elite-breach-lord-fall-overview
files:
  - src/systems/eliteGates/egLordFall.js
  - src/worldEvents/gateCourt.js
  - src/world/gateBoss.js
  - src/net/gateBrain.js
  - src/world/eliteGates/egHall.js
  - src/render/gateFx.js
  - src/weather/lightning.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-EG-FALL.md"
related:
  - elite-breach-lord-fall-overview
  - elite-breach-look-lord-presence-and-fall
  - elite-breach-spire-client-rules-and-telegraphs
invariants:
  - "Burst at chest = feet + hover + tall * `FALL_BURST_UP` (0.5). The flash sits at `FALL_FLASH_Y` (3) with strength `FALL_FLASH_K` (4) and range `FALL_FLASH_RANGE` (40), fading over `FALL_FLASH_MS` (400 ms, not 2.4 s)."
  - "The glow sits at hover * `egFallAloft(s)` + tall * `GLOW_UP_SHARE` (0.55), with strength `FALL_GLOW_K` (2.2) fading over `FALL_MS`."
  - "`egFallTallM(drawn)` = `BOSS_H` (5.6) * `EG_FALL_PER(drawn)`. Exactly three numbers grow with drawn size: sink, tall, and corpse scale."
  - "`egLightsWith` honors the `carried` mask the same way `withCourtLights` does, so flashes cast no shadow."
traps:
  - "Warm the spark pass (`GateFxRenderer`) while the lord stands and free it on dispose. The pass must restore cull, depth writes, blend, and vertex arrays after drawing."
  - "Size sparks by world image height, not by canvas size under render scale."
  - "`GLOW_UP_SHARE` was renamed from `GLOW_SHARE` to avoid colliding with weather `GLOW_SHARE`."
dfu: []
tags:
  - elite-gates
  - eg-fall
  - lights
  - sparks
  - constants
---

# Elite Breach Lord Fall Burst, Flash, Glow, and Spark Pass

Visual beats, dynamic lights, height scaling, and spark rendering for Elite Breach lord falls span `src/systems/eliteGates/egLordFall.js`, `src/worldEvents/gateCourt.js`, `src/world/gateBoss.js`, `src/net/gateBrain.js`, `src/world/eliteGates/egHall.js`, `src/render/gateFx.js`, and `src/weather/lightning.js`.

- **Burst, Flash, and Glow Geometry:** The particle burst originates at chest height (`feet + hover + tall * FALL_BURST_UP`, with `FALL_BURST_UP = 0.5`). The point flash spawns at height `FALL_FLASH_Y` (`3`), intensity `FALL_FLASH_K` (`4`), and radius `FALL_FLASH_RANGE` (`40`), decaying over `FALL_FLASH_MS` (`400` ms). The lingering glow tracks `hover * egFallAloft(s) + tall * GLOW_UP_SHARE` (`0.55`, named to avoid colliding with weather `GLOW_SHARE` in `src/weather/lightning.js`) at intensity `FALL_GLOW_K` (`2.2`) across `FALL_MS`.
- **Size Scaling and Shadow Suppression:** `egFallTallM(drawn)` multiplies `BOSS_H` (`5.6`) by `EG_FALL_PER(drawn)`, scaling only sink, tall, and corpse scale with drawn size. Daggerfall hurt records contain `1` frame, while winged bodies loop at `10` fps. Both `egLightsWith` and `withCourtLights` respect the `carried` mask so flashes and corpses cast no shadows.
- **Spark Pass Lifecycle:** `GateFxRenderer` warms while the lord stands, sizes sparks by world image height rather than scaled canvas dimensions, restores cull, depth writes, blend, and vertex arrays after drawing, and frees resources on dispose.
