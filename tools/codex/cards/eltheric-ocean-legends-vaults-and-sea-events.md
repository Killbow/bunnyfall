---
slug: eltheric-ocean-legends-vaults-and-sea-events
title: "Eltheric Legendary Ships, Deep Vaults, Aether Storms, and Treasure Fleets"
domain: world
kind: subcard
parent: eltheric-ocean-overview
files:
  - src/systems/naval/etherShips.js
  - src/systems/naval/navalShips.js
  - src/systems/naval/navalPlunder.js
  - src/systems/naval/sea/seaVaults.js
  - src/systems/naval/sea/seaEvents.js
  - src/systems/naval/seaVenturesHost.js
  - src/systems/naval/treasureFleet.js
  - src/net/wire.js
routes: []
tables: []
replacesBible:
  - "03-World/Eltheric-Ocean.md"
related:
  - eltheric-ocean-overview
  - eltheric-ocean-ship-pvp-wrecks-bounties-and-season
  - naval-shot-kinds-and-combat-feedback
  - room-engine-and-hub-sharding
invariants:
  - "`LEGENDS` defines six named warships, two per band past the Shallows. At most one legend sails at a time, and a defeated legend stays down for `LEGEND_RISE_DAYS` (`30`) days."
  - "`SEA_VAULTS` selects `{ deep: 4, abyss: 3 }` ruin isles per relay day (`WDUN_DAY_MS`), spaced at least `SEA_VAULT_SPACING_CELLS` (`6`) cells apart on lane `SEA_VAULT_LANE` (`0xe8`)."
  - "Aether storms cycle every `STORM_PERIOD_MS` (2 hours) for `STORM_LIFE_MS` (50 minutes), rolling `STORM_STRIKE_CHANCE` (`0.25`) strikes with `STORM_STRIKE = { hull: 0.04, sail: 0.08, fire: 0.2 }`."
  - "Treasure fleets cycle every `SEA_FLEET_PERIOD_MS` (3 hours) at `FLEET_OFFSET_MS` (60 minutes) for `FLEET_SAIL_MS` (90 minutes) at `FLEET_MPS` (`5`) m/s, carrying `FLEET_PURSE = { deep: 6000, abyss: 12000 }`."
traps:
  - "The `night` legend (The Lantern-Eater) sails only between dusk and dawn (`legendAbroad`), and the `veiled` legend (The Starless) multiplies sighting distance by `LEGEND_VEIL_K` (`0.35`)."
  - "Vault selection is a pure function of the relay day so all clients and the hub match; never seed it from a local clock."
dfu: []
tags:
  - eltheric-ocean
  - legendary-ships
  - sea-vaults
  - aether-storm
  - treasure-fleet
---

High-sea encounters in the Eltheric Ocean comprise six legendary warships (`src/systems/naval/etherShips.js`), daily deep vaults (`src/systems/naval/sea/seaVaults.js`), and deterministic aether storms and treasure fleets (`src/systems/naval/sea/seaEvents.js`, `src/systems/naval/seaVenturesHost.js`, and `src/systems/naval/treasureFleet.js`).

## Legendary Ships

`LEGENDS` places two level-`999` (`LEGEND_LEVEL`) warships in each band beyond the Shallows, rolling at `LEGEND_CHANCE = 0.3` within `HAUNT_PX = 36` and `HAUNT_SPREAD` (`{ reaches: 60, deep: 160, abyss: 320 }`, `ABYSS_HAUNT_LEAGUES = 120`):

- **Reaches:** `Sorrow's Wake` (`swift`, 2,500 gold) and `The Drowned Queen` (`mends`, 3,000 gold, healing `LEGEND_MEND_PER_S = 0.004` hull per second after `LEGEND_MEND_QUIET_S = 8` quiet seconds).
- **Deep Aether:** `Ninefold Hunger` (`boarders`, 5,000 gold) and `The Lantern-Eater` (`night`, 5,500 gold, active only when `legendAbroad` confirms nighttime).
- **Abyss:** `The Pale Regent` (`gunnery`, 9,000 gold, reload factor `LEGEND_RELOAD_K = 0.7`) and `The Starless` (`veiled`, 12,000 gold, sighting multiplier `LEGEND_VEIL_K = 0.35`).

Only one legend sails at a time. Sinking one yields `LEGEND_STRONGBOXES` (`2`) strongboxes, grants `LEGEND_STANDING` (`10`), and starts a `LEGEND_RISE_DAYS` (`30`) day cooldown.

## Deep Vaults, Storms, and Treasure Fleets

Each `WDUN_DAY_MS` relay day (gated by `WDUN_SEA_RELAY_MIN`), `src/systems/naval/sea/seaVaults.js` purely selects `SEA_VAULTS` (`{ deep: 4, abyss: 3 }`) ruin isles at least `SEA_VAULT_SPACING_CELLS` (`6`) cells apart, keyed as `"e<cx>,<cy>"` on lane `SEA_VAULT_LANE` (`0xe8`).

`src/systems/naval/sea/seaEvents.js` schedules 50-minute (`STORM_LIFE_MS`) aether storms every 2 hours (`STORM_PERIOD_MS`) and 90-minute (`FLEET_SAIL_MS`) treasure fleets every 3 hours (`SEA_FLEET_PERIOD_MS`, offset `FLEET_OFFSET_MS = 60` minutes). Fleets cruise at `FLEET_MPS` (`5` m/s) with `FLEET_ESCORTS`, tracked via `FLEET_FEED_MS` (`500`), `FLEET_LEAD_MS` (`60_000`), `FLEET_STAND_M` (`1200`), and `FLEET_DROP_M` (`1700`).
