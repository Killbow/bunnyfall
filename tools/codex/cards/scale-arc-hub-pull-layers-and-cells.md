---
slug: scale-arc-hub-pull-layers-and-cells
title: "Hub Pull, Layered Rooms, Gate Copies, and Adaptive Cells"
domain: multiplayer
kind: subcard
parent: scale-arc-capacity-plan
files:
  - src/net/hubShards.js
  - server/src/index.js
  - server/src/relayScale.js
  - server/src/drainWindows.js
  - src/net/cellTree.js
  - server/src/cellNodes.js
  - server/src/cellMoves.js
  - server/src/cellHandover.js
  - src/net/relayCfg.js
  - server/wrangler.toml
routes:
  - /internal/hub/up
  - /internal/hub/poll
replacesBible:
  - "11-Multiplayer/Scale-Arc.md"
related:
  - room-engine-and-hub-sharding
  - scale-arc-relay-hot-path-and-wire2
  - identity-tokens-and-relay-seam
invariants:
  - "Hub shards assign sockets by FNV-1a `shardHash(sub) % HUB_SHARDS` (`16`), batching upstream frames every `HUB_BATCH_MS` (`25`) within `HUB_UP_HZ_MAX` (`16`/s) and `HUB_UP_BURST` (`32`)."
  - "The hub bus outbox caps at `HUB_OUTBOX_MAX` (`1024`) messages and `HUB_OUTBOX_BYTES` (`2` MiB) per shard; shards long-poll `/internal/hub/poll` for `HUB_POLL_MS` (`20000`) and back off from `HUB_RETRY_MS` (`1000`) up to `HUB_SYNC_MS / 2`."
  - "Crowded social rooms spill across up to `LAYERS_MAX` (`8`) layers of `SOCKETS_MAX` (`256`), while gate courts cap active fighters at `GATE_FIGHTERS_MAX` (`256`) and place overflow spectators into copies `#1` through `#7` (`COURT_COPY_RE`)."
  - "Adaptive cells split a leaf above `CELL_SPLIT_AT` (`150`) for `CELL_SPLIT_DWELL_MS` (`60000`) and merge four siblings below `CELL_MERGE_AT` (`40`) for `CELL_MERGE_DWELL_MS` (`600000`), separated by `MOVE_COOLDOWN_MS` (`600000`)."
traps:
  - "`workerd` bills a Durable Object's outgoing subrequests against the incoming client request budget, so shards must pull from the bus via `/internal/hub/poll` rather than receiving bus pushes."
  - "`layerWalk` and `askRoom` retry a transient Durable Object fault once on a fresh stub before returning HTTP `503` with `retry-after: 2`."
  - "Active raids, fallen stars, serpent fights, and staff events block cell repartitioning, and the initial `cellSeed` activation strands preexisting fine-cell fight state."
tags:
  - relay
  - sharding
  - durable-objects
  - cells
  - cost
---

Complementing `room-engine-and-hub-sharding`, this card covers pull-based hub polling, region channel shards, layered room overflow, and adaptive quadtree cells.

## Hub Long-Poll and Region Shards

In `src/net/hubShards.js` and `server/src/index.js`, shards (`shardHash(sub) % HUB_SHARDS`, `16`) batch upstream frames every `HUB_BATCH_MS = 25` to `HUB_INTERNAL_UP` (`/internal/hub/up`, capped at `HUB_UP_HZ_MAX = 16` per second and `HUB_UP_BURST = 32`). Because `workerd` bills outgoing Durable Object subrequests to the caller's request budget, the bus never pushes to shards. Instead, shards long-poll `HUB_INTERNAL_POLL` (`/internal/hub/poll`) for `HUB_POLL_MS = 20000` (carrying `rs: 1` / `rb` resyncs) against a per-shard outbox (`HUB_OUTBOX_MAX = 1024`, `HUB_OUTBOX_BYTES` 2 MiB), retrying from `HUB_RETRY_MS = 1000` to `HUB_SYNC_MS / 2`.

`server/wrangler.toml` sets `REGION_SHARDS = ""` so region channels stay whole by default; listed regions split `REGION_SHARDS = 4` ways. `flushAtDrain` (`server/src/drainWindows.js`) flushes drain windows immediately.

## Layered Rooms, Gate Copies, and Adaptive Cells

At `SOCKETS_MAX = 256` (`server/src/relayScale.js`), `layerWalk` and `askRoom` spill sockets across `LAYERS_MAX = 8` layers, retrying a transient DO fault once before returning `503` (`retry-after: 2`). Gate courts admit `GATE_FIGHTERS_MAX = 256` fighters and place extra watchers in copies `#1` through `#7` (`COURT_COPY_RE`).

Exterior cells (`src/net/cellTree.js`, `src/net/relayCfg.js`, `server/src/cellNodes.js`, `server/src/cellMoves.js`, and `server/src/cellHandover.js`) split leaves above `CELL_SPLIT_AT = 150` for `CELL_SPLIT_DWELL_MS = 60000` and merge four siblings below `CELL_MERGE_AT = 40` for `CELL_MERGE_DWELL_MS = 600000` after `MOVE_COOLDOWN_MS = 600000`. `cellPlanAlarm` runs `MOVE`, `COMMIT`, and `CLOSE` (`CLOSE_REPARTITION = 4003`), holding `MOVED_HEADER` (`x-df-moved`) for `MOVED_KEEP_MS` (`2 * CELL_TREE_KEEP_MS`, `30000`).
