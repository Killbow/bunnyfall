---
slug: "lived-time-saves-and-offline-copy"
title: "Lived Time Save Clocks and Online/Offline Copies"
domain: "saves"
kind: "subcard"
parent: "lived-time-two-clocks-overview"
files:
  - "src/saves/save.js"
  - "src/saves/offlineCopy.js"
  - "src/saves/onlineCheckpoint.js"
  - "src/ui/enhancedMenu.js"
  - "src/world/worldTick.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Lived-Time.md"
related:
  - "lived-time-two-clocks-overview"
  - "accounts-and-cloud-saves-overview"
  - "realm-arc-rescue-saves-and-stranded-copies"
invariants:
  - "Online saves store classicMinutes (character clock) and worldMinutes (worldMinutesToSave())."
  - "saneSaveClock accepts only finite numbers 0 <= v < SAVE_CLOCK_MAX (2 ** 31); otherwise load falls back."
  - "offlineCopyOf drops worldMinutes; onlineCopyOf(snap, worldNow) rebases onto the shared clock and sets joinFresh."
traps:
  - "Pre-LIVED1 saves pass through clampMarkersAheadOf so markers ahead of the character clock are clamped back."
  - "The relay keeps save envelopes opaque; never hardcode the relay version string."
dfu: []
tags:
  - "lived-time"
  - "save"
  - "offline-copy"
---

# Lived Time Save Clocks and Online/Offline Copies

Save serialization across `src/saves/save.js`, `src/saves/onlineCheckpoint.js`, and `src/world/worldTick.js` preserves both personal and shared timelines. In online mode, save payloads record `classicMinutes` for the personal character clock alongside `worldMinutes`, which is captured via `worldMinutesToSave()`. Because the multiplayer relay treats save envelopes as opaque blobs, client serialization and migration code must never hardcode a relay version string.

During save restoration, `saneSaveClock` validates stored clock readings and accepts only finite numbers `v` satisfying `0 <= v < SAVE_CLOCK_MAX` (where `SAVE_CLOCK_MAX` equals `2 ** 31`), falling back cleanly when a field is missing or out of range. For legacy pre-LIVED1 payloads where world-stamped timers could sit ahead of personal lived time, the load path runs `clampMarkersAheadOf` so any markers ahead of the character clock are clamped back to prevent stuck cooldowns or premature expirations.

Mode conversion utilities live in `src/saves/offlineCopy.js`, with user-facing entry points exposed through `src/ui/enhancedMenu.js`. Converting an online character to single-player runs `offlineCopyOf`, which strips `worldMinutes` so the save collapses onto `classicMinutes`. Converting an offline save to multiplayer runs `onlineCopyOf(snap, worldNow)`, which rebases shared world markers onto `worldNow` and sets `joinFresh` for initial session entry.
