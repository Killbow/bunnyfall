---
slug: shattered-hour-orrery-and-steps
title: "Shattered Hour Realm Rules, Orrery, and Unmoored Steps"
domain: multiplayer
kind: subcard
parent: abyss-dungeons-overview
files:
  - src/net/sdBrain.js
  - src/world/sdRealm.js
  - src/world/sdHall.js
  - src/world/sdSteps.js
  - src/worldEvents/sdHall.js
  - src/worldEvents/sdSteps.js
  - src/net/sdLaw.js
  - src/worldEvents/sdSlots.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Super-Dungeons.md"
related:
  - abyss-dungeon-discovery-and-rift
  - brass-remnant-fight-and-rewards
invariants:
  - "Non-lethal realm hazards (Orrery fray lash and Unmoored Steps void cast-back) clamp player health at a minimum of 1 HP and never trigger One-Life death."
  - "Client `pz` and `rz` actions are validated on the wire by `validSdIn` before the room brain processes them."
traps:
  - "The player-facing death timer is 60 seconds, while the relay constant `SD_REZ_MS` is 70,000 ms to provide 10 seconds of page-load slack."
  - "Downed players waiting for resurrection cannot be cast out of the realm until they are revived or their timer expires."
tags:
  - super-dungeons
  - shattered-hour
  - puzzle
  - platforming
---

Stepping through the Rift moves the player into the Shattered Hour (`src/world/sdRealm.js`), a shared realm that disables resting, saving, the automap, Mark and Recall, passive health or magicka regeneration, Levitate, and companions.

## Orrery of Endings

In the first chamber (`src/net/sdBrain.js`, `src/world/sdHall.js`), players align `SD_PZ_STONES` (6) stones across `SD_HOURS` (12) dial positions. Each puzzle instance has a shortest path of at most `SD_TRUTH_TURNS_MAX` (24) turns, and stone turns are rate-limited to `SD_TURN_HZ` (3 per second) per account (`orreryStep`). To prevent griefing when other players have turned a stone within `SD_TURN_COMPANY_MS` (60 seconds), `orreryMayTurn` blocks any user who makes `SD_TURN_LONG_MAX` (6) turns that lengthen the remaining solution path. Reaching `SD_FRAY_MAX` (48 total turns, reduced to 36 under the Fraying omen) snaps the dial back and deals a non-lethal `SD_FRAY_LASH` (25% max HP) lash.

## Unmoored Steps and One-Life Resurrection

Beyond the hall, the Unmoored Steps (`src/world/sdSteps.js`, `src/worldEvents/sdSteps.js`) climb in `SD_RISER_H` (2.3-meter) risers buffeted by crosswinds every `SD_GUST_EVERY` (6 seconds). Falling below `SD_VOID_Y` (-30) casts the player back to the start and inflicts a non-lethal `SD_CAST_BACK_LOSS` (15% max HP) penalty.

Combat deaths inside the realm enforce One-Life with Resurrect (`src/net/sdLaw.js`). A downed player sees a 60-second revive window while the relay holds the downed record (`sdDownWord`) for `SD_REZ_MS` (70 seconds). Any living ally within `SD_REZ_REACH_M` (10 meters, checked by `sdMayRaise`) can send an `sd` `rz` frame to raise them.
