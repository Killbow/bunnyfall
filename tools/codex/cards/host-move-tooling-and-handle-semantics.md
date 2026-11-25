---
slug: host-move-tooling-and-handle-semantics
title: "Host Scope Map, Host Move, and Handle Semantics"
domain: overview
kind: subcard
parent: host-split-overview
files:
  - tools/hostScope.mjs
  - tools/hostMove.mjs
  - tools/lib/isMain.mjs
routes: []
tables: []
replacesBible:
  - "01-Overview/Host-Split.md"
related:
  - host-split-overview
  - host-split-extracted-modules
invariants:
  - "Pass a binding by value (destructured once at construction) only when its value is settled: a const, class, or never-written let declared above the group, a hoisted function declaration, or a never-written parameter."
  - "Every other binding is live: the extracted module reads it as host.<name> through a getter, paired with a setter when the group writes to it."
  - "The moved group must consist of contiguous host body statements, and the extracted module must sit in the same directory as its host."
traps:
  - "Passing a reassigned let binding by value leaves the extracted module holding a stale snapshot."
  - "Reading a const declared below the group at construction time throws in the temporal dead zone; place the constructor call below every by-value const it references."
  - "hostScope matches identifiers by spelling across nested scopes, so shadowed names can over-count reads; inspect the group before moving it."
dfu: []
tags:
  - host-split
  - tooling
  - acorn
  - handles
  - tdz
---

`tools/hostScope.mjs` and `tools/hostMove.mjs` (both gated for CLI execution via `isMain` in `tools/lib/isMain.mjs`) analyze and extract contiguous statement groups from a host closure using Acorn AST passes.

## Scope Analysis (`tools/hostScope.mjs`)

`analyzeHost(source, want)` indexes every parameter and top-level statement in the host body. For a single member or a `--group a,b,c` slice, it reports logical lines, `reads` (host bindings referenced inside the group), `writes` (host `let` bindings mutated by the group), and `used-by` (external host statements that reference declarations inside the group). CLI flags `--top`, `--lines`, and `--fn` filter the report.

## Automated Extraction (`tools/hostMove.mjs`)

`planMove` classifies external dependencies into settled by-value bindings and live handle properties:

- **By value (`{ name }`):** Any `const`, `class`, or never-written `let` declared above the group, any hoisted `function` declaration in the host, and any never-written host parameter.
- **Live handle (`host.name`):** Any `let` or parameter that is ever reassigned, plus any `const`, `class`, or `let` declared below the group. `hostMove` rewrites reads to `host.<name>` and generates `get`/`set` accessors on the `host` handle object.

`planMove` refuses non-contiguous groups, group-declared `let` bindings, block-scoped `var` declarations, top-level module declarations, live function calls that bind `this`, and group declarations reassigned outside the group. After moving code, `retargetRecords` updates mutant JSON records under `tools/mutants/*.json` and rewrites doc citation anchors in place, normalizing Windows backslashes in import paths.
