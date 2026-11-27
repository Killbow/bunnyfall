---
slug: "stock-classes-revised"
title: "Stock Classes Revised: Career Skill Lists and Burglar Armor Bits"
domain: "characters"
kind: "overview"
parent: null
files:
  - "src/characters/stockClasses.js"
  - "src/characters/chargenSession.js"
  - "src/characters/customClass.js"
  - "src/characters/specialAdvantages.js"
  - "src/formats/classFile.js"
  - "src/combat/formulas.js"
  - "src/combat/hostCombat.js"
routes: []
tables: []
replacesBible:
  - "04-Characters/Stock-Classes.md"
related:
  - "stock-class-description-rewrite"
  - "growth-class-skill-swap"
invariants:
  - "`src/formats/classFile.js` parses `CLASS00..17.CFG` verbatim, and `reviseStockCareer` (`src/characters/stockClasses.js`) replaces only `primarySkills`, `majorSkills`, `minorSkills`, and Burglar (`CLASS07.CFG`) armor-forbiddance bits (`ARMOR_BITS_SHIFT` from `specialAdvantages.js` forbids chain and plate instead of leather and chain)."
  - "Revisions apply in `loadCareers` and headless `?class=N` chargen (`src/characters/chargenSession.js`), while class enemies (`enemyEntity.js`) and existing saved characters keep their original careers."
  - "`isWholeRevision` enforces `3` primary, `3` major, and `6` minor distinct valid skills across the 18-entry `STOCK_CLASS_REVISIONS` table: every class holds a usable weapon or Destruction in primary/major, no language skill takes a slot, movement skills appear in primary/major only on Acrobat, Burglar, Monk, and Barbarian, and pure fighters pair two weapons with Critical Strike."
traps:
  - "Out-of-range indices or null careers return unchanged from `reviseStockCareer`."
  - "`classAffinityIndex` (`src/characters/customClass.js`) scores custom classes against the revised careers passed in from `loadCareers`."
  - "The magery band is read only when the career carries `abilityFlagsAndSpellPointsBitfield`. A missing field reads as 0, which decodes to the strongest multiplier, and would be listed for a character who never picked it."
dfu: []
tags:
  - "chargen"
  - "classes"
  - "skills"
  - "critical-strike"
---

# Stock Classes Revised: Career Skill Lists and Burglar Armor Bits

In `src/formats/classFile.js`, the parser reads `CLASS00..17.CFG` verbatim. Next, `reviseStockCareer` in `src/characters/stockClasses.js` replaces only `primarySkills`, `majorSkills`, `minorSkills`, and the Burglar (`CLASS07.CFG`) armor-forbiddance bits, where `ARMOR_BITS_SHIFT` from `src/characters/specialAdvantages.js` forbids chain and plate instead of leather and chain. Base attributes, hit points per level, advancement multipliers, magery flags, advantages, and disadvantages remain untouched.

## Revision Scope and Combat Hooks

- **Chargen Boundaries**: Revisions apply inside `loadCareers` and headless `?class=N` chargen (`src/characters/chargenSession.js`). Class enemies (`enemyEntity.js`) and existing saved characters retain their original career data, while `classAffinityIndex` (`src/characters/customClass.js`) scores custom classes against the revised careers from `loadCareers`.
- **Table Rules**: `isWholeRevision` validates `3` primary, `3` major, and `6` minor distinct skills across the 18-entry `STOCK_CLASS_REVISIONS` table. Every class holds a usable weapon or Destruction in primary or major slots, no language skill takes a slot, and movement skills appear in primary or major slots only on Acrobat, Burglar, Monk, and Barbarian.
- **Fighter Critical Strike**: Pure fighters pair two weapons with Critical Strike, which contributes to `skillsToHit` (`src/combat/formulas.js`) and trains through `tallySwingSkills` (`src/combat/hostCombat.js`).
