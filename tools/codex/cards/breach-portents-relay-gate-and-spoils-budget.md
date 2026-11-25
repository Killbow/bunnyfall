---
slug: breach-portents-relay-gate-and-spoils-budget
title: "Breach Portents Relay Version Gate, Fan Kept, and Spoils Budget"
domain: multiplayer
kind: subcard
parent: breach-portents-overview
files:
  - src/net/wire.js
  - src/net/online.js
  - server/src/world/gate.js
  - server-account/src/budget.js
  - src/worldEvents/gateCourt.js
  - src/worldEvents/gateHost.js
  - src/world/gateBoss.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Breach-Portents.md"
related:
  - breach-portents-overview
  - breach-portents-sunder-tithe-and-vanguard-law
  - breach-receipts-spoils-and-embers
  - breach-portents-warden-arsenal-and-gaze
invariants:
  - "Client sets portentsOk = relaySupportsPortents(relayV); gateRefusal refuses portent nights otherwise."
  - "Relay persists host-hit frames through _gateFanKept before broadcast."
  - "Spoils budget adds SPOILS_GRANT_PIECE per portent piece, clamped to 0..3 pieces."
traps:
  - "Sunder and Rejoin shakes map to 'cross' via SHAKE_AS; do not add new shake entries."
  - "Never hardcode relay version strings; compare via `relaySupportsPortents`."
dfu: []
tags:
  - breach
  - portents
  - wire
  - relay
  - spoils
---

# Breach Portents Relay Version Gate, Fan Kept, and Spoils Budget

Relay protocol gating, persistent fan broadcasts, client presentation, and account spoils budgets coordinate Breach Portents across `src/net/wire.js`, `src/net/online.js`, `server/src/world/gate.js`, `server-account/src/budget.js`, `src/worldEvents/gateCourt.js`, `src/worldEvents/gateHost.js`, `src/world/gateBoss.js`, and `src/scenes/world.js`.

- **Relay Version Gate and Fan Persistence:** In `src/net/wire.js` and `src/net/online.js`, the client computes `portentsOk = relaySupportsPortents(relayV)` against `GATE_PORTENTS_RELAY_MIN` (`229`), and `gateRefusal` blocks entry on portent nights when the relay version is older. Callers must always check `relaySupportsPortents` rather than hardcoding relay version strings. On the relay (`server/src/world/gate.js`), host-hit frames persist through `_gateFanKept` prior to room broadcast.
- **Spoils Budget Clamping:** In `server-account/src/budget.js`, the account spoils budget adds `SPOILS_GRANT_PIECE` (`10000`) for each portent piece earned, clamping the bonus count to `0..3` pieces.
- **Court Presentation, Shapes, and Localization:** In `src/worldEvents/gateCourt.js`, wheel hazards enforce `WHEEL_PERIL_MS` (`1000`), while Sunder and Rejoin screen shakes alias to `'cross'` through `SHAKE_AS` without adding distinct shake table keys. In `src/worldEvents/gateHost.js`, `hostShapes` accepts a `mine` argument to sort nearest shapes first. In `src/world/gateBoss.js` and `src/scenes/world.js`, `PHASE_NAMES` and `courtPhaseOrder` route all labels through `t()`.
