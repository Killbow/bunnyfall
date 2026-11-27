---
slug: "code-map-relay-bundle-and-move-ledger"
title: "Code Map: Relay Bundle Version and Move Ledger"
domain: "multiplayer"
kind: "subcard"
parent: "code-map-repository-layout-overview"
files:
  - "src/net/wire.js"
  - "server/src/index.js"
  - "server/src/message/frames/hello.js"
  - "server/src/worker/entry.js"
  - "tools/moveLedger.json"
  - "tools/lib/importGraph.mjs"
  - "tools/codex/cli.mjs"
  - "selfhost/upstream-ci/workflows/relay-deploy.yml"
  - "src/world/quat.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/Code-Map.md"
related:
  - "code-map-repository-layout-overview"
  - "code-map-src-layers-and-feature-folders"
  - "room-engine-and-hub-sharding"
  - "verification-tooling-mutation-cites-ledger"
invariants:
  - "RELAY_VERSION is exported from src/net/wire.js so both client and relay know the relay's name; the welcome frame carries it as `v` (server/src/message/frames/hello.js) and GET /health reports it (server/src/worker/entry.js)."
  - "Bump RELAY_VERSION with every relay-changing slice; the relay is deployed separately from the client, so version skew is normal on release day."
  - "`quatToMat4Into` is a separate copy of mat4.js `quatToMat4` because mat4.js is in the relay bundle, where any byte change is a relay deploy. Keep the two numerically identical."
traps:
  - "Moving or editing any src/ file that the relay imports (mostly src/net/) changes the relay bundle and needs a relay redeploy, which drops connected players' sockets."
  - "Never hardcode the RELAY_VERSION string in docs or tests; read it from src/net/wire.js."
  - "The wire.js comment still cites test/net/relayversion.test.js, which no longer exists."
dfu: []
tags:
  - "code-map"
  - "relay"
  - "version"
  - "moves"
  - "deploy"
---

# Code Map: Relay Bundle Version and Move Ledger

Because the relay worker in `server/src/index.js` imports shared modules from `src/` (primarily `src/net/`), moving or editing any `src/` file on the relay import graph alters the compiled relay bundle.

## Relay Version Contract and Deployment Impact

- **Canonical export (`src/net/wire.js`):** `RELAY_VERSION` is exported from `src/net/wire.js` so both client and server read the same identifier. The relay welcome frame transmits it as `v` (`server/src/message/frames/hello.js`), and `GET /health` reports it from `server/src/worker/entry.js`.
- **Release skew and socket drops:** The relay deploys separately from the browser client (`selfhost/upstream-ci/workflows/relay-deploy.yml`), making temporary client-relay version skew normal on release day. Bump `RELAY_VERSION` whenever a slice modifies relay behavior or moves relay-imported files. Redeploying the relay restarts live `Room` instances and drops active player WebSockets, whereas moving `server-account/` files does not disconnect players because the account worker holds no player sockets.
- **No hardcoded version literals:** Tests and docs must import `RELAY_VERSION` from `src/net/wire.js` rather than hardcoding its literal value (note that a stale comment in `src/net/wire.js` still references `test/net/relayversion.test.js`, which no longer exists).

## Module Move Ledger and Import Graph

`tools/moveLedger.json` stores a 6,010-entry JSON array of `[from, to]` path pairs recording historical module relocations and folder flattenings (such as flattening `src/world/worldOfDaggerfall/` back into `src/world/`). `tools/lib/importGraph.mjs` and `tools/codex/cli.mjs` (`npm run codex -- moved <path>`) resolve transitive move chains and live module callers.
