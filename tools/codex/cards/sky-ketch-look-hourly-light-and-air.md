---
slug: sky-ketch-look-hourly-light-and-air
title: "Sky-Ketch Look: Hourly Light Rows, Zone Lamps, Fog, and Halos"
domain: rendering
kind: subcard
parent: sky-ketch-look-overview
files:
  - src/world/ketch/ketchAtmos.js
  - src/world/ketch/ketchShip.js
  - src/world/ketch/ketchModel.js
  - src/systems/ketch/ketchDeckHost.js
  - src/systems/ketch/ketchSky.js
  - src/systems/ketch/ketchFight.js
  - src/render/sdHalo.js
  - src/world/worldClock.js
  - src/scenes/shared.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Sky-Ketch-Look.md"
related:
  - sky-ketch-look-overview
  - sky-ketch-look-palette-and-grain
  - sky-weather-and-lighting
  - sky-ketch-voyage-clock-and-boarding
invariants:
  - "The classic set and the enhanced lane are held to the same KT_LADDER. Classic gets its own light and lamp gains (KT_HOURS row.classic) because it has no adaptive eye."
  - "A lamp glass never shadows its own light, so lamps are drawn noShadow from their own mesh."
traps:
  - "The open decks walk rows by the world daylightScale (full day past KT_DAY_FULL 0.4), not the clock hour alone."
  - "On the lane, halos are skipped (NONE). They are the classic set bloom only."
dfu: []
tags:
  - lighting
  - hours
  - fog
  - lamps
  - bloom
  - classic-set
---

# Sky-Ketch Look: Hourly Light Rows, Zone Lamps, Fog, and Halos

`src/world/ketch/ketchAtmos.js` and `src/systems/ketch/ketchDeckHost.js` blend time-of-day and interior lighting rows, exponential fog, zone lamp gains, and classic-mode halos so both the enhanced lane and classic rendering meet `KT_LADDER`.

- **Hourly and Interior Light Rows (`KT_HOURS`):** `KT_HOURS` defines six atmosphere rows: four open-deck rows (`dawn` from `5` to `7` h, `day`, `dusk` from `17` to `19.5` h, and `night` under a moon key) plus two interior zones (`below` and `cabin`). Each row specifies ambient color, sun color and directional share, fog color and density, lamp gain, an enhanced-lane scene grade (`adaptKey`, `adaptMax`, `bloom`, `vignette`, and `contrast`), and dedicated `classic` light and lamp gains for the non-adaptive classic renderer.
- **Daylight Blending and Sun Elevation:** `ketchHourLight(minute, zone, out)` writes the interpolated atmosphere into a kept record. Open decks blend between rows using world `daylightScale` (`src/world/worldClock.js` and `src/scenes/shared.js`, reaching full day past `KT_DAY_FULL = 0.4`) rather than clock hour alone. `ketchSunColor` reddens the sun at low elevation (`KT_SUN_LOW`), while `KT_TRI` sets equator weight `0.8` and ground bounce `0.35` (`src/systems/ketch/ketchSky.js`).
- **Fog, Lamps, and Classic Halos:** Open-air fog (`KT_AIR_FOG`) uses exponential density `0.0016` (down from `0.0028` so the city `800` m away keeps contrast), while below-deck haze (`KT_BELOW_FOG`) uses warm exponential density `0.012`. In `src/world/ketch/ketchShip.js` and `src/world/ketch/ketchModel.js`, lamp glass meshes draw with `noShadow`. `ketchFrameLook(eye, minute, lane, moon)` applies per-zone lamp gains, and `ketchHalosInto` feeds `SdHaloRenderer` (`src/render/sdHalo.js`) during the fight late pass (`src/systems/ketch/ketchFight.js`) on the classic set only.
