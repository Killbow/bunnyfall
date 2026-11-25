---
slug: host-logical-line-ceilings
title: "Host Logical-Line Ceilings"
domain: overview
kind: subcard
parent: host-split-overview
files:
  - tools/hostScope.mjs
  - tools/worldBudgetCheck.mjs
  - tools/worldBudget.json
routes: []
tables: []
replacesBible:
  - "01-Overview/Host-Split.md"
related:
  - host-split-overview
  - four-hosts-and-modal-frame
invariants:
  - "Host size is measured with logicalLines(fn): statements and declarations, object-literal Property entries, MethodDefinition, PropertyDefinition, StaticBlock, SwitchCase, and expression-bodied arrow functions."
  - "BlockStatement, EmptyStatement, destructuring-pattern properties, and for-loop header declarations are excluded so formatting, comments, and blank lines never alter the count."
traps:
  - "Extracting a module without lowering the host ceiling leaves freed capacity that later inline changes can quietly consume."
dfu: []
tags:
  - host-split
  - ceiling
  - metrics
  - ci
---

`tools/hostScope.mjs` measures host closure size in AST logical lines rather than raw text lines so formatting changes, identifier renames, comments, and blank lines never alter the metric, while any real structural addition (including new wiring) increments it.

## Locating the Host Function

`findHostFunction(ast, want)` walks the parsed Acorn AST to select the target host closure. When `want` is omitted, it picks the largest function node in the file; when `want` is provided, it picks the largest function matching that name. Anonymous function expressions inherit the name of their enclosing `VariableDeclarator` identifier, assignment left-hand side, or object `Property` key.

## `logicalLines(fn)` Counting Rules

`logicalLines(fn)` walks `fn.body` without descending into nested `BlockStatement` wrappers as countable lines of their own. A node increments the count when it is:

- Any statement or declaration inside the function body, excluding `BlockStatement`, `EmptyStatement`, and variable declarations inside `ForStatement.init`, `ForInStatement.left`, or `ForOfStatement.left`.
- An object-literal `Property` inside an `ObjectExpression` (destructuring `ObjectPattern` properties are ignored).
- A class `MethodDefinition`, `PropertyDefinition`, or `StaticBlock`.
- A `SwitchCase` clause.
- An expression-bodied `ArrowFunctionExpression` (`node.expression === true`), counting its implicit return statement.

Alongside `logicalLines(fn)`, `tools/worldBudgetCheck.mjs` enforces the raw line, import, top-level binding, and V8 `frame` bytecode budgets recorded in `tools/worldBudget.json` (see `four-hosts-and-modal-frame`).
