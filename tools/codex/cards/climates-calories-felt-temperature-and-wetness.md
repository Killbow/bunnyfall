---
slug: "climates-calories-felt-temperature-and-wetness"
title: "Felt Temperature, Clothing Warmth, and Wetness"
domain: "systems"
kind: "subcard"
parent: "climates-calories-survival-overview"
files:
  - "src/systems/survival/temperature.js"
  - "src/systems/survival/env.js"
  - "src/systems/survival/hearth.js"
  - "src/ui/temperatureCard.js"
  - "src/ui/enhancedHud.js"
  - "src/ui/statsCard.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Climates-Calories.md"
related:
  - "climates-calories-survival-overview"
  - "climates-calories-needs-clock-and-boons"
  - "sky-weather-and-lighting"
  - "loot-ii-resist-cap-luck-and-wardrobe"
invariants:
  - "`feltTemperature(env, worn, ctx)` (`src/systems/survival/temperature.js`) adds `+15` near a lit fire (`env.byFire`), subtracts `trunc(wet / 20)` for wetness, and applies `NAKED_OFFSET` (`-5`)."
  - "A carried drink cools a reading above 9 by WATER_COOLS (10) but never below 9 (AUDIT TEMP-UI E8); vampires excluded."
  - "Resistances act on world air only, never on body warmth."
  - "CLIMATE_TEMP Ocean is 0 (AUDIT C&C correction of the 1.7.1 reading)."
  - "weatherWetGain scales rain/thunder/snow by the fall level (1 on the classic sky); fog is unscaled (WET-FALL)."
traps:
  - "COVERING_CHEST is robes only (163, 164, 200, 201); cloaks cover the cuirass through armorWarmth, not this set."
  - "WEATHER_WET rows are [bare, cloak, hood]; AUDIT C&C T2 un-swapped rain and snow."
  - "Clothes ease toward half warmth one degree per degree above CLOTHES_BREATHE_ABOVE (10), not all at once."
dfu:
  - "Assets/Scripts/Game/Entities/PlayerEntity.cs"
tags:
  - "temperature"
  - "weather"
  - "wetness"
  - "clothing"
  - "hud"
---

# Felt Temperature, Clothing Warmth, and Wetness

`src/systems/survival/temperature.js` and `src/systems/survival/env.js` compute ambient and felt temperature from climate, month, hour, weather, hearth proximity, wetness, and wardrobe, feeding `feltNow(entity)` into `src/ui/enhancedHud.js`, `src/ui/temperatureCard.js`, and `src/ui/statsCard.js`.

## Ambient Air, Fires, and Wetness

`naturalTemperature` sums `CLIMATE_TEMP` (where `Ocean` is `0`), `MONTH_TEMP`, the `NIGHT_MULT` hourly curve, and `WEATHER_TEMP`, while `temperatureBreakdown` itemizes each term for the UI. Magic resistances act only on world air, never on body warmth. `src/systems/survival/hearth.js` treats archive `210` records `0`, `1`, and `20` within `HEARTH_NEAR` (`16` m) as world fires.

`weatherWetGain` scales rain, thunder, and snow by the precipitation fall level (`1` on the classic sky) while keeping fog unscaled, using `WEATHER_WET` rows `[bare, cloak, hood]` up to `WET_MAX` (`300`).

## Felt Reading and Wardrobe

`feltTemperature(env, worn, ctx)` adds `+15` near a lit fire (`env.byFire`), subtracts `trunc(wet / 20)`, and applies `NAKED_OFFSET` (`-5`). A carried drink cools readings above `9` by `WATER_COOLS` (`10`) without dropping below `9` (excluding vampires). `COVERING_CHEST` contains robes only (`163`, `164`, `200`, `201`), whereas cloaks cover the cuirass inside `armorWarmth` (`CLOAK_WARMTH` by variant, formal cloaks `x3`, `HOOD_SHADE` `10`). Above `CLOTHES_BREATHE_ABOVE` (`10`), clothing eases toward half warmth by one degree per degree.
