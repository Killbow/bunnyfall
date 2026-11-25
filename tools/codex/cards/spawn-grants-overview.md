---
slug: spawn-grants-overview
title: "Spawn Grants: Relay-Signed Enemy Spawns"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/grantLaw.js
  - src/net/grantHost.js
  - src/net/relayCfg.js
  - server/src/index.js
  - src/net/wire.js
routes:
  - /v1/relaykey
tables: []
replacesBible:
  - "11-Multiplayer/Spawn-Grants.md"
related:
  - spawn-grants-signed-grant-and-dice
  - spawn-grants-ask-protocol-and-owner-host
  - spawn-grants-reader-verdicts-and-enemy-bounds
  - spawn-grants-measure-and-moderation
  - integrity-progression-seats-and-enemy-forge
  - room-engine-and-hub-sharding
  - identity-tokens-and-relay-seam
invariants:
  - "Enemies streamed to peers require a relay-signed spawn grant while the owning client continues to run their local simulation."
  - "Relay settings `grantMode` (`GRANT_MODE`: `off`, `measure`, or `enforce`, defaulting to `measure` via `grantModeOf`), `grantRoll` (`GRANT_ROLL`), `grantStrip` (`GRANT_STRIP`), and `grantDoor` (`GRANT_DOOR`) are mapped in `src/net/relayCfg.js` and validated in `server/src/index.js`."
  - "Cell welcome frames and `mint` responses both publish the active relay mode in `gm`."
  - "Clients send grant requests only to relays that pass `relaySupportsGrant` (`GRANT_RELAY_MIN`), gate stat validation on `relaySupportsGrantStats` (`GRANT_STATS_RELAY_MIN`), and gate Starfall grants on `relaySupportsStarGrant` (`STAR_GRANT_RELAY_MIN`)."
traps:
  - "Avoid hardcoding relay version strings; check capability helpers `relaySupportsGrant`, `relaySupportsGrantStats`, and `relaySupportsStarGrant`."
  - "When `grantDoor` is enabled on the relay, a client `hello` frame missing `gv` equal to `GRANT_HELLO_LAW` is rejected with `GRANT_OLD_REASON`."
dfu: []
tags:
  - spawn-grants
  - relay
  - enemies
  - ed25519
  - multiplayer
---

Spawn grants authorize peer-streamed enemies with relay-issued Ed25519 signatures while keeping combat movement and AI simulation on the owning client (`src/net/grantLaw.js`, `src/net/grantHost.js`, and `server/src/index.js`).

## Relay Modes and Handshake Gates

`src/net/relayCfg.js` maps four relay flags validated in `server/src/index.js`:
- `grantMode` (`GRANT_MODE`): `off`, `measure`, or `enforce`. Unset or unrecognized values resolve to `measure` through `grantModeOf`, and cells advertise the active mode in `gm` on both the initial cell welcome frame and every `mint` response.
- `grantRoll` (`GRANT_ROLL`): enables server-side kind rolling (`grantKindRolled`).
- `grantStrip` (`GRANT_STRIP`): strips ungranted or out-of-bounds enemy records on the relay before broadcast.
- `grantDoor` (`GRANT_DOOR`): closes connections whose `hello` frame lacks `gv = GRANT_HELLO_LAW` using close reason `GRANT_OLD_REASON`.

Clients inspect relay support in `src/net/wire.js` via `relaySupportsGrant` (`GRANT_RELAY_MIN`), `relaySupportsGrantStats` (`GRANT_STATS_RELAY_MIN`), and `relaySupportsStarGrant` (`STAR_GRANT_RELAY_MIN`), and fetch the relay's public verification key from `GET /v1/relaykey`.

## Subcards

- `spawn-grants-signed-grant-and-dice`: grant payload fields, Ed25519 signatures, elite and champion promotions, and seeded dice.
- `spawn-grants-ask-protocol-and-owner-host`: WebSocket `grant` requests, token buckets, cell ceiling, renewals, and handoffs.
- `spawn-grants-reader-verdicts-and-enemy-bounds`: peer verification, relay stripping, and `src/net/foeBounds.js` health caps.
- `spawn-grants-measure-and-moderation`: D1 telemetry batches, reader tallies, and moderator review cases.
