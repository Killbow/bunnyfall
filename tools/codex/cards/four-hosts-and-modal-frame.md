---
slug: four-hosts-and-modal-frame
title: Four Hosts and the Modal Frame
domain: overview
kind: overview
files:
  - src/scenes/world.js
  - src/scenes/worldModes.js
  - src/scenes/dungeonContext.js
  - src/scenes/exterior.js
  - src/scenes/shared.js
  - tools/worldBudgetCheck.mjs
  - tools/worldBudget.json
invariants:
  - "Host closures (bootWorld, createWorldModes, buildDungeonContext, bootExterior) do not expand inline; extract features into dedicated modules."
  - "worldModes.frame returns false only in exterior mode and returns true on every interior, dungeon, overlay, and exit branch."
  - "Host frame bytecode stays below the 61,440-byte V8 optimization cliff enforced by tools/worldBudgetCheck.mjs."
traps:
  - "Returning undefined from worldModes.frame lets the outer host run exterior rendering and floating-origin recentering over interior or dungeon coordinates."
  - "Shared player, motor, sky, or combat hooks wired into one host instead of src/scenes/shared.js break parity across the other three hosts."
dfu:
  - Assets/Scripts/Game/PlayerEnterExit.cs
tags:
  - hosts
  - scenes
  - modal-frame
  - budget
---

# Four Hosts and the Modal Frame

Bunnyfall splits playable client runtime state across four host scopes: `bootWorld` (`src/scenes/world.js`), `createWorldModes` (`src/scenes/worldModes.js`), `buildDungeonContext` (`src/scenes/dungeonContext.js`), and `bootExterior` (`src/scenes/exterior.js`), plus standalone wrappers in `src/scenes/dungeon.js` and `src/scenes/interior.js`. Because each host holds mutable state in one closure, hosts do not grow.

- **Module extraction:** Put new features into standalone modules (such as `*Host.js` files) owning their state and frame step, leaving only construction and one-line calls in the host.
- **Four-host parity:** Shared player, motor, sky, or combat hooks belong in `src/scenes/shared.js` so behavior wired into one host is never missed in the other three.
- **Budget ratchet:** `node tools/worldBudgetCheck.mjs` checks `tools/worldBudget.json` for `bootWorld` non-empty lines, static imports, and top-level bindings, plus V8 `frame` bytecode size across `world.js`, `worldModes.js`, and `exterior.js` to stay below the 61,440-byte V8 optimization cliff.
- **Modal return contract:** `worldModes.frame(dt, now)` returns `false` only in `'exterior'` mode and explicitly returns `true` on every interior, dungeon, overlay, and mid-frame exit branch. Returning `undefined` lets the outer host run its exterior render and floating-origin recenter pass over interior or dungeon coordinates.
