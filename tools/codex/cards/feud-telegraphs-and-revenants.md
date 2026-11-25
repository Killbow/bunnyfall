---
slug: feud-telegraphs-and-revenants
title: "Feud Arc Overview and Switches"
domain: ai
kind: overview
parent: null
files:
  - src/ai/tells.js
  - src/ai/blowShapes.js
  - src/ai/tactics.js
  - src/revenants/feudLedger.js
  - src/combat/blowTaken.js
  - src/revenants/huntJournal.js
  - src/systems/sifrit/sifritLaw.js
  - src/revenants/revenant.js
  - src/revenants/revenantFeud.js
  - src/revenants/revenantUnquiet.js
  - src/revenants/unquietMark.js
replacesBible:
  - "12-Enhanced-AI/Feud-Arc.md"
related:
  - enemy-telegraphs-poise-and-punish
  - revenant-feuds-adaptations-and-fate
  - revenant-lairs-thefts-and-companions
  - feud-online-wire-and-revenant-ui
  - enemy-ai-navmesh-and-combat-tactics
invariants:
  - "Telegraph and poise mechanics gate on `tacticsSwitchOn()` (`enhancedAI` preference), and revenant systems gate on `revenantOn()` (`lootRarityOn()`)."
  - "Online below Renown 10, `revenantHeld()` suppresses new marks, births, returns, lair encounters, rumors, hunt marks, festering, and betrayals while keeping sworn loyalty ticks active."
  - "Deterministic revenant traits (weakness, signature, kin, and lair bearing) draw from `idStream` (FNV-1a plus mulberry32) without mutating shared `DFRandom`; `revenantGivenName` restores the `DFRandom` seed via `getSeed` and `setSeed`."
  - "`src/revenants/feudLedger.js`, `src/combat/blowTaken.js`, `src/revenants/huntJournal.js`, and `src/systems/sifrit/sifritLaw.js` remain zero-import leaf modules communicating through upward callback registration."
traps:
  - "`src/ai/blowShapes.js` is not import-free; line 5 statically imports Sifrit constants from `src/systems/sifrit/sifritLaw.js` so ground rendering can draw oversized boss telegraphs without pulling in `src/ai/tactics.js`."
  - "Balance constants shifted post-arc under Unquiet: `REVENANT_MAX` dropped from 5 to 3, active rank scaling rose to +40% health and +15% blows per rank while sworn scaling stayed +25% and +10%, and `WILL_RANK` lowered from 3 to 2."
tags:
  - ai
  - feud-arc
  - telegraphs
  - revenants
  - unquiet
  - architecture
---

The Feud Arc pairs telegraphed heavy enemy attacks and poise breaks with persistent revenants that remember past fights, adapt to player damage, claim dungeon lairs, or join as sworn companions.

## Switches and Renown Gate

Two switches gate the system. `tacticsSwitchOn()` (`src/ai/tactics.js`) checks `getPref('enhancedAI') === true` for telegraphs, poise, and overreach windows. `revenantOn()` (`src/revenants/revenant.js`) delegates to `lootRarityOn()` for revenant spawning and progression. In multiplayer, `revenantHeld()` suppresses new revenant activity below `REVENANT_MIN_RENOWN = 10` while keeping sworn companion loyalty ticks active. Offline play is never held.

## Module Layering and State

Zero-import leaf modules (`feudLedger.js`, `blowTaken.js`, `huntJournal.js`, and `sifritLaw.js`) prevent dependency cycles by accepting upward callbacks: `setFeudGate`, `setFeudClock`, and `setFeudWeakTest` (`feudLedger.js`); `registerBlowTakenMod` (`blowTaken.js`); and `setHuntJournal` (`huntJournal.js`). `src/ai/blowShapes.js` imports only Sifrit constants from `sifritLaw.js` so ground renderers stay independent of `tactics.js`.

Transient fight history collects on `entity._feud` and folds at fight end into saved records checked by `sanitize`, `sanitizeCompanion`, and `feudFields`.

## Subcards

- `enemy-telegraphs-poise-and-punish`: wind-up states, poise math, and punish windows.
- `revenant-feuds-adaptations-and-fate`: feud ledger, adaptations, weaknesses, last stand, and fate choices.
- `revenant-lairs-thefts-and-companions`: retinues, lairs, festering, online theft, and companions.
- `feud-online-wire-and-revenant-ui`: relay fields, puppet sync, cards, and UI tags.
