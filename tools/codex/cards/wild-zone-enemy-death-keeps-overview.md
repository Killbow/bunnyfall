---
slug: wild-zone-enemy-death-keeps-overview
title: "Wild Zone Enemy Death Keeps, Rise Sites, and Kill Credit"
domain: multiplayer
kind: overview
parent: null
files:
  - src/world/wildZone.js
  - src/world/wild/wildDropLaw.js
  - src/player/wildDeath.js
  - server-account/src/wild.js
  - server-account/src/routes/playRoutes.js
  - src/ui/deathScreen.js
  - src/world/wildWorld.js
  - src/scenes/world.js
  - src/systems/legacy/legacyWorld.js
  - src/player/deathRespawn.js
  - src/scenes/exterior.js
  - src/net/wildRef.js
  - src/net/wire.js
  - server/src/world/wild.js
routes:
  - /v1/wild/fall
tables: []
replacesBible:
  - `01-Overview/audits/Audit-Foe-Keeps.md`
related:
  - wild-zone-letters-tenth-and-sea-refusal
  - wild-zone-overview
  - wild-zone-pvp-death-drops-and-remains
  - integrity-pvp-duel-and-wild-referees
  - legacy-online-death-hold-and-revival
invariants:
  - "Only a referee-signed player kill drops carried items and bag contents; an enemy or environment death drops nothing carried and costs only the gold tenth (`WILD_GOLD_DIVISOR = 10`)."
  - "Referee kill state (`wildDeathAtHand` in `src/world/wildZone.js`) marks `kill: true`, and `wildRise` checks `Boolean(wildDeath()) || wildDeathKill()` so player kills rise outside the zone while enemy deaths rise at the nearest town or temple inside the ring (`wildRisePicks` / `wildRiseSite`)."
  - "Dying to an enemy or environment in combat credits the last fair player who struck within `WILD_REF.creditMs` (`WILD_KILL_CREDIT_MS`, 10 s) via relay `_wildCredit` / `wildCredit`."
traps:
  - "Charging the tenth on both the first dead frame and the delayed socket receipt double-charges."
  - "Resurrect after a kill must read spared loss before death ends, or gold lying in remains is falsely reported kept."
dfu: []
tags:
  - wild-zone
  - death
  - enemies
  - respawn
  - kill-credit
---

# Wild Zone Enemy Death Keeps, Rise Sites, and Kill Credit

Wild-zone enemy death keeps, combat kill credit, and respawn site selection span `src/world/wildZone.js`, `src/world/wild/wildDropLaw.js`, `src/player/wildDeath.js`, `src/systems/legacy/legacyWorld.js`, `src/net/wildRef.js`, `server/src/world/wild.js`, and `server-account/src/wild.js`.

## Player Kill Credit vs. Enemy Falls

When a player dies to an enemy or environmental hazard during combat, `_wildCredit` in `server/src/world/wild.js` invokes `wildCredit` (`src/net/wildRef.js`) to award the kill to the last fair player who landed a blow within `WILD_REF.creditMs` (`WILD_KILL_CREDIT_MS`, `10` seconds; `WILD_REF` also defines `mendMs` at `30` seconds and `riseMs` at `120` seconds).

Without a referee-signed player kill within that window, the death is an enemy fall:
- `/v1/wild/fall` (`server-account/src/wild.js` and `server-account/src/routes/playRoutes.js`) rejects `'foe'` falls with HTTP `400`.
- All carried gear and backpack items remain on the character, charging only the one-tenth gold penalty (`WILD_GOLD_DIVISOR = 10`) once so delayed socket receipts never double-charge.
- On a player kill, `wildFallHeard` offers worn pieces against the fall without a `15`-second cutoff, and resurrection reads spared loss before clearing death state.

## Rise Sites Inside and Outside the Ring

`wildDeathAtHand` (`src/world/wildZone.js`) sets `kill: true` on referee-confirmed player kills. In `src/systems/legacy/legacyWorld.js`, `wildRise` checks `Boolean(wildDeath()) || wildDeathKill()`: player kills respawn outside the wild zone, whereas enemy deaths rise at the nearest town or temple inside the ring via `wildRisePicks` and `wildRiseSite` (`src/world/wildWorld.js`, `src/player/deathRespawn.js`, `src/scenes/world.js`, and `src/scenes/exterior.js`).
