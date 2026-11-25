---
slug: sea-serpent-world-boss
title: "Sea Serpent World Boss (Sethrakul)"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/serpentLaw.js
  - src/net/serpentBrain.js
  - src/net/serpentBody.js
  - src/net/serpentReceipt.js
  - src/worldEvents/serpentHost.js
  - src/scenes/world.js
  - src/worldEvents/eventTimers.js
  - src/net/wire.js
  - server/src/index.js
  - server-account/src/serpents.js
routes:
  - /v1/serpent/claim
  - /internal/serpent/fell
tables:
  - serpent_kills
  - serpent_spoils
replacesBible:
  - "11-Multiplayer/Sea-Serpent.md"
related:
  - sea-serpent-schedule-site-and-herald
  - sea-serpent-body-attacks-and-coil
  - sea-serpent-relay-fight-and-trust-bounds
  - sea-serpent-receipts-hoard-and-honours
  - world-events-and-signed-receipts
  - dagons-breach-world-boss
  - naval-and-come-sail-away
  - four-hosts-and-modal-frame
invariants:
  - "Online only: `isSerpentDay` requires `contentOn('seaSerpent')`. Offline play never spawns a serpent, and `relaySupportsSerpent` requires the relay `world` version to meet `SERPENT_RELAY_MIN`."
  - "Serpent days satisfy `day % SERPENT_EVERY_DAYS === SERPENT_DAY_PHASE` (`2`, `1`), occurring every four real hours at TimeScale `12` across six fixed UTC times."
  - "Phase order in `SERPENT_PHASES` (`quiet`, `omen`, `rising`, `hunt`, `late`, `slain`, `sounding`, and `gone`) derives purely from the shared clock and the relay `fellAt` timestamp."
  - "Only the exterior world host (`src/scenes/world.js`) wires `src/worldEvents/serpentHost.js`; interior, dungeon, and `?exterior` bench hosts never instantiate a serpent."
  - "Balance rule: a single ship cannot solo the boss. Each hull adds `SERPENT_TTK_S` (`150` seconds) times the `SHIP_REF` broadside DPS for that hull."
traps:
  - "The relay rejects an `in` frame whose brain version is below `SERPENT_BRAIN_MIN` with the `reload` refusal so outdated tabs are muted rather than hit by attacks they cannot render."
  - "Never hardcode a relay version string; gate support on `relaySupportsSerpent` and `relaySupportsSerpentSite` in `src/net/wire.js`."
dfu: []
tags:
  - multiplayer
  - world-boss
  - sea-serpent
  - naval
  - world-events
---

# Sea Serpent World Boss (Sethrakul)

The Sea Serpent world event pits multiple sailing crews against a shared open-sea boss governed by `src/net/serpentLaw.js` and the cell-room simulation in `src/net/serpentBrain.js`. `SERPENT_BOSSES` defines a single entry, `sethrakul` (Sethrakul, the Shed-Skin of Satakal, also called the Old Coil).

- **Schedule and host wiring:** `isSerpentDay` (`src/worldEvents/eventTimers.js`) triggers when `contentOn('seaSerpent')` is active and `day % SERPENT_EVERY_DAYS === SERPENT_DAY_PHASE` (`2`, `1`), running every four real hours at TimeScale `12`. Only `src/scenes/world.js` attaches `src/worldEvents/serpentHost.js`. `SERPENT_PHASES` advances through `quiet`, `omen`, `rising`, `hunt`, `late`, `slain`, `sounding`, and `gone` from the shared clock and the relay `fellAt` record.
- **Relay authority and combat phases:** `server/src/index.js` steps `serpentBrain.js` to control boss health, movement, and attack selection, while receiving clients compute local hull and crew damage in `src/worldEvents/serpentStrike.js` and render the 24-segment body from `src/net/serpentBody.js`. Each engaged ship adds `SERPENT_TTK_S` (`150` seconds) times its `SHIP_REF` broadside DPS so a single ship cannot solo the encounter. The fight crosses `SERPENT_PHASE_AT` thresholds (`[0.66, 0.33]`) through three phases: The Hunt, The Coil, and The Maelstrom.
- **Wire protocol and settlement:** Clients and relays exchange `serpent` WebSocket frames (`src/net/wire.js`) carrying sub-kinds (`k`) including `in`, `hit`, `no`, `sw`, `atk`, `coil`, `mael`, `ph`, `fell`, and `gone`. On a kill, the hub notifies `/internal/serpent/fell` and mints `l1` receipts (`src/net/serpentReceipt.js`) redeemed at `/v1/serpent/claim` (`server-account/src/serpents.js`) against `serpent_kills` and `serpent_spoils`.
