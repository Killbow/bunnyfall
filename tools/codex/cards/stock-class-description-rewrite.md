---
slug: "stock-class-description-rewrite"
title: "Stock Class Description Rewrite in Classic and Enhanced Chargen"
domain: "ui"
kind: "subcard"
parent: "stock-classes-revised"
files:
  - "src/characters/stockClasses.js"
  - "src/ui/chargenArt.js"
  - "src/ui/enhancedChargen.js"
routes: []
tables: []
replacesBible:
  - "04-Characters/Stock-Classes.md"
related:
  - "stock-classes-revised"
invariants:
  - "`reviseClassDescription` preserves text in `TEXT.RSC` record `2100 + i` (`CLASS_DESCRIPTION_TEXT_ID + i`) up to the first `:` and preserves the final `\"Do you wish\"` prompt row while rewriting the six primary and major skill names via `SKILL_NAMES` and localized `t()` joins."
  - "The lead-in shares a line with primary skills only when combined character length fits within the widest existing row of that record."
traps:
  - "Records lacking a `:` before the final row return unchanged with a single console warning."
dfu: []
tags:
  - "chargen"
  - "text-rsc"
  - "i18n"
---

# Stock Class Description Rewrite in Classic and Enhanced Chargen

During character generation, `reviseClassDescription` in `src/characters/stockClasses.js` updates the `TEXT.RSC` class summary strings so displayed skill lists match the revised stock careers in both classic and enhanced interfaces.

## Record Splicing and UI Hooks

- **Lead-In and Prompt Preservation**: For `TEXT.RSC` record `2100 + i` (`CLASS_DESCRIPTION_TEXT_ID + i`), `reviseClassDescription` keeps all text up to the first `:` character and preserves the final `"Do you wish"` prompt row verbatim.
- **Localized Skill Names**: Between the lead-in colon and the confirmation row, the function rewrites the three primary and three major skill names using `SKILL_NAMES` combined with localized `t()` conjunctions.
- **Line Wrapping**: The lead-in prefix shares a single row with the primary skill list only when their combined character length fits within the widest existing row of that record; otherwise, the skill text wraps onto following rows.
- **Fallback Guard**: Any record lacking a `:` before the final row returns unchanged and emits a single console warning.
- **UI Wiring**: Classic chargen hooks `reviseClassDescription` inside `src/ui/chargenArt.js`, whereas enhanced chargen wires `f.describeClass` inside `src/ui/enhancedChargen.js`.
