---
slug: travel-view-roaming-bands-and-threat
title: "Roaming Enemy Bands, Wild Alert, and the Threat Governor"
domain: world
kind: subcard
parent: travel-view-overworld-overview
files:
  - src/travel/travelBands.js
  - src/travel/travelThreat.js
  - src/travel/regionChase.js
  - src/travel/regionChaseHost.js
  - src/ai/wildAlert.js
  - src/characters/exteriorFoes.js
  - src/player/motor.js
  - src/travel/travelDungeonModels.js
replacesBible:
  - "06-Systems/Travel-View.md"
related:
  - travel-view-overworld-overview
  - travel-view-traveller-marks-and-hud
  - enemy-ai-navmesh-and-combat-tactics
invariants:
  - "Roaming bands seed per `BAND_CELL_PX` (`2`-pixel cell) for `BAND_LIFE_MS` (`12` min) with spawn probabilities `BAND_CHANCE_DAY` (`0.75`) by day and `BAND_CHANCE_NIGHT` (`0.9`) at night."
  - "Bands patrol at `BAND_WANDER_MPS` (`2` m/s) and pursue targets at `BAND_CHASE_MPS` (`5.2` m/s) within a `BAND_LEASH_M` (`900` m) leash before breaking off after `120` s."
  - "`THREAT_WARN_S` (`0.6` s) drops accelerated travel pace before an intercepting enemy reaches striking distance."
  - "`wildAlert.js` rolls stealth every `WILD_ROLL_S` (`5` s) so undetected travellers can slip past unaware wilderness enemies."
  - "The player motor disables wall and slope climbing whenever an Overworld journey or fast-travel controller drives movement."
traps:
  - "Live spawn chances in `travelBands.js` are `0.75` day and `0.9` night; ignore older notes citing `0.45` and `0.60`."
  - "Dungeon entrances reveal within `TV_DUNGEON_FIND_M` (`1000` m) and stream 3D markers at `TV_DUNGEON_LOADS_PER_FRAME` (`1`), capped at `12` concurrent models."
tags:
  - enemies
  - bands
  - stealth
  - threat
  - dungeons
---

Overworld journeys encounter roaming enemy bands, stealth detection rolls, threat-based speed clamping, and streamed 3D dungeon entrance markers.

## Roaming Bands and Region Chase Sync

`src/travel/travelBands.js` seeds wilderness patrols on a `BAND_CELL_PX` (`2`-pixel) grid with a `BAND_LIFE_MS` (`12` min) lifespan, rolling `BAND_CHANCE_DAY` (`0.75`) during daylight and `BAND_CHANCE_NIGHT` (`0.9`) at night. Patrols wander at `BAND_WANDER_MPS` (`2` m/s) and switch to pursuit at `BAND_CHASE_MPS` (`5.2` m/s) within a `BAND_LEASH_M` (`900` m) leash, abandoning the chase after `120` seconds. In multiplayer, `src/travel/regionChase.js` and `src/travel/regionChaseHost.js` broadcast up to `BANDS_WIRE_MAX` (`8`) active band states per frame via the `bd` and `sr` companion words on traveller marks, holding remote chase state for `TRAV_BAND_HOLD_MS`.

## Wild Alert, Threat Pacing, and Dungeon Markers

Wilderness enemies spawned by `src/characters/exteriorFoes.js` do not automatically halt passing travellers. `src/ai/wildAlert.js` rolls stealth checks every `WILD_ROLL_S` (`5` s); enemies that fail to spot the player stay passive while the journey continues. When an alerted enemy or roaming band closes in, `src/travel/travelThreat.js` applies a `THREAT_WARN_S` (`0.6` s) lookahead buffer to drop accelerated travel speed before impact. Throughout automated journeys, `src/player/motor.js` suppresses climbing so road and cross-country movement cannot latch onto steep geometry.

Nearby dungeons reveal within `TV_DUNGEON_FIND_M` (`1000` m); `src/travel/travelDungeonModels.js` loads at most `TV_DUNGEON_LOADS_PER_FRAME` (`1`) entrance mesh per frame and keeps at most `12` loaded at once.
