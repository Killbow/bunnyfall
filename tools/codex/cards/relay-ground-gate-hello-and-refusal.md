---
slug: relay-ground-gate-hello-and-refusal
title: "Relay Ground Gate Hello Field and Old-Ground Refusal"
domain: multiplayer
kind: subcard
parent: weir-key-hold-lift-and-ground-gate-overview
files:
  - src/net/wire.js
  - src/net/online.js
  - src/net/relayCfg.js
  - server/src/world/lease.js
  - server/src/room/constants.js
  - server/src/worker/relayCfg.js
  - src/net/remotePlayers.js
  - src/net/peerBodies.js
  - src/scenes/world.js
  - src/systems/eliteGates/egArch.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-17f.md"
related:
  - weir-key-hold-lift-and-ground-gate-overview
  - shared-ground-agreement-overview
  - starfall-relay-cells-and-version-floors
  - weapon-glow-look-wire-and-peer-bodies
invariants:
  - "GROUND_LAW = 1; a gl above GROUND_LAW_WIRE_MAX (65535) reads as none."
  - "groundRoom(key) = isLayered(key) || nativePoseRoom(key)."
  - "_groundRefusal refuses only when groundGate setting is 'on'."
  - "A cold room awaits its first relay settings fetch before admitting; later fetches are unawaited (RELAY_CFG_TTL_MS)."
traps:
  - "Close reason is the short GROUND_OLD_REASON 'old ground' (WebSocket reason <= 123 bytes); player-facing GROUND_OLD_WORDS rides the error frame first."
  - "groundGate defaults off; enable after deploy with /relay groundGate on."
  - "A ground change must bump GROUND_LAW and the relay version together."
dfu: []
tags:
  - relay
  - hello
  - terrain
  - version-gate
---

# Relay Ground Gate Hello Field and Old-Ground Refusal

Relay hello ground-law framing, cold-room configuration fetches, and old-ground refusal handling coordinate across `src/net/wire.js`, `src/net/online.js`, `src/net/relayCfg.js`, `server/src/world/lease.js`, `server/src/room/constants.js`, and `server/src/worker/relayCfg.js`.

## Wire Framing and Ground Room Scope

- **Hello `gl` field (`GROUND_LAW`):** In `src/net/wire.js` and `src/net/online.js`, the client hello payload carries `GROUND_LAW` (`1`), and any terrain shaping change must bump `GROUND_LAW` and the relay version together. Values above `GROUND_LAW_WIRE_MAX` (`65535`) decode as none.
- **Ground rooms and arch clearance:** `groundRoom(key)` matches `isLayered(key) || nativePoseRoom(key)`, where peer bodies and terrain poses synchronize across `src/net/remotePlayers.js`, `src/net/peerBodies.js`, and `src/scenes/world.js`, while `EG_ARCH_GATE_NEAR_M` (`300` in `src/systems/eliteGates/egArch.js`) keeps elite breach arches clear of the breach gate.

## Relay Gate Settings and Refusal Frames

In `server/src/world/lease.js` and `server/src/worker/relayCfg.js` (mirrored by `src/net/relayCfg.js`), `groundGate` defaults to off and is enabled after deployment via `/relay groundGate on`. A cold room awaits its initial relay settings fetch before admitting a client, whereas subsequent refreshes under `RELAY_CFG_TTL_MS` run unawaited. When `groundGate` is `'on'`, `_groundRefusal` (checked inside `_doorRefused` ahead of grant, loot, and lease doors) sends the player-facing `GROUND_OLD_WORDS` (`server/src/room/constants.js`) on the error frame first and closes the socket with the compact `GROUND_OLD_REASON` (`'old ground'`, fitting the 123-byte WebSocket close limit).
