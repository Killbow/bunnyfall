---
slug: "live-events-word-gate-overview"
title: "Live Events Relay Word Gate, /event Staging, and Unshipped Rocket Slot"
domain: "multiplayer"
kind: "overview"
parent: null
files:
  - "src/net/wire.js"
  - "src/net/chatCommands.js"
  - "src/world/dreadSky.js"
  - "src/world/sunbabySky.js"
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Rocket-Event.md"
related:
  - "staff-events-overview"
  - "world-events-and-signed-receipts"
  - "community-arc-overview"
invariants:
  - "`LIVE_EVENTS` (`Object.freeze([\"dread\", \"sunbaby\"])` in `src/net/wire.js`) is append-only and never reordered or renamed; `validLiveEvent` requires a listed `kind` and a positive safe-integer `at` timestamp."
  - "The relay transports only `{ kind, at }` under dedicated hub storage key `EVENT_KEY = \"event:live\"` (protected from drain and hub sweeps until explicitly cleared), while visual sky passes run purely on the client (`sunbabySky.js` and `dreadSky.js`)."
  - "Staff stage or clear live events through the `/event` chat command (`parseEventCommand` in `src/net/chatCommands.js`), rate-limited to `EVENT_HZ_MAX = 1` per second."
traps:
  - "`\"rocket\"` (`ROCKET1`) is not present in `LIVE_EVENTS` or shipped client modules in the live tree; clients ignore unknown event words, and `/event` is a chat command rather than an HTTP route."
  - "`dreadCloudGlow` recognizes dread bolts by reference to `DREAD_BOLT_COLOR`, so `src/weather/lightning.js` must pass a strike's `color` array through uncopied."
dfu: []
tags:
  - "live-event"
  - "relay"
  - "chat-command"
  - "hub"
---

# Live Events Relay Word Gate, /event Staging, and Unshipped Rocket Slot

`src/net/wire.js` and `src/net/chatCommands.js` define the relay word gate and client command parser for staff-staged live sky events, while visual passes execute purely on the client (`src/world/dreadSky.js` and `src/world/sunbabySky.js`).

- **Append-only word gate and hub persistence (`src/net/wire.js`):** `LIVE_EVENTS` is frozen as `Object.freeze(["dread", "sunbaby"])` and is strictly append-only, never reordered or renamed. `validLiveEvent` validates incoming event payloads by requiring a `kind` listed in `LIVE_EVENTS` and a positive safe-integer `at` timestamp. The relay transports only the `{ kind, at }` record and stores it under the dedicated hub storage key `EVENT_KEY = "event:live"`, which remains protected from room drain and hub sweeps until staff explicitly clear the active event.
- **Chat command staging and unshipped rocket slot (`src/net/chatCommands.js`, `src/world/dreadSky.js`, `src/world/sunbabySky.js`):** Staff trigger or clear live events through the `/event` chat command rather than an HTTP route. `parseEventCommand(text)` parses `/event` arguments on the client before sending the relay staging frame, enforced under a rate limit of `EVENT_HZ_MAX = 1` per second. The `"rocket"` (`ROCKET1`) event word is not present in `LIVE_EVENTS` or shipped client modules, and clients ignore unknown event words.
