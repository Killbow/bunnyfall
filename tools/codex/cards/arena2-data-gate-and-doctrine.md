---
slug: arena2-data-gate-and-doctrine
title: ARENA2 Data Gate and Asset Rules
domain: overview
kind: overview
files:
  - src/scenes/dataSource.js
  - src/main.js
  - src/formats/derivedTexture.js
invariants:
  - "Classic ARENA2 game data never enters git or build output and is loaded only at runtime from player-supplied files."
  - "Derived rasters keeping ARENA2 pixel silhouettes are generated at runtime from player bytes."
  - "Recovery wipes clear only arena2 and derived IndexedDB stores, leaving music, textures, and morrowind packs intact."
traps:
  - "Do not commit repainted or upscaled ARENA2 sprites outside explicitly approved vendor or public art directories."
tags:
  - arena2
  - indexeddb
  - assets
  - licensing
---

# ARENA2 Data Gate and Asset Rules

Classic `ARENA2` game data is freeware, not redistributable, and never enters git or build output. `src/scenes/dataSource.js` loads player-supplied files at runtime and persists them in the browser.

- **Resolution chain:** `getBytes(name)` normalizes keys to uppercase basenames and checks the in-memory `Map`, IndexedDB (`project-dagger` store `arena2`), and `./arena2/*` over HTTP (served in local dev by Vite from `ARENA2_PATH`).
- **Boot gate and ingest diet:** `ensureArena2()` opens a one-time folder or archive picker when no source responds, storing only files matched by `KEEP` (`MANIFEST_V` wipes stale sets on version bumps). Separate IndexedDB stores (`music`, `textures`, `morrowind`, and `derived`) isolate optional user packs so recovery wipes only clear `arena2` and `derived`.
- **Derived-raster rule:** Any screenshot, upscale, or repainted sprite retaining `ARENA2` pixel silhouettes counts as non-redistributable game data and must be generated at runtime from player bytes (such as `src/formats/derivedTexture.js`).
- **Approved exceptions:** Permitted texture and sprite packs live strictly inside named directories such as `public/art/vanilla-enhanced/`, `public/art/sands-of-the-alikr/`, `public/art/snowfall/`, `public/art/daggerfall-enemy-expansion-repainted/`, `vendor/layered-armor/`, and `vendor/class-skins/Textures/`, alongside original art in `public/art/bunnyfall-*/`.
