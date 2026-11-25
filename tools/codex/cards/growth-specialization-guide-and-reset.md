---
slug: growth-specialization-guide-and-reset
title: "Specialization Guide States and the 200,000-Gold Reset"
domain: characters
kind: subcard
parent: growth-tab-overview
files:
  - src/ui/growth/specGuide.js
  - src/characters/specReset.js
  - src/characters/arcanePaths.js
  - src/characters/martialPaths.js
  - src/characters/masterSkills.js
  - src/saves/save.js
  - src/justice/court.js
  - src/net/realmGoldLaw.js
routes: []
tables: []
replacesBible:
  - "10-UI/Growth.md"
related:
  - growth-tab-overview
  - growth-class-skill-swap
  - weapon-technique-roster-and-affix-line
  - realm-saves-and-mod-save-hooks
  - items-gold-counter-and-wagon
invariants:
  - "`SPEC_STATES` (`src/ui/growth/specGuide.js`) classifies every path into `'chosen'`, `'open'`, `'ready'`, `'reach'`, `'closed'`, `'slots'`, or `'never'`, corresponding to the labels Chosen, Available, Needs mastering, Not yet, Closed, No slots left, and Not for your class."
  - "While a family holds a chosen path, every sibling path in that family evaluates to `'closed'` unless its skill pair already evaluates to `'never'` or `'slots'`; resetting a path does not refund any spent mastery slot."
  - "`SPEC_RESET_GOLD` (`200000` in `src/characters/arcanePaths.js`) is charged per family via `payUndoable` in `resetSpec` (`src/characters/specReset.js`), which clears `arcanePath` or `martialPath` to `null`, sets the family prompted flag to `true`, and recalculates `computeEntityMods`."
traps:
  - "The guard that blocks resetting when no alternative path could ever open (`growth.spec.reset.only`) is enforced only in the UI model (`resetModel` and `afterReset` in `src/ui/growth/specGuide.js`); `specResetRefusal` in `src/characters/specReset.js` checks only the family, held path, and gold."
  - "Offline resets draw only from inventory coins and letters of credit (`src/justice/court.js`), whereas online realm resets also draw from the Empire account (`REALM_EMPIRE_ACCOUNT` via `accountOfSave` in `src/net/realmGoldLaw.js`)."
  - "`src/saves/save.js` writes `career.arcaneMirror` on save so legacy migration logic cannot resurrect a reset path, then strips mirror fields from the live career object on load."
dfu:
  - PlayerEntity.cs
tags:
  - specializations
  - arcane-paths
  - martial-paths
  - reset
  - gold
---

# Specialization Guide States and the 200,000-Gold Reset

`src/ui/growth/specGuide.js` and `src/characters/specReset.js` drive the Specializations page on the Growth tab, evaluating Arcane (`src/characters/arcanePaths.js`) and Martial (`src/characters/martialPaths.js`) path eligibility against mastered class skills (`src/characters/masterSkills.js`) and executing paid per-family path resets.

## Unified Family Law and Path States

`FAMILY_LAW` (`src/ui/growth/specGuide.js`) abstracts Arcane and Martial specializations behind a shared interface covering family skills, path definitions, the currently held path, currently open choices, reachability (`pathPossible` and `martialPossible`, requiring `masterableCount >= 2`), and selection (`choosePath` and `chooseMartialPath`).

`specGuideModel(entity)` produces the state for every path in `SPEC_STATES`, while `skillStandText` formats the per-skill requirement line:

- `chosen` (Chosen) and `open` (Available to claim now).
- `ready` (Needs mastering, requiring Master Skills to be enabled) and `reach` (Not yet).
- `closed` (another path in the family is held), `slots` (No slots left), and `never` (Not for your class).

## The 200,000-Gold Family Reset

`resetSpec` charges `SPEC_RESET_GOLD` (`200,000` gold per family) via `payUndoable` (drawing from coins, letters of credit, and online `REALM_EMPIRE_ACCOUNT` balances), clears `arcanePath` or `martialPath` to `null`, marks the family's prompted flag `true`, and runs `computeEntityMods`. Mastered skills and the spellbook remain intact, any Arcane signature spell downgrades to a standard spell bundle, and `career.arcaneMirror` (`src/saves/save.js`) prevents older save-carry hooks from restoring the cleared path.
