---
slug: port-doctrine-scope-and-departures
title: "Port Doctrine: Scope, DFU Reference, and Departures"
domain: overview
kind: overview
parent: null
files:
  - README.md
  - LICENSE
  - .gitignore
  - src/formats/derivedTexture.js
routes: []
tables: []
replacesBible:
  - "01-Overview/Port-Doctrine.md"
related:
  - port-doctrine-approved-art-exceptions
  - home-port-doctrine-overview
  - arena2-data-gate-and-doctrine
invariants:
  - "Under `SCOPE1`, the game is its own design; Daggerfall Unity stays the primary reference and intentional differences are not defects."
  - "Binary format readers read ARENA2 exactly as Daggerfall Unity does and are validated against authentic files before dependent systems build on them."
  - "Translated C# logic keeps exact constants and table values; only Unity scaffolding is dropped."
  - "One Daggerfall Unity member has one export; grep the tree before adding a second copy."
  - "ARENA2 data and any render derived from its pixels never ship; .gitignore blocks ARENA2/."
traps:
  - "Shipping mock or placeholder data silently is prohibited."
  - "A screenshot or upscaled gallery frame of ARENA2 sprites is game data; generate such frames locally (tools/fpProbe.mjs) instead of committing them."
dfu: []
tags:
  - doctrine
  - scope
  - dfu
  - licensing
---

# Port Doctrine: Scope, DFU Reference, and Departures

The project runs on a desktop-first, framework-free WebGL2 renderer built with Vite and Node ESM (`README.md`, `LICENSE`). Under `SCOPE1`, the game is its own design, while Daggerfall Unity (MIT, credited to Interkarma and contributors in `README.md`) remains the primary architectural and mechanical reference, and intentional departures are not defects.

## Binary Readers and Logic Translation

- **Format parity:** Binary format readers parse `ARENA2` files with the exact byte layout used by Daggerfall Unity and are validated against authentic game archives before dependent gameplay systems build on them. Silent fallback to mock or placeholder data is prohibited.
- **Logic translation:** Translated C# systems preserve exact constants, formulas, and table values while dropping Unity engine scaffolding. Each Daggerfall Unity member corresponds to a single export across the codebase, so authors search the tree before introducing a duplicate symbol.

## Asset Boundaries

`ARENA2` game data and any image derived from its pixel silhouettes never enter git or build artifacts (`.gitignore` blocks `ARENA2/`). Derived textures are composed at runtime (`src/formats/derivedTexture.js`), and inspection screenshots or upscaled sprite frames are generated locally (such as via `tools/fpProbe.mjs`) rather than committed.
