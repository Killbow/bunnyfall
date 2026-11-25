---
slug: starfall-overview
title: "Starfall: Festival Star Defense Overview"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/starfall/starfallLaw.js
  - src/net/festivalLaw.js
  - src/systems/starfall/starfallNight.js
  - src/systems/starfall/starfallCovens.js
  - src/systems/starfall/starCoven.js
  - src/systems/questlines/qlLines.js
  - src/net/questlineClaims.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Starfall.md"
related:
  - starfall-encounter-ledger-and-waves
  - starfall-relay-cells-and-version-floors
  - starfall-receipts-claims-and-spoils
  - starfall-sites-crater-and-client-host
  - world-events-and-signed-receipts
  - questlines-service-claims-titles-and-weir-key
invariants:
  - "`starfallRuns(nowMs)` aliases `festivalOpen(nowMs)`, reading wall time against `FESTIVALS` (for 2026, 20 October through 7 November UTC, end exclusive) when `contentOn('witchesFestival')` is enabled."
  - "A star is valid only when its impact timestamp (`fallAt`) falls inside the active festival window (`starInWindow`), allowing a star that landed before closing time to finish."
  - "One real-world hour equals one sky night (`STAR_HOUR_MS`), with three star impacts scheduled at `STAR_FALLS_MS` (`-15` min, `-7.5` min, and `0` relative to the hour)."
  - "Each night draws its coven from a 12-element shuffle bag (`starCovenOf`) that never starts a new bag with the final coven of the previous bag, while Glenmoril and Wroth remain excluded in `STAR_COVENS_APART`."
traps:
  - "The relay has no sky simulation; never import `skyLaw` into `starfallLaw.js`, which must remain pure for relay execution."
  - "The Heart-Star flag (`heartStar`) is derived deterministically from the night index on every device rather than serialized inside the receipt."
dfu: []
tags:
  - starfall
  - world-events
  - witches-festival
  - covens
  - seasonal
---

# Starfall: Festival Star Defense Overview

Starfall is a seasonal online world event tied to the Witches' Festival window in `src/net/festivalLaw.js` and `src/net/starfall/starfallLaw.js`. `starfallRuns(nowMs)` checks wall-clock UTC time against the `FESTIVALS` table (20 October through 7 November UTC in 2026, end exclusive) while `contentOn('witchesFestival')` is active. Each real hour represents one sky night (`STAR_HOUR_MS`), dropping three stars at `STAR_FALLS_MS` offsets of `-15` minutes, `-7.5` minutes, and `0` minutes from the top of the hour. As long as a star's `fallAt` timestamp sits inside the open window (`starInWindow`), defenders can complete the fight after the festival boundary passes.

## Night Covens, Heart-Star, and Questline Integration

- **Coven rotation (`src/systems/starfall/starfallCovens.js`, `src/systems/starfall/starCoven.js`):** `starCovenOf` selects the attacking coven from a deterministic 12-coven shuffle bag and prevents back-to-back repeats across bag boundaries. Glenmoril and Wroth live in `STAR_COVENS_APART` and never attack a fallen star.
- **Heart-Star (`src/systems/starfall/starfallNight.js`):** The third impact (`HEART_STAR = 2`) on the in-game Witches' Festival holiday (holiday `43`, sky day `283`) is the Heart-Star. It doubles the master's ritual circle, doubles gold and Starfall Glass payouts, and guarantees a Starspun Weave item.
- **Thirteenth Frostfall (`src/systems/questlines/qlLines.js`, `src/net/questlineClaims.js`):** The online questline `thirteenthFrostfall` (`QLTF01` through `QLTF04`) opens at level 6 for registered accounts during Starfall. Account witnesses verify `star` at step `0` and `stars3` at step `2`, awarding the `starwarden` title and `QL_STARWARDEN_CAKES` (`30` Soul Cakes).
