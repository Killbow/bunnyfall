---
slug: elite-breach-lord-fall-overview
title: "Elite Breach Lord Fall Clock-Anchored Beats and Relay Stop"
domain: multiplayer
kind: overview
parent: null
files:
  - src/systems/eliteGates/egLordFall.js
  - src/systems/eliteGates/egFight.js
  - src/net/eliteGates/egLink.js
  - src/net/eliteGates/egLords.js
  - src/net/eliteGates/egBodies.js
  - src/net/wire.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-EG-FALL.md"
related:
  - elite-breach-lord-fall-beats-and-lights
  - elite-breach-look-lord-presence-and-fall
  - elite-breach-clock-and-hall-rhythm
invariants:
  - "Each lord fall is anchored to `fellAt` on the shared link clock so joining or reloading screens never replay past falls."
  - "Each beat (cry, thud, flash, glow) plays at most once per fall, and only while it is news (`FALL_CRY_LATE_MS`, `FALL_NEWS_MS`)."
  - "No corpse appears before `FALL_MS` (2400 ms) has elapsed since the fall."
  - "Seyth mirrors depart via `edie` and never fall; hidden lords cannot be hit, tick, or fall."
  - "`egLordHit` stops the walk of a felled lord with `egStop`, which every screen receives as a zero-speed walk."
  - "A screen holds the first-seen fallen position (`placeOf`), so a page facing an older relay still lays the corpse where it fell."
  - "A new `fellAt` that differs by less than `EG_FALL_SAME_MS` (= `FALL_MS`) re-anchors the existing fall. Played beats stay played and only the flash moves."
traps:
  - "Corpse state frees on raise, when bodies clear, on moving to a new hall, or on leave so nothing leaks across halls."
  - "`efs` (whole fight) can arrive with a relay timestamp after the link has already stamped `efl`. Without the re-anchor, a lord that was not the last to fall plays its fall twice."
  - "`foldEg` is pure. `fellOf` lays a lord down at once on `efl`, and `efell` sets `fellAt` and `hp: 0`."
dfu: []
tags:
  - elite-gates
  - eg-fall
  - lords
  - relay
  - sync
---

# Elite Breach Lord Fall Clock-Anchored Beats and Relay Stop

Elite Breach lord falls (`src/systems/eliteGates/egLordFall.js`, `src/systems/eliteGates/egFight.js`, `src/net/eliteGates/egLink.js`, `src/net/eliteGates/egLords.js`, `src/net/eliteGates/egBodies.js`, and `src/net/wire.js`) synchronize defeat beats across the shared link clock.

- **Clock Anchoring and Re-Anchoring:** `createEgFight` renders falls via `egLordFall.js` across `FIGHT_WORDS` (`efs`, `efl`, `efell`, and `edie`). Pure reducer `foldEg` applies `fellOf` to lay a lord down immediately on `efl`, while `efell` records `fellAt` and `hp: 0`. Anchoring to `fellAt` prevents joining or reloading clients from replaying old deaths. Each beat (cry, thud at `THUD_AT_MS` = `1500`, flash, and glow) fires at most once within `FALL_CRY_LATE_MS` and `FALL_NEWS_MS`, and the corpse appears only after `FALL_MS` (`2400` ms). If a full `efs` snapshot arrives with a `fellAt` within `EG_FALL_SAME_MS` (`FALL_MS`) of a local `efl` stamp, the fall re-anchors without replaying finished beats.
- **Movement Stop and Cleanup:** In `egLords.js`, `egLordHit` halts a felled lord via `egStop` (`egBodies.js`), broadcasting a zero-speed walk, while `placeOf` pins the initial fallen coordinates. Seyth mirrors leave via `edie`, hidden lords cannot be struck or fall, and corpse state clears on raise, body clear, hall transition, or exit.
