---
slug: enemy-frames-first-hold-and-owner-clock-overview
title: "Relay Full-Frame Priority, Per-Sender Enemy Hold, and Owner Clock"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/wire.js
  - server/src/index.js
  - server/src/foesHold.js
  - server/src/message/frames/foes.js
  - server/src/relayScale.js
  - server/src/worker/relayCfg.js
  - tools/relayLoad.mjs
  - src/scenes/worldModes.js
  - src/scenes/world.js
routes: []
tables:
  - grant_tallies
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-21c.md"
related:
  - boat-shape-stamps-horse-cadence-and-grass-pacing
  - scale-clock-budget-and-heartbeat-overview
  - performance-priority-overview
invariants:
  - "`FOES_FULL_RESERVE = FOES_ROOM_BYTES_PER_S / 4` (`FOES_ROOM_BYTES_PER_S = 4 * 1024 * 1024`): delta frames spend only down to the reserve, while full frames may dip up to a quarter-second into debt (`_foesFan` in `server/src/index.js`)."
  - "Each sender receives priority once per `FOES_FIRST_MS` (`FOES_FULL_MS / 2`), and senders unheard for `FOES_UNHEARD_MS` jump ahead on arrival."
  - "In `server/src/foesHold.js`, held full frames queue as raw JSON strings with one slot per sender: a newer full frame replaces its sender held frame, and no delta bypasses a held full frame."
  - "Owner timestamp `tm` passes through the relay untouched so clients interpolate enemy motion on the owner clock rather than packet arrival time."
traps:
  - "Kill grants ride on full enemy frames; starving full frames leaves kills ungranted in `grant_tallies` (relay grant settings default to `measure` with `strip` and `door` off when unset)."
  - "Heartbeat `{ f: [] }` frames must carry a valid `isRoomKey` `k` or omit `k`, and departing sender handovers dip one reserve deeper (`FOES_LEFT_FLOOR`) before disconnect."
dfu: []
tags:
  - relay
  - synchronization
  - bandwidth
  - performance
---

# Relay Full-Frame Priority, Per-Sender Enemy Hold, and Owner Clock

Relay enemy sync (`src/net/wire.js`, `server/src/index.js`, `server/src/foesHold.js`, and `server/src/message/frames/foes.js`) prioritizes full snapshots over deltas so kill grants settle and clients interpolate on the owner clock.

## Reserve Budget and Per-Sender Hold

- **Reserve**: With `FOES_FULL_RESERVE = FOES_ROOM_BYTES_PER_S / 4` (`FOES_ROOM_BYTES_PER_S = 4 * 1024 * 1024`), deltas in `_foesFan` (`server/src/index.js`) spend down to the reserve, full frames dip a quarter-second into debt, and departing handovers reach `FOES_LEFT_FLOOR`.
- **Hold**: Senders receive priority every `FOES_FIRST_MS` (`FOES_FULL_MS / 2`), and senders unheard for `FOES_UNHEARD_MS` jump ahead. `server/src/foesHold.js` holds one raw JSON full frame per sender, replacing older snapshots and blocking deltas.

## Owner Clock, Grants, and Host Stepping

Owner timestamp `tm` passes through untouched. Because kill grants ride on full frames, starving them leaves kills ungranted in `grant_tallies` (`server/src/worker/relayCfg.js` defaults to `measure` with `strip` and `door` off). Heartbeat `{ f: [] }` frames require a valid `isRoomKey` `k` or no `k`. Host stepping unifies buildings (`src/scenes/worldModes.js`), dungeons (`drawFoes`), and streets (`src/scenes/world.js`), tested via `server/src/relayScale.js` and `tools/relayLoad.mjs`.
