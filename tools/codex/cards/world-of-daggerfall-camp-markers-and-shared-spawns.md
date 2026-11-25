---
slug: "world-of-daggerfall-camp-markers-and-shared-spawns"
title: "WoD Camp Markers, Privateer's Hold, and WOD7 Shared Camps"
domain: "world"
kind: "subcard"
parent: "world-of-daggerfall-overview"
files:
  - "src/world/wodSpawner.js"
  - "src/world/groundAlign.js"
  - "src/world/wodPrivateersHold.js"
  - "src/world/wodSites.js"
  - "src/world/wodShared.js"
  - "src/world/worldSaveLoad.js"
  - "src/world/streamWorld.js"
  - "src/net/onlineWorld.js"
routes: []
tables: []
replacesBible:
  - "03-World/World-Of-Daggerfall.md"
related:
  - "world-of-daggerfall-overview"
  - "online-coop-shared-dungeon-and-interior-rooms"
  - "pixel-streaming-and-origin-shift"
invariants:
  - "`WodSpawner` stands down if within `WOD_STAND_DOWN_RADIUS = 300` at Start and springs once inside `WOD_SPAWN_RADIUS = 100`; `onLoad(dist)` repeats the 300 test after a save load."
  - "Unity `Range` upper bounds are exclusive: Range(1,3) never yields Barbarian, Range(1,6) never yields Healer; loot drops on 1..50 of 1..99 with `WOD_LOOT_LOCATION_INDEX = 3`."
  - "Ground alignment sets center to hit + 0.52 of height (`groundAlign.js`); loot uses `WOD_LOOT_ALIGN`."
  - "Privateer's Hold (`PRIVATEERS_HOLD_BLOCK = 'CUSTAA30.RMB'`) adds 33 models, 17 flats and seven enemies, each on `Range(0,30) > 20`, under Extra_Detail."
  - "WOD7: `yieldsTo` keeps the earlier spring; within `WOD_CLAIM_WINDOW_MS = 5000` the smaller id wins."
  - "Peers render camp enemies as puppets capped by `WOD_CAMP_PUPPETS_MAX = 16`; sprung list holds 256 (`WOD_SPRUNG_MAX`), wire carries at most `WOD_SITES_MAX = 64`."
traps:
  - "Marker ticks are suppressed while `_wodInside` is true (dungeon/interior arrival) until the player is outside."
  - "A new spring sets `_wodSprungChanged`, forcing a full enemies frame; do not wait for the next periodic full frame."
  - "Site tags must match `WOD_SITE_RE` (pixel:objectID, `hold`, `reach.*`, `rite.*`, `star.*`)."
dfu: []
tags:
  - "world-of-daggerfall"
  - "camps"
  - "spawner"
  - "online"
  - "wod7"
---

# WoD Camp Markers, Privateer's Hold, and WOD7 Shared Camps

Camp spawners, exterior Privateer Hold additions, ground alignment, and multiplayer camp ownership operate across `src/world/wodSpawner.js`, `src/world/groundAlign.js`, `src/world/wodPrivateersHold.js`, `src/world/wodSites.js`, `src/world/wodShared.js`, and `src/net/onlineWorld.js`.

- **Camp spawners, ground alignment, and Privateer Hold (`src/world/wodSpawner.js`, `src/world/groundAlign.js`, `src/world/wodPrivateersHold.js`):** `WodSpawner` (`WOD_ENEMY_ID = { Bandits: 1, Bears: 2, Warriors: 3 }`) stands down when the player starts within `WOD_STAND_DOWN_RADIUS = 300` (rechecked by `onLoad(dist)` on save load) and springs once inside `WOD_SPAWN_RADIUS = 100`, suppressing ticks while `_wodInside` is true. Exclusive Unity `Range` upper bounds mean `Range(1,3)` never rolls Barbarian and `Range(1,6)` never rolls Healer, while loot spawns on `1..50` of `1..99` with `WOD_LOOT_LOCATION_INDEX = 3`. `groundAlign.js` sets centers to `hit + 0.52` of height (`WOD_LOOT_ALIGN` for loot). On `PRIVATEERS_HOLD_BLOCK` (`'CUSTAA30.RMB'`), `Extra_Detail` adds `33` models, `17` flats, and seven enemies when `Range(0,30) > 20`.
- **WOD7 shared camps (`src/world/wodSites.js`, `src/world/wodShared.js`, `src/net/onlineWorld.js`):** Site tags match `WOD_SITE_RE` (`pixel:objectID`, `hold`, `reach.*`, `rite.*`, `star.*`), and `yieldsTo` keeps the earlier spring (`WOD_AGE_MAX = 86400000`) or the smaller ID within `WOD_CLAIM_WINDOW_MS = 5000`. New springs set `_wodSprungChanged` to force a full enemies frame (`WOD_SPRUNG_MAX = 256`, `WOD_SITES_MAX = 64`), and peers render up to `WOD_CAMP_PUPPETS_MAX = 16` camp puppets (`WOD_STAR_PUPPETS_MAX = 45` for Starfall).
