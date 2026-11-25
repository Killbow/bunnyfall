---
slug: home-port-doctrine-overview
title: "Home: Port Doctrine and Process Laws"
domain: overview
kind: overview
files:
  - src/main.js
  - src/scenes/shared.js
  - tools/mutate.mjs
  - tools/plainText.mjs
  - scripts/updateNumber.mjs
replacesBible:
  - "Home.md"
related:
  - scene-router-and-boot-doors
  - host-slot-reentrancy-and-async-coalescing
  - verification-tooling-mutation-cites-ledger
  - release-numbering-ste-notes-and-plain-text
  - four-hosts-and-modal-frame
  - arena2-data-gate-and-doctrine
  - host-split-overview
  - combat-formulas-and-power-ceiling
  - webgl2-renderer-and-textures
invariants:
  - "Daggerfall Unity is the reference implementation; each translated member lives in one canonical module and other modules import it."
  - "Shared multi-host behavior routes through src/scenes/shared.js so all four hosts receive identical updates."
  - "Proprietary ARENA2 game data never enters git history or build output."
traps:
  - "Renaming a translated Daggerfall Unity member hides it from the member grep in tools/ledgerSweep.mjs."
tags:
  - doctrine
  - process
  - home
  - port
---

# Home: Port Doctrine and Process Laws

Bunnyfall is a framework-free WebGL2, Vite, and Node ESM browser client that translates Daggerfall Unity gameplay systems into JavaScript modules. Every translated C# member resides in a single canonical module that other systems import rather than duplicate.

## Core Architecture Links

- **Scene hosts and modal frame:** Runtime state splits across four host closures (`src/scenes/world.js`, `src/scenes/worldModes.js`, `src/scenes/dungeonContext.js`, and `src/scenes/exterior.js`) coordinated by `src/scenes/shared.js`. See `four-hosts-and-modal-frame` and `host-split-overview`.
- **Entry routing and overlay slots:** `src/main.js` dispatches URL query parameters through dynamic-import boundaries (`scene-router-and-boot-doors`), while modal UI slots enforce re-entrancy and async coalescing rules (`host-slot-reentrancy-and-async-coalescing`).
- **Asset gate, rendering, and combat:** Classic `ARENA2` files load only at runtime from player storage (`arena2-data-gate-and-doctrine`), render through the custom WebGL2 pipeline (`webgl2-renderer-and-textures`), and obey progression caps (`combat-formulas-and-power-ceiling`).

## Machine-Checked Process Gates

Repository invariants are enforced by automated CLI checks rather than manual review alone:

- **Verification tooling (`verification-tooling-mutation-cites-ledger`):** `tools/mutate.mjs` runs committed mutation lists, `tools/citeAnchor.mjs` verifies text-anchored code citations, and `tools/ledgerSweep.mjs` checks non-comment `src/` files for translated Daggerfall Unity member names against tracked feature ledger entries.
- **Release and prose gates (`release-numbering-ste-notes-and-plain-text`):** `scripts/updateNumber.mjs` derives `MAJOR.MINOR.PATCH` from git history, `scripts/steNotes.mjs` and `scripts/changelogNotes.mjs` handle patch and release notes, and `tools/plainText.mjs` enforces comment, string, and prose baselines.
