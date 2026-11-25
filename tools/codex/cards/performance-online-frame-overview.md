---
slug: performance-online-frame-overview
title: "Online Frame Performance: Source-Edit Probes and Living World Way Budgets"
domain: rendering
kind: overview
parent: null
files:
  - tools/frameProbe.mjs
  - tools/onlineFrameProbe.mjs
  - tools/loadHarness.mjs
  - tools/frameAb.mjs
  - src/platform/onlineLane.js
  - src/net/accountClient.js
  - src/net/remotePlayers.js
  - src/worldEvents/gatePool.js
  - src/render/glProgram.js
  - src/systems/livingWorld/ways.js
  - src/systems/livingWorld/livingTown.js
  - src/systems/livingWorld/livingRoads.js
  - src/systems/livingWorld/livingSwitch.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Performance-Online.md"
related:
  - performance-online-shadow-hud-vao
  - living-world-roads-trips-and-encounters
  - living-world-overview
  - enhanced-lighting-shadow-maps-and-casters
invariants:
  - "Probe instrumentation applies asserted source-edit tables (`FRAME_PROBE_EDITS` in `tools/frameProbe.mjs` and `ONLINE_PROBE_EDITS` in `tools/onlineFrameProbe.mjs`, failing fast on missing needles) against local services started via `standServices` (`tools/loadHarness.mjs`)."
  - "Online boot rejects debug URL parameters in `ONLINE_REFUSED_FLAGS` (`src/platform/onlineLane.js`, including `shot` and `tod`); `onlineFrameProbe.mjs` permits `?shot` solely to mount probe seams across `0`, `20`, and `60` `OnlineSession` bots."
  - "`src/systems/livingWorld/ways.js` resolves a minimum pair floor per frame and continues only while elapsed query time stays below `WAYS_MS_PER_FRAME` (`2` ms) and count stays at or below `WAYS_MAX_PER_FRAME` (`32`), gated by `livingWorldOn()`."
traps:
  - "Because `?tod` is refused online, `tools/frameAb.mjs` online A/B runs compare per-function CPU time and allocations rather than total wall-frame time; while town trip ways remain unresolved, `_roadsOf` (`livingTown.js`) and `sweepOn` (`livingRoads.js`) replan trips."
  - "Peer spatial audio nodes build only within `peerInEarshot` (`PEER_SOUND_PROFILE.maxDistance` in `src/net/remotePlayers.js`), and `ensurePass` (`src/worldEvents/gatePool.js`) compiles `GatePassRenderer` shaders lazily on first draw."
dfu: []
tags:
  - performance
  - online
  - probe
  - living-world
  - profiling
---

# Online Frame Performance: Source-Edit Probes and Living World Way Budgets

Online frame profiling measures per-phase CPU time, heap growth, and crowd scaling across local services without shipping production probe hooks.

- **Asserted source-edit probes (`tools/frameProbe.mjs`, `tools/onlineFrameProbe.mjs`, `tools/loadHarness.mjs`, `tools/frameAb.mjs`):** Probe runs apply `FRAME_PROBE_EDITS` and `ONLINE_PROBE_EDITS` (failing fast if any source needle drifts) against local auth and world services started via `standServices` (`src/net/accountClient.js`, `src/render/glProgram.js`). While `src/platform/onlineLane.js` blocks debug flags in `ONLINE_REFUSED_FLAGS` (`shot`, `tod`), `onlineFrameProbe.mjs` allows `?shot` only to mount probe seams across `0`, `20`, and `60` `OnlineSession` bots. Because `?tod` stays refused online, `tools/frameAb.mjs` compares per-function CPU time and allocation counts rather than total wall-frame time.
- **Living World way budgets (`src/systems/livingWorld/ways.js`, `livingTown.js`, `livingRoads.js`, `livingSwitch.js`):** When `livingWorldOn()` (`LIVING_WORLD_TUNING.override ?? (isEnhanced() && pref !== false)`) is active, `ways.js` resolves at least its minimum pair floor per frame and continues only while elapsed query time stays below `WAYS_MS_PER_FRAME` (`2` ms) and pair count stays at or below `WAYS_MAX_PER_FRAME` (`32`). Until trip ways settle, `_roadsOf` and `sweepOn` replan town trips.
- **Peer audio and gate shaders (`src/net/remotePlayers.js`, `src/worldEvents/gatePool.js`):** Peer spatial audio nodes allocate only inside `peerInEarshot` (`PEER_SOUND_PROFILE.maxDistance`), and `ensurePass` compiles `GatePassRenderer` shaders lazily on first draw.
