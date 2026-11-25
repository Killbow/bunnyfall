---
slug: shipyards-crew-halls-and-lighthouses-overview
title: "Shipyards, Crew Halls and Lighthouses"
domain: world
kind: overview
parent: null
files:
  - src/travel/portPlaces.js
  - src/travel/portHost.js
  - src/world/portSites.js
  - src/world/townPlacesWorld.js
  - src/world/yardsPortsWorld.js
  - src/world/shipyardModel.js
  - src/world/lighthouseModel.js
  - src/world/portArt.js
  - src/world/merchantYards/merchantYardMap.js
  - src/ui/travelViewHud.js
  - src/talk/townTalk.js
  - src/scenes/world.js
  - src/world/worldClock.js
routes: []
tables: []
replacesBible:
  - "03-World/Shipyards.md"
related:
  - shipyards-port-town-siting
  - shipyards-shipmaster-sales-and-resale
  - shipyards-crew-hall-recruits-and-online-signing
  - naval-and-come-sail-away
  - harbor-quays-docking-and-gangways
  - harbour-board-ports-exchange-and-charts
invariants:
  - "PORT_PLACES has exactly four places: shipyard, crewhall, lighthouse, docks; talk groups Shipyards, Crew halls, Lighthouses, Docks (FOUND_TALK_GROUPS)."
  - "lettersOnMap is false for crewhall and docks keys: they get verbal directions only."
  - "Port places are not DFU buildings: no building record, deed or quest location; art is uploaded under pseudo-archive PORT_ARCHIVE (38231)."
  - "Town automap uses PORT_MAP_TYPE: shipyard as BUILDING_TYPES.GeneralStore (shop byte), lighthouse as House2."
  - "Lamp and office lantern burn only while isCityLightsOn: hour >= LIGHTS_ON_HOUR (17) or < LIGHTS_OFF_HOUR (8)."
  - "Beam rotation uses the `beamClock` dependency (wall clock seconds) so every client sees the same phase."
traps:
  - "Only `portFrame` lives in src/scenes/world.js; the other per-frame port helpers live in src/world/yardsPortsWorld.js and are called from src/scenes/frame/sceneFrame.js and peopleFrame.js."
  - "Found-place keys come from foundBuildingKey over FOUND_KIND_ORDER (yards, then port places, then craft yards); reordering shifts every later key."
dfu: []
tags:
  - shipyards
  - ports
  - lighthouse
  - crew-hall
  - town-places
---

# Shipyards, Crew Halls and Lighthouses

Coastal port towns place a fenced shipyard (with a crew hall shed) and a beacon-tower lighthouse on leftover ground (`src/travel/portPlaces.js`, `src/world/portSites.js`, `src/world/townPlacesWorld.js`).

- **Port places, maps, and talk:** `PORT_PLACES` defines `shipyard`, `crewhall`, `lighthouse`, and `docks`, listed in `src/talk/townTalk.js` under `FOUND_TALK_GROUPS` (`Shipyards`, `Crew halls`, `Lighthouses`, and `Docks`). `foundBuildingKey` assigns keys in `FOUND_KIND_ORDER` (yards, port places, craft yards). Sites have no DFU building record, deed, or quest slot; art uploads under `PORT_ARCHIVE` (`38231`, `src/world/portArt.js`). `lettersOnMap` is `false` for `crewhall` and `docks` (verbal directions only), `PORT_MAP_TYPE` (`src/world/merchantYards/merchantYardMap.js`) colors `shipyard` as `BUILDING_TYPES.GeneralStore` and `lighthouse` as `House2`, and `portGlyph` (`src/ui/travelViewHud.js`) draws anchor, tower, and bollard marks.
- **Lighthouse and per-frame hooks:** `src/world/lighthouseModel.js` and `src/world/shipyardModel.js` build a 16-sided (`TOWER_SIDES`) tower (`GALLERY_Y = 17.6` m, `LANTERN_H = 5.6` m, `ARCH_CROWN = 2.51` m, `LAMP_RANGE = 28` m, `OFFICE_LAMP_RANGE = 9` m) with a gallery guard (`LIGHTHOUSE.gallery.guardH = 2.2` m, `GUARD_HEADROOM = 1.95` m via `guardFor`). `portFrame` runs in `src/scenes/world.js`; `portLightsInto`, `portBodies`, `portBatchesInto`, `portGlows`, and `climbLighthouse` live in `src/world/yardsPortsWorld.js`. Lamps burn during `isCityLightsOn` (`LIGHTS_ON_HOUR = 17` to `LIGHTS_OFF_HOUR = 8`, `src/world/worldClock.js`), and the beam turns every `BEAM_PERIOD_S` (`14` s) via `beamClock` within `BEAM_SEEN_M` (`2600` m) with `nearFade`. `stairRefusal` (`src/travel/portHost.js`) requires walking on foot, not sailing, and no nearby enemies to ascend; descending lands `STEP_CLEAR` (`0.5` m) past the step. `portKeeper` (`townKeeper`) seeds the shipmaster, crewmaster, three recruits, two shipwrights, and lightkeeper.
