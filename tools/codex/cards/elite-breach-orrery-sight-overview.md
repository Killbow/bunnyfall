---
slug: elite-breach-orrery-sight-overview
title: "Elite Breach Orrery Sight: Seed Mirror, HUD Riddles, and Stone Sigils"
domain: multiplayer
kind: overview
parent: null
files:
  - src/systems/eliteGates/spireOrrery.js
  - src/net/eliteGates/egBrain.js
  - src/net/sdBrain.js
  - src/ui/eliteGates/egSpireHud.js
  - src/systems/eliteGates/egFight.js
  - src/systems/eliteGates/egSpan.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-17e.md"
related:
  - elite-breach-orrery-stone-reach
  - elite-breach-orrery-fair-still-and-landed-overview
  - shattered-hour-orrery-and-steps
invariants:
  - "`spireOrreryOf(seed, spec)` (`src/systems/eliteGates/spireOrrery.js`) computes `orreryOf((egSeed(seed, EG_ORRERY_SALT + spec.h) % 2147483646) + 1, egOrreryTurns(spec.c))` with `EG_ORRERY_SALT = 0x0a7e`, matching the relay draw."
  - "`egSpireHudModel` (`src/ui/eliteGates/egSpireHud.js`) populates `riddles = spireRiddleLines(spireOrreryOf(...))` only in trial halls for active non-spectating members, hiding `.eg-riddles` when empty."
  - "`sigilsFrame` (`src/systems/eliteGates/egFight.js`) renders each stone name and current hour from `pg.st`, while `egSpan.js` labels stone handles with their riddle sign."
traps:
  - "`EG_ORRERY_SALT` is intentionally duplicated in `spireOrrery.js` so `egBrain.js` avoids a relay bundle hash change; changing one side alone breaks client-relay riddle parity."
  - "Spectators and witnesses must never see trial riddle lines."
dfu: []
tags:
  - orrery
  - athenaeum
  - elite-breach
  - hud
---

# Elite Breach Orrery Sight: Seed Mirror, HUD Riddles, and Stone Sigils

Six geared twelve-hour stones lock the Athenaeum across `src/systems/eliteGates/spireOrrery.js`, `src/net/eliteGates/egBrain.js`, `src/net/sdBrain.js`, `src/ui/eliteGates/egSpireHud.js`, `src/systems/eliteGates/egFight.js`, and `src/systems/eliteGates/egSpan.js`. Circle depth sets `egOrreryTurns` between `16 + 2k` and `28 + 2k` turns, while exceeding `SD_FRAY_MAX = 48` resets the lock and inflicts `SD_FRAY_LASH = 0.25` health damage.

## Client Seed Mirror and HUD Riddles

- **Deterministic draw mirror:** `spireOrreryOf(seed, spec)` in `src/systems/eliteGates/spireOrrery.js` computes `orreryOf((egSeed(seed, EG_ORRERY_SALT + spec.h) % 2147483646) + 1, egOrreryTurns(spec.c))` with `EG_ORRERY_SALT = 0x0a7e` to match the relay draw. `EG_ORRERY_SALT` is intentionally duplicated in `spireOrrery.js` so `src/net/eliteGates/egBrain.js` avoids a relay bundle hash change; altering one side alone breaks client-relay riddle parity.
- **Trial HUD visibility:** `egSpireHudModel` (`src/ui/eliteGates/egSpireHud.js`) populates `riddles = spireRiddleLines(spireOrreryOf(...))` only in trial halls for active non-spectating members and hides `.eg-riddles` when empty. Spectators and witnesses must never see trial riddle lines.

## Stone Sigils and Handle Labels

In `src/systems/eliteGates/egFight.js`, `sigilsFrame` renders each stone name and current hour from `pg.st`, while `src/systems/eliteGates/egSpan.js` labels stone handles with their riddle sign.
