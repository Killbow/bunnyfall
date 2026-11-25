---
slug: kings-gambit-overview
title: "King's Gambit Overview: Tavern Tactics Minigame on the Card Tables"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/kingsGambit.js
  - src/net/gambit/gambitTable.js
  - src/cards/gambit/gambitPatrons.js
  - src/cards/gambit/gambitTableSession.js
  - src/cards/gambit/gambitRemoteTable.js
  - src/cards/gambitTableGame.js
  - src/ui/gambitTableHud.js
  - src/ui/gambitTableWords.js
  - src/render/gambitTableDraw.js
  - src/world/gambitCloth.js
  - src/world/gambitMotion.js
  - src/mods/features.js
  - src/scenes/worldModes.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Kings-Gambit.md"
related:
  - kings-gambit-board-roster-and-armies
  - kings-gambit-turns-combat-and-hazards
  - kings-gambit-tavern-regulars-and-purses
  - kings-gambit-relay-table-stakes-and-ladder
  - tavern-cards-holdem-and-iliac-hand
  - tavern-card-tables-seating-and-physics
invariants:
  - "`src/net/kingsGambit.js` is the single pure, DOM-free rules engine shared by offline tavern regulars and the relay; every transition returns a new `structuredClone`-safe state or `{refused}` without mutating inputs."
  - "All randomness flows through the caller-supplied `rand32` wrapped in `checkedRand32`, which throws on non-uint32 values or after `KG_RAND_DRAWS_MAX` (`100_000`) draws; online matches draw from the relay CSPRNG."
  - "Side `0` is the host (moves first, deployed in foot rows `10..12`), and side `1` is the guest mirrored across `(c, r) -> (14 - c, 12 - r)`; the guest client rotates its view with `flipGambitState` and `unflipCommand` outside the law."
traps:
  - "King's Gambit is gated by the `kingsGambit` preference (`KINGS_GAMBIT_KEY` in `src/mods/features.js`, checked by `gambitTableOn`)."
  - "Each tavern table index hosts one game at a time; Hold'em or Iliac Hand sit requests return `'other game'` while a King's Gambit seat is occupied, and vice versa."
dfu: []
tags:
  - kings-gambit
  - minigame
  - tavern
  - cards
  - architecture
---

King's Gambit is a turn-based tactical board game played on the tavern card tables alongside Hold'em and Iliac Hand, gated by `KINGS_GAMBIT_KEY` (`kingsGambit` in `src/mods/features.js`, read via `gambitTableOn`).

## Shared Law and Table Presentation

`src/net/kingsGambit.js` defines the deterministic, DOM-free game rules shared by offline AI sessions (`src/cards/gambit/gambitTableSession.js` and `src/cards/gambit/gambitPatrons.js`) and relay tables (`src/net/gambit/gambitTable.js` and `src/cards/gambit/gambitRemoteTable.js`). Every transition draws through `checkedRand32` (`KG_RAND_DRAWS_MAX` `100_000`) and leaves inputs untouched. Side `0` (host) deploys in rows `10..12` and acts first; side `1` (guest) mirrors across `(14 - c, 12 - r)` via client-side `flipGambitState` and `unflipCommand`.

On the table (`src/world/gambitCloth.js`), the board aligns to `tableFrame` `axisYaw` with its foot at the host chair (`GAMBIT_MAT_LIFT` `0.003`, `GAMBIT_WALL_H` `0.024`, `GAMBIT_PILLAR_H` `0.042`, `GAMBIT_PILLAR_R` `0.34`, and `GAMBIT_WATER_DROP` `0.0025`). Pieces (`src/render/gambitTableDraw.js`) render upright Iliac card faces set in turned discs (`GAMBIT_DISC_SHARE` `0.84`, `GAMBIT_DISC_H` `0.006` m, and `GAMBIT_SELECT_LIFT` `0.01` m), using bone for the host, dark notched stone for the guest, and a brass ring for kings, staggered during muster by `GAMBIT_MUSTER_BEAT_S` (`0.12` s, `src/world/gambitMotion.js`).

## Controls, Camera, and Audio

In `src/cards/gambitTableGame.js`, `gambitLean` pitches the camera to `GAMBIT_LEAN_PITCH` (`55` degrees) at `GAMBIT_LEAN_FILL` (`0.94`) over `GAMBIT_LEAN_S` (`0.6` s) while playing 3D positional audio at the cloth. Input combines `gambitPressCell` ray-picking (`GAMBIT_SNAP_PX` `22` CSS px, `GAMBIT_TOUCH_TOP_PX` `64`, and `GAMBIT_ARM_MS` `4000` ms confirmation for gold stakes), `gambitBoardKey`, and `createGambitTableHud` (`gambitHudModel` in `src/ui/gambitTableHud.js` and `src/ui/gambitTableWords.js`).
