---
slug: quest-engine-parse-and-action-templates
title: "Quest Parse Layer and the 82 Action Templates"
domain: quests
kind: subcard
parent: quest-engine-overview
files:
  - src/systems/quest/parser.js
  - src/systems/quest/parseUtils.js
  - src/systems/quest/questResource.js
  - src/systems/quest/actions.js
  - src/systems/quest/machine.js
  - src/systems/quest/tables.js
  - src/systems/quest/table.js
  - src/systems/quest/task.js
  - src/world/worldDataVariants.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Quest-Arc.md"
related:
  - quest-engine-overview
  - quest-engine-tick-tasks-and-tombstones
invariants:
  - "defaultActionTemplates() (actions.js:3763) returns exactly 82 templates in DFU RegisterActionTemplates order. Reordering changes which template wins first."
  - "QuestMachine.getActionTemplate (machine.js:543) scans templates in order and the first match wins."
  - "matchFirst (questResource.js:27) replaces .NET multi-alternative regexes that reuse group names with ordered pattern lists."
traps:
  - "WorldUpdate is now a real template backed by src/world/worldDataVariants.js (RR3), not a guard. The variant registry starts empty."
dfu:
  - "Assets/Scripts/Game/Questing/Parser.cs"
  - "Assets/Scripts/Game/Questing/QuestMachine.cs"
tags:
  - quests
  - parser
  - action-templates
  - regex
  - dfu-parity
---

# Quest Parse Layer and the 82 Action Templates

The quest parse layer compiles script source lines, table lookups, resource declarations, and task headers into executable `ActionTemplate` instances across `src/systems/quest/`.

- **Table Lookups and Regex Matching (`src/systems/quest/parser.js`, `src/systems/quest/parseUtils.js`, `src/systems/quest/questResource.js`, `src/systems/quest/tables.js`, `src/systems/quest/table.js`, `src/systems/quest/task.js`):** `src/systems/quest/parser.js` and `src/systems/quest/parseUtils.js` tokenize quest blocks while `src/systems/quest/tables.js` and `src/systems/quest/table.js` map `Quests-*` text tables (such as `'Quests-GlobalVars'` to `globalVars`) and expose accessors including `globalVarsTable()`. In `src/systems/quest/questResource.js`, `matchFirst` replaces .NET multi-alternative regular expressions that reuse group names with ordered pattern arrays, and `src/systems/quest/task.js` parses global-variable task headers via `GLOBAL_VAR_HEADER`.
- **Ordered 82-Template Dispatch (`src/systems/quest/actions.js`, `src/systems/quest/machine.js`, `src/world/worldDataVariants.js`):** `defaultActionTemplates()` in `src/systems/quest/actions.js` returns `82` action templates in exact DFU `RegisterActionTemplates` order, and `QuestMachine.getActionTemplate` (`src/systems/quest/machine.js`) scans that array sequentially so the first matching template wins; reordering templates changes parse resolution. Every action class extends `ActionTemplate` and declares a `saveShape` schema for the save envelope. `WorldUpdate` is a live template backed by `src/world/worldDataVariants.js` (where the variant registry starts empty) rather than a no-op guard.
