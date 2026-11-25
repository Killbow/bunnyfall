---
slug: performance-online-shadow-hud-vao
title: "Sun Cascade Prepass Sharing, HUD Sweep Interval, and Persistent bindVao"
domain: rendering
kind: subcard
parent: performance-online-frame-overview
files:
  - src/render/shadowPass.js
  - src/render/renderer.js
  - src/ui/hudLayout.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Performance-Online.md"
related:
  - performance-online-frame-overview
  - enhanced-lighting-shadow-maps-and-casters
invariants:
  - "`sunCascadeMatrices` (`src/render/shadowPass.js`) shares view and depth work across nested cascades while `_sunCandidates` walks caster records once to derive nearer cascade lists (`SHADOW_TUNING.sunPrepass` defaults to `true`)."
  - "`src/ui/hudLayout.js` sweeps layout once at startup and thereafter on `SWEEP_MS`, running per-frame sweeps only on pages without an interval."
  - "`src/render/renderer.js` allocates a single lifetime `bindVao` closure rather than minting closures inside `_renderPasses` each frame."
traps:
  - "Allocating per-frame `bindVao` closures in shadow or air passes reintroduces megamorphic call sites and per-frame heap churn; `TUNING='{\"sunPrepass\":false}'` is reserved for `frameProbe.mjs` A/B comparisons."
dfu: []
tags:
  - performance
  - shadows
  - hud
  - webgl
---

# Sun Cascade Prepass Sharing, HUD Sweep Interval, and Persistent bindVao

Hot-path rendering and UI passes share precomputed cascade candidate lists, throttle HUD layout sweeps, and reuse one lifetime VAO binding closure across passes.

- **Sun cascade prepass sharing (`src/render/shadowPass.js`):** With `SHADOW_TUNING.sunPrepass` enabled by default (`true`), `sunCascadeMatrices` shares view and depth matrix work across nested sun cascades. Instead of walking the recorded caster array separately for every cascade, `_sunCandidates` filters the widest cascade once and derives the nearer cascade candidate lists from that pass. Passing `TUNING='{"sunPrepass":false}'` is reserved for `frameProbe.mjs` A/B oracle comparisons.
- **Interval HUD layout sweep (`src/ui/hudLayout.js`):** HUD layout validation runs once at startup and thereafter on a `SWEEP_MS` timer interval, falling back to per-frame layout sweeps only on host pages that lack interval support.
- **Persistent `bindVao` closure (`src/render/renderer.js`):** `Renderer` allocates a single lifetime `bindVao` closure and passes it into shadow and air passes each frame. Minting fresh `bindVao` closures inside `_renderPasses` on every frame creates megamorphic call sites and avoidable per-frame heap churn.
