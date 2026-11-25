---
slug: warded-blows-and-relayed-lord-radii
title: "Warded Blow Refusals, Lord Wake Phase, and Relayed Body Radii"
domain: combat
kind: overview
parent: null
files:
  - src/items/lootRarity.js
  - server-account/src/ledger.js
  - src/saves/save.js
  - src/world/rmbFlats.js
  - src/world/townStandIns.js
  - server-account/src/seatHolding.js
  - server-account/src/seatInfluence.js
  - src/net/professionLaw.js
  - src/ui/craftXpWords.js
  - src/ui/input.js
  - src/ui/enhancedHotbar.js
  - src/items/artifactEffects.js
  - src/characters/arcanePowers.js
  - src/items/sigilSetPowers.js
  - src/scenes/dungeonContext.js
  - src/combat/technique/techniqueBlow.js
  - src/net/wire.js
  - src/net/eliteGates/egLords.js
  - src/net/eliteGates/egBodies.js
  - src/net/eliteGates/egLink.js
  - src/systems/eliteGates/egFight.js
  - src/net/online.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Field-Bugs-2026-10-18f.md"
related:
  - rehomed-item-prints-and-craft-limit
  - elite-breach-landed-word-damage-numbers
  - elite-breach-ascent-route-graph-and-storeys
  - economy-ledger-and-item-judge
invariants:
  - "Held pieces keep their stored base on load; only minting is mended."
  - "heldFootprints in rmbFlats.js counts a footprint only where a building actually stands."
  - "Hotbar keys, mouse slots and crossbar check hostPaused on press in input.js."
  - "pathLanded, setStrike, dungeonContext.js spell doors and the artifactEffects.js drain guard all refuse warded targets."
  - "egLordsWake sends the first phase at once so a woken lord does not turn blows for up to 2 s."
  - "Relayed body radius travels per body via egRadiusWire / egRadii, not a hardcoded 1.0."
  - "egStoreyApart applies storey refusal in both egHitBody and egStrikeTurned."
traps:
  - "Re-adding a load-time base repair makes the realm ledger (ledgerStep) flag honest characters as forged."
  - "claimBounty and claimOrcCamp must read camp form and pixel, not site ID."
  - "Headsman Chop reads `healthShare` in `techniqueBlow.js` rather than a fixed multiplier."
  - "Turned or warded shafts must show the same 'Warded' / 'No footing' floaters as melee."
dfu: []
tags:
  - warded
  - relay
  - elite-gates
  - hotbar
---

# Warded Blow Refusals, Lord Wake Phase, and Relayed Body Radii

Combat ward refusals, Elite Breach lord phase wakeups, relayed body radii, town footprints, and hotbar pause guards span `src/combat/technique/techniqueBlow.js`, `src/net/eliteGates/egLords.js`, `src/net/eliteGates/egBodies.js`, `src/systems/eliteGates/egFight.js`, `src/world/rmbFlats.js`, and `src/ui/input.js`.

## Warded Blows, Wake Phase, and Relayed Radii

- **Warded target refusal:** `pathLanded` (`src/characters/arcanePowers.js`), `setStrike` (`src/items/sigilSetPowers.js`), `src/scenes/dungeonContext.js` spell doors, and the `src/items/artifactEffects.js` drain guard all refuse warded targets. Turned or warded ranged shafts display the same `Warded` and `No footing` floaters as melee strikes. In `src/combat/technique/techniqueBlow.js`, Headsman Chop scales by `healthShare` instead of a fixed multiplier.
- **Breach wake, radii, and storeys:** `egLordsWake` (`src/net/eliteGates/egLords.js`) dispatches the initial phase immediately upon wake so a newly woken lord never turns blows for up to two seconds. Relayed body radius (`0.6` to `2.2`) travels per body via `egRadiusWire` and `egRadii` (`src/net/wire.js`, `src/net/eliteGates/egBodies.js`, and `src/net/eliteGates/egLink.js`), while `egStoreyApart` enforces storey separation in both `egHitBody` and `egStrikeTurned`. `src/net/online.js` runs pose ticks at `POSE_HZ = 10`.

## World Footprints, Claims, and Hotbar Guards

`heldFootprints` in `src/world/rmbFlats.js` counts a footprint only where a building stands, and `src/world/townStandIns.js` exports `prismZ`. In `server-account/src/seatHolding.js` and `server-account/src/seatInfluence.js`, `claimBounty` and `claimOrcCamp` match by camp form and pixel rather than site ID. In `src/ui/input.js` and `src/ui/enhancedHotbar.js`, hotbar keys, mouse slots, and crossbar presses check `hostPaused`.
