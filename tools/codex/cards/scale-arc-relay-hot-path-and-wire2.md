---
slug: scale-arc-relay-hot-path-and-wire2
title: "Relay Hot Path, Wire 2 Slim Poses, and Enemy-Stream Budget"
domain: multiplayer
kind: subcard
parent: scale-arc-capacity-plan
files:
  - server/src/index.js
  - server/src/relayScale.js
  - server/src/foesHold.js
  - src/net/wire.js
  - src/net/online.js
  - src/net/foesQuiet.js
replacesBible:
  - "11-Multiplayer/Scale-Arc.md"
related:
  - scale-arc-hub-pull-layers-and-cells
  - wire-protocol-and-frame-dispatch
  - room-engine-and-hub-sharding
invariants:
  - "`Room._all` trusts incremental socket index updates for `IDX_TRUST_MS` (`1000`) before running a full reconciliation walk, and hibernation attachments write lazily every `ATTACH_LAZY_MS` (`2000`) or immediately on stop."
  - "Pose fan-out selects up to `POSE_FAN_MAX` (`32`) nearest listeners in linear time, and inter-room fetches attach `AbortSignal.timeout(ROOM_CALL_MS)` (`5000`)."
  - "Wire 2 batches slim poses every `POSE_BATCH_MS` (`50`) and rosters every `ROSTER_BATCH_MS` (`1000`), flushing early at `WIRE2_BATCH_MAX` (`512`)."
  - "`slimPose` encodes `y` in centimeters everywhere, while `x` and `z` use whole world units in `nativePoseRoom` rooms and centimeters (`SLIM_SCENE_STEPS = 100`) elsewhere."
  - "Room enemy streams reserve `FOES_FULL_RESERVE` (`1` MiB of `FOES_ROOM_BYTES_PER_S = 4` MiB/s) for full keyframes, handovers, and senders quiet for at least `FOES_UNHEARD_MS` (`4000`)."
traps:
  - "`Room._poseFrame` must stay a separate method so `Room._message` remains below V8's optimized-bytecode size ceiling; never inline it."
  - "`workerd` treats every named export on the worker entrypoint module as a top-level binding or service entrypoint, so shared relay helpers must live in `server/src/relayScale.js`."
  - "Re-serializing numbers such as `1e20` expands JSON byte length; always check the outgoing serialized frame size before charging sender byte budgets."
  - "Analytics Engine queries read `RoomMetrics` doubles and blobs by position, so new counts are appended as blobs and never reordered, and blob counts are decimal strings read back with `toUInt32`."
tags:
  - relay
  - performance
  - wire
  - poses
  - enemies
---

Complementing `room-engine-and-hub-sharding`, this card covers the relay CPU and bandwidth optimizations in `server/src/index.js`, `server/src/relayScale.js`, `server/src/foesHold.js`, and `src/net/wire.js`.

## Socket Indexing, Lazy Attachments, and Wire 2 Poses

Inside `Room` (`server/src/index.js` and `server/src/relayScale.js`), `_all` reuses its in-memory socket map for `IDX_TRUST_MS = 1000` between `state.getWebSockets()` reconciliation scans, and socket attachments flush lazily every `ATTACH_LAZY_MS = 2000` (or at once when movement stops). `_poseFrame` is kept separate from `_message` so V8 optimizes both methods, selecting the `POSE_FAN_MAX = 32` nearest peers (`src/net/wire.js`) in linear time. Halo peers receive pose updates only on welcome, map-pixel crossings, `HALO_STEP_M = 8` meter steps, stop, or heartbeat.

Under Wire 2 (`src/net/wire.js` and `src/net/online.js`), `slimPose` quantizes `y` to centimeters everywhere, while `x` and `z` use whole world units in `nativePoseRoom` rooms and centimeters (`SLIM_SCENE_STEPS = 100`) in interior or local scenes. The relay batches outgoing poses every `POSE_BATCH_MS = 50` and roster diffs every `ROSTER_BATCH_MS = 1000`, flushing early if a batch reaches `WIRE2_BATCH_MAX = 512`.

## Enemy-Stream Budgets and Telemetry

`server/src/foesHold.js` and `src/net/foesQuiet.js` cap room enemy traffic at `FOES_ROOM_BYTES_PER_S` (4 MiB/s), holding `FOES_FULL_RESERVE` (1 MiB) for full frames, ownership handovers, and senders unheard for `FOES_UNHEARD_MS = 4000`. Queued deltas obey `FOES_HELD_PER_SENDER = 4`, `FOES_HELD_BYTES_MAX` (`64 * FOES_FRAME_MAX`, where `FOES_FRAME_MAX = 64` KiB), `FOES_TURN_BYTES = 16` KiB, and `FOES_LEFT_FLOOR = -2` MiB.

Inter-room calls time out at `ROOM_CALL_MS = 5000`. `WORLD_REPUBLISH_MS = 300000` suppresses duplicate world-state writes, and `RoomMetrics` flushes Analytics Engine points every `METRICS_WINDOW_MS = 300000` and on room drain.
