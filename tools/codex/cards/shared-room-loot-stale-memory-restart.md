---
slug: shared-room-loot-stale-memory-restart
title: "Shared Room Loot Stale Memory Generation Restart"
domain: online-coop
kind: subcard
parent: shared-room-loot-champion-base-overview
files:
  - src/items/roomLootHost.js
  - src/scenes/dungeonContext.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-25b.md"
related:
  - shared-room-loot-champion-base-overview
  - online-coop-shared-dungeon-and-interior-rooms
invariants:
  - "A host holding an unmatchable memory word with no speaker calls restartStaleContainer: clears staleMemory and _lootUnreadable, unborns the container, and bumps _roomNextGen past the stale generation."
  - "bodyGeneration = max(death time, _roomNextGen); newer generations supersede older terms on every client."
  - "roomTakeSeat restarts held stale words when a joiner becomes host, unless a readable word arrived."
  - "A body in _retyping is not restarted; its word lands after the rebuild."
traps:
  - "Solo players hit this when sharedWorld memory differs from the current roll (crossing level 3 between visits, or an update changing the base chain)."
  - "Live peer mismatches and memory words on non-host clients stay unread."
dfu: []
tags:
  - room-loot
  - shared-world
  - generations
---

# Shared Room Loot Stale Memory Generation Restart

When persisted `sharedWorld` room memory carries a container word whose base signature `h` no longer matches the current roll, `src/items/roomLootHost.js` and `src/scenes/dungeonContext.js` allow the room host to supersede the stale memory generation rather than leaving the container permanently unreadable.

## Stale Memory vs. Live Peer Mismatches

Solo and returning players encounter stale memory words when crossing `CHAMPION_MIN_LEVEL` (`3`) between dungeon visits or after an update modifies the deterministic base loot chain. Live words arriving from an active peer speaker, as well as memory words held on non-host clients, remain marked `_lootUnreadable`.

When the host holds an unmatchable memory word with no active speaker, it invokes `restartStaleContainer`. That helper clears `staleMemory` and `_lootUnreadable`, resets the container to unborn state, and advances `_roomNextGen` past the stale generation. A corpse calculated with `bodyGeneration = max(death time, _roomNextGen)` then broadcasts a higher generation that supersedes older terms on every client. Any body currently in `_retyping` skips the restart until its rebuild finishes, and `roomTakeSeat` restarts held stale memory words whenever a joiner promotes to host unless a readable word has already arrived.
