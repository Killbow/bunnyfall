---
slug: breach-rite-broker-and-multi-court
title: "Faithful's Rite, Sigil Broker, and Multi-Court Seating"
domain: multiplayer
kind: subcard
parent: dagons-breach-world-boss
files:
  - src/net/gateRite.js
  - src/net/gateCourts.js
  - src/net/gateCrowd.js
  - src/net/gateHerald.js
  - src/net/herald/heraldCard.js
  - src/worldEvents/riteHost.js
  - src/worldEvents/sigilBrokerPool.js
  - src/worldEvents/riteChest.js
  - src/worldEvents/sigilBroker.js
  - server/src/index.js
  - src/world/spoilsWorld.js
routes:
  - "/internal/gate/seat"
  - "/internal/gate/court"
  - "/internal/gate/party"
  - "/internal/gate/fell"
tables: []
replacesBible:
  - "11-Multiplayer/World-Bosses.md#rite"
  - "11-Multiplayer/World-Bosses.md#broker"
  - "11-Multiplayer/World-Bosses.md#courts"
related:
  - dagons-breach-world-boss
  - breach-receipts-spoils-and-embers
invariants:
  - "Courts are booked on the `gate:<day>` director room (`gatebook` key), and `gateRoomKey(day, k)` addresses court `k` as `gate:<day>.<k>`."
  - "`placeSeat` keeps party members in the same court, expires unclaimed reservations after `GATE_SEAT_PENDING_MS` (60 seconds), and closes the night via `nightDone` at `GATE_NIGHT_GRACE_MS` (3 seconds) past wrath."
  - "Local rite completion and chest claims persist in character saves under the `RiteDay` and `RiteChest` synthetic vendor records (`src/worldEvents/riteChest.js`)."
  - "The hub's broken and cleared messages are stored by `circleKey(day, px, py)`, so a message about another circle never unseals this casket or opens this cage."
  - "The broker sale in `src/world/spoilsWorld.js` refuses unless `sigilBroker.stands()` is true, so a window left open on a caged broker or past midnight sells nothing."
  - "`createSigilBroker` saves and sends nothing: the cage spot derives from the breach day through `cageSpotLocal`, and the door opens from the host's `freed` rite state."
traps:
  - "The relay accepts exterior rite pose reports within `RITE_REACH_M` (60 meters) and locks in a player-discovered site once `GATE_SITE_AGREE` (2) accounts agree (`src/net/gateHerald.js`)."
  - "Discord Herald posts thread updates through `gateThread` (`server/src/index.js`) and halts retries on any 4xx HTTP response other than 429."
tags:
  - rite
  - sigil-broker
  - courts
  - seating
  - discord
---

Before a sealed gate opens at `GATE_OPEN_MINUTE`, players can unseal it early by completing the Faithful's Rite (`src/net/gateRite.js`, `src/worldEvents/riteHost.js`).

## Faithful's Rite and Sigil Broker

The rite circle spawns between `RITE_MIN_M` (90 meters) and `RITE_MAX_M` (180 meters) from the gate, guarded by `RITE_FAITHFUL_MIN` (6) to `RITE_FAITHFUL_MAX` (8) Faithful cultists plus one Summoner, with a `RITE_GRACE_MS` (2,000 ms) spawn grace window. Clearing the rite unlocks the exterior rite chest (`src/worldEvents/riteChest.js`, saved under `RiteDay` and `RiteChest`) and frees the Sigil Broker from a cage located `CAGE_R` (11.5 meters) from the circle (`src/worldEvents/sigilBrokerPool.js`, `src/worldEvents/sigilBroker.js`).

## Multi-Court Seating, Watchers, and Herald

When fighters enter the portal, the `gate:<day>` booking room (`src/net/gateCourts.js`, `/internal/gate/seat`, `/internal/gate/court`, `/internal/gate/party`, `/internal/gate/fell`) assigns seats across up to `GATE_COURTS_MAX` (16) parallel courts (`gateRoomKey(day, k)` = `gate:<day>.<k>`). Each court holds `GATE_COURT_FIGHTERS` (50) fighters plus `GATE_PARTY_SLACK` (7) overflow seats so `placeSeat` can keep parties together. Pending seats expire after `GATE_SEAT_PENDING_MS` (60 seconds), and `GATE_HERE_HOLD_MS` (2 minutes in `src/net/wire.js`) holds receipt copies for multi-tab accounts.

Court watchers poll every `COURT_WATCH_ASK_MS` (15 seconds). Inside high-population courts, `src/net/gateCrowd.js` throttles peer rendering across `GATE_CROWD_TIERS` (`[0, 12, 24]` meters) with `GATE_CROWD_HOLD_M` (4 meters) hysteresis. The Discord Herald (`src/net/gateHerald.js`, `src/net/herald/heraldCard.js`, `gatesite` and `gatefell` keys) confirms the site after `GATE_SITE_AGREE` (2) matching client reports and updates the event's `gateThread`.
