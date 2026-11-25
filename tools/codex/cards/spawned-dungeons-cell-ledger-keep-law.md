---
slug: spawned-dungeons-cell-ledger-keep-law
title: "Overworld Cell Ledger Keep Law and Pruning for Spawned Dungeon Rows"
domain: multiplayer
kind: subcard
parent: spawned-dungeons-rebirth-overview
files:
  - src/net/overworldLaw.js
  - server/src/world/overworld.js
  - src/net/online.js
  - src/world/overworldSpawns.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-12h.md"
related:
  - spawned-dungeons-rebirth-overview
  - raiding-parties-relay-ledger-and-receipts
invariants:
  - "`owRowUntil(r)` (`src/net/overworldLaw.js`) equals `min(seen + OW_GENERAL_TTL_MIN, cleared + OW_CLEARED_TTL_MIN) + OW_REBIRTH_MIN` (at most `19` game days, or `38` real hours), pinned equal to `spawnedDungeons.js` minute constants."
  - "`owRowFits` rejects rows whose `owRowUntil <= now` or whose `seen` exceeds `now + OW_ROW_SLACK_MIN`."
  - "`owFoldRows`, `owPrune`, and `toWelcome` (`server/src/world/overworld.js`) prune expired `dg` rows at `owRowUntil <= now` before folding."
traps:
  - "Client clock skew up to `OW_ROW_SLACK_MIN` under relay min-merge is bounded by `owRowFits` rather than rewritten."
dfu: []
tags:
  - overworld-ledger
  - relay
  - spawned-dungeons
---

# Overworld Cell Ledger Keep Law and Pruning for Spawned Dungeon Rows

The overworld relay cell ledger retains and prunes shared spawned-dungeon rows (`dg`) using horizon constants pinned to client spawn timers.

- **Keep horizon and row admission (`src/net/overworldLaw.js`):** `owRowUntil(r)` equals `min(seen + OW_GENERAL_TTL_MIN, cleared + OW_CLEARED_TTL_MIN) + OW_REBIRTH_MIN`, spanning at most `19` game days (`38` real hours) and pinned equal to the minute constants in `src/world/spawnedDungeons.js`. `owRowFits` admits a row only while `owRowUntil > now` and `seen <= now + OW_ROW_SLACK_MIN`, rejecting expired rows and bounding client clock skew under relay min-merge without rewriting timestamps.
- **Client publishing and relay pruning (`src/world/overworldSpawns.js`, `src/net/online.js`, `server/src/world/overworld.js`):** Clients publish `[px, py, seen]` or `[px, py, seen, cleared]` tuples through `sendOverworld('dg', rows)` built by `overworldLedgerFrame`. On the relay, `owFoldRows`, `owPrune`, and `toWelcome` prune any `dg` row whose `owRowUntil <= now` before folding incoming rows or serializing cell welcome snapshots, ensuring reborn sites start clean across peers.
