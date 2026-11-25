---
slug: scene-router-and-boot-doors
title: "Scene Router and Boot Doors"
domain: overview
kind: subcard
parent: home-port-doctrine-overview
files:
  - src/main.js
  - src/scenes/world.js
  - src/scenes/exterior.js
  - src/scenes/interior.js
  - src/scenes/dungeon.js
  - src/scenes/dataSource.js
  - src/scenes/shared.js
  - src/ui/touch.js
replacesBible:
  - "Home.md"
related:
  - home-port-doctrine-overview
  - four-hosts-and-modal-frame
  - arena2-data-gate-and-doctrine
invariants:
  - "Scene hosts are loaded exclusively through dynamic-import doors in src/main.js and never through static imports on the entry graph."
  - "Every playable scene boot path awaits ensureData() before starting a host, whereas the main menu boots without ARENA2 data."
  - "Scenes read binary assets through fetchBytes in src/scenes/shared.js, which delegates to getBytes in src/scenes/dataSource.js."
traps:
  - "Adding a static import of any scene host to src/main.js pulls the entire host dependency graph into initial module evaluation and slows startup."
tags:
  - boot
  - router
  - query-params
  - touch
---

# Scene Router and Boot Doors

`src/main.js` is the browser entry router. It keeps initial bundle evaluation fast by loading heavy scene modules only across dynamic `import()` boundaries after checking URL query parameters via `URLSearchParams`.

## Query Dispatch Order and Menu Doors

- **Probe and menu bypasses:** Passing `?shot` or `?nomenu` bypasses the front door menu and boots `bootDungeon` (`src/scenes/dungeon.js`) directly for automated probe runs (`?shot` sets `window.__shotReady` when the frame settles).
- **Direct scene doors:** When no probe bypass is active, the router checks query flags in strict order: `?interior` dispatches to `bootInterior` (`src/scenes/interior.js`), `?dungeon` dispatches to `bootDungeon`, `?world` dispatches to `bootWorld` (`src/scenes/world.js`), and any of `?exterior`, `?region`, or `?loc` dispatches to `bootExterior` (`src/scenes/exterior.js`).
- **Front door and pack pickers:** Opening the bare URL displays the enhanced front door menu without requiring classic game files; exiting the menu transitions into `bootWorld`. Passing `?begin` skips straight into the classic new-character start sequence, while `?music` and `?textures` open the optional pack pickers after `ensureData()` resolves.

## Data Gate and Touch Input

Every playable scene door awaits `ensureData()` before dynamically importing its host. Inside scenes, `fetchBytes` (`src/scenes/shared.js`) delegates asset reads to `getBytes` (`src/scenes/dataSource.js`). On touch-capable devices, `src/ui/touch.js` loads on demand and translates touch gestures into the standard desktop input actions.
