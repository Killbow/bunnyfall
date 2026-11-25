---
slug: host-split-overview
title: "Host Split: Decomposing the Host Functions"
domain: overview
kind: overview
parent: null
files:
  - src/scenes/world.js
  - src/scenes/worldModes.js
  - src/scenes/dungeonContext.js
  - src/scenes/exterior.js
  - tools/hostScope.mjs
  - tools/hostMove.mjs
routes: []
tables: []
replacesBible:
  - "01-Overview/Host-Split.md"
related:
  - four-hosts-and-modal-frame
  - host-logical-line-ceilings
  - host-move-tooling-and-handle-semantics
  - host-split-extracted-modules
invariants:
  - "Hosts (bootWorld, createWorldModes, buildDungeonContext, and bootExterior) shrink toward wiring and lifecycle; new features go in companion modules that the host constructs and calls."
  - "Extraction moves code verbatim with no behavior change, and shared mutable host state crosses only through getter and setter handles."
traps:
  - "A merge of two branches that are each under the ceiling can push a host over it on main; the fix lands in a follow-up PR as an extraction or a documented ceiling adjustment."
dfu: []
tags:
  - host-split
  - hosts
  - refactor
  - architecture
---

Each scene host (`bootWorld` in `src/scenes/world.js`, `createWorldModes` in `src/scenes/worldModes.js`, `buildDungeonContext` in `src/scenes/dungeonContext.js`, and `bootExterior` in `src/scenes/exterior.js`) historically accumulated thousands of declarations inside one closure. Keeping mutable state in a single giant scope blocks isolated unit testing, cross-host code reuse, and focused review.

## Extraction Workflow

The host-split architecture shrinks the four hosts toward thin wiring and frame-lifecycle coordinators while companion modules hold feature state and per-frame logic:

1. **Map scope dependencies:** Run `tools/hostScope.mjs` to inspect top-level members inside a host function, their logical-line counts, and the bindings each contiguous member group reads or writes.
2. **Extract verbatim:** Use `tools/hostMove.mjs` to move a contiguous group into a companion module in the same folder, passing settled bindings by value and live mutable bindings through a `host` getter/setter handle object.
3. **Retarget and ratchet:** Update mutant JSON records and doc citation anchors with `retargetRecords`, lower the host ceiling, and verify with lint, type checks, tests, and mutation runs.

Migration began with low-dependency pilot extractions such as `src/travel/travelViewMarks.js` before moving higher-traffic subsystems once the handle conventions proved stable. This decomposition complements `four-hosts-and-modal-frame`, which governs host responsibilities and the `tools/worldBudgetCheck.mjs` V8 bytecode ceiling.

## Subcards

- `host-logical-line-ceilings`: `logicalLines(fn)` AST counting rules and `findHostFunction`.
- `host-move-tooling-and-handle-semantics`: `hostScope.mjs`, `hostMove.mjs`, by-value versus live handle rules, and temporal dead zone constraints.
- `host-split-extracted-modules`: companion modules extracted from `bootWorld` and `buildDungeonContext`, plus shared seam modules.
