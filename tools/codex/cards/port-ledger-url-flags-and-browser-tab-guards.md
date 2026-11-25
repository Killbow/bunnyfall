---
slug: "port-ledger-url-flags-and-browser-tab-guards"
title: "URL Power Flags and Browser-Tab Hazard Guards"
domain: "overview"
kind: "subcard"
parent: "port-ledger-overview"
files:
  - "src/platform/onlineLane.js"
  - "src/main.js"
  - "src/scenes/world.js"
  - "src/ui/input.js"
  - "src/platform/unloadGuard.js"
  - "src/player/pointerLock.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/Port-Ledger.md"
related:
  - "port-ledger-overview"
  - "scene-router-and-boot-doors"
  - "realm-arc-overview"
invariants:
  - "`publishBootParams` (`src/platform/onlineLane.js`) writes normalized boot parameters back to `location.search` via `history.replaceState` so all subsequent URL readers observe identical flags."
  - "An online boot calls `refuseOnlinePowerFlags`, which deletes every `ONLINE_REFUSED_FLAGS` key before anything reads it, then republishes the URL (src/scenes/world.js)."
  - "`installContextMenuGuard` installs one capture-phase contextmenu listener per document and suppresses the menu everywhere except text-entry targets."
  - "`armUnloadGuard` installs one beforeunload listener that only prompts while some arm reports at-risk progress. It never autosaves."
traps:
  - "Call `releaseUnloadGuard` before any navigation the game starts itself (exit to menu, reload onto a moved build), or the player gets a spurious prompt."
  - "Offline, the URL flags stay ungated by owner decision (F304). Do not gate them offline."
dfu: []
tags:
  - "boot"
  - "url-flags"
  - "online"
  - "browser"
  - "input"
---

# URL Power Flags and Browser-Tab Hazard Guards

Boot parameter normalization (`src/platform/onlineLane.js`, `src/main.js`, `src/scenes/world.js`) and browser-tab guards (`src/ui/input.js`, `src/platform/unloadGuard.js`, `src/player/pointerLock.js`) strip URL power flags on online boot and guard against unintended tab navigation, context menus, and pointer-lock exits.

## Boot Parameters and Online Flag Scrubbing

- **URL normalization (`publishBootParams`):** Writes normalized query parameters back to `location.search` via `history.replaceState` so all URL readers observe identical flags.
- **Online power-flag refusal (`refuseOnlinePowerFlags`):** Returns `[]` when `online` is absent, leaving all flags ungated offline (`F304`). On online boot (`src/scenes/world.js`), it deletes all 17 `ONLINE_REFUSED_FLAGS` keys (`shot`, `fly`, `nofoes`, `tp`, `class`, `spell`, `weapon`, `spawn`, `region`, `loc`, `tod`, `timescale`, `weather`, `wseed`, `season`, `editor`, and `live`) before any consumer reads them, then republishes the URL.

## Context Menu, Unload, and Pointer-Lock Guards

- **Context menu and unload guards:** `installContextMenuGuard` (`src/ui/input.js`) installs one capture-phase `contextmenu` listener per document, blocking browser menus outside text-entry targets. `armUnloadGuard` (`src/platform/unloadGuard.js`) installs one `beforeunload` listener that prompts only while an active arm reports unsaved progress and never autosaves; game-started navigations call `releaseUnloadGuard` first.
- **Escape and pointer lock (`src/player/pointerLock.js`):** Separates pointer-lock exits from pause actions via `PAGE_RELEASE_MS = 500`, `ESCAPE_DELIVERY_MS = 60`, `REAL_ESCAPE_MS = 300`, `SHELL_RELOCK_MS = 1000`, and `RELOCK_GRACE_MS = 150`.
