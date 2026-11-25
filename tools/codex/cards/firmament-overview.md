---
slug: firmament-overview
title: "Firmament: Passive Star Sky, Signs, and the Two Purses"
domain: systems
kind: overview
parent: null
files:
  - src/net/firmament/firmamentTree.js
  - src/net/firmament/firmamentLaw.js
  - src/net/firmament/firmamentBook.js
  - src/characters/firmamentLive.js
  - src/characters/firmamentPowers.js
  - src/ui/firmamentWindow.js
  - server-account/src/firmament.js
  - firmament.html
  - src/tools/firmamentLab.js
routes:
  - /v1/firmament/state
  - /v1/firmament/set
  - /v1/firmament/respec
tables:
  - firmament
  - firmament_sets
  - firmament_free_respec
replacesBible:
  - "06-Systems/Firmament.md"
related:
  - firmament-budget-caps-and-powers
  - firmament-service-sets-and-respec
  - firmament-client-book-and-build-codes
  - growth-tab-overview
  - growth-stage-and-embedded-skies
  - professions-arc-overview
invariants:
  - "`FIRM_NODES` holds exactly 518 stars and `FIRM_EDGES` 589 lines; `START_KEYS` are `sp.start` (The Serpent, center) plus `mg`, `sh`, `th`, `st`, `wr`, `rt` sign starts."
  - "`FIRM_RADII`: combat inner sky ends at keystone r 800; the life ring starts at r 900 (life keystone r 1290)."
  - "The life ring carries 42 life notables and 6 life keystones, and no life star carries a price (`isPrice`)."
  - "`starsFor(renown)` = `STARS_PER_RENOWN` (2) * (renown - 1), max 98 at `FIRM_RENOWN_MAX` 50; `craftPointsFor` = floor(sum of ranks / `CRAFT_RANKS_PER_POINT` 8), max 125."
  - "`fits`: combat stars must be within Stars; all stars within Stars + Craft. `pointsLeft` spends Craft on life stars first."
  - "Star keys are never renamed or reused; a removed key is dropped by `cleanKeys`, which refunds it."
traps:
  - "`firmamentLive.js` and `firmamentPowers.js` live in `src/characters/`, although in-file comments say `systems/`."
  - "Wayfarer road stars (66) are `ring: 'life'`, so Craft points alone can walk out to the trades."
dfu: []
tags:
  - firmament
  - passives
  - progression
  - renown
  - professions
---

# Firmament: Passive Star Sky, Signs, and the Two Purses

`src/net/firmament/firmamentTree.js` and `src/net/firmament/firmamentLaw.js` define the 518-star Firmament passive graph, the seven birthsign entry nodes, and the dual Stars and Craft point budgets.

- **Graph Geometry and Signs:** `FIRM_NODES` defines `518` stars linked by `589` edges in `FIRM_EDGES`. Seven `START_KEYS` anchor the constellations: `sp.start` (The Serpent at center), `mg` (The Mage), `sh` (The Shadow), `th` (The Thief), `st` (The Steed), `wr` (The Warrior), and `rt` (The Ritual). `FIRM_RADII` bounds the inner combat sky at keystone radius `800` and begins the outer life ring at radius `900` (life keystones at `1290`).
- **Tiers, Keystones, and Roads:** Small stars grant percentage shares of permanent stats via `smallStats`, while starts, notables, and keystones grant raw points. The combat ring holds six keystones (Atronach's Pact, Night Mother's Embrace, Wind Runner, Steed's Charge, Berserker's Fury, and Martyr's Vow). The life ring holds `42` life notables, `6` life keystones without downsides (`isPrice`), and `66` Wayfarer road stars (`ring: 'life'`).
- **Two Purses and Key Stability:** `starsFor(renown)` grants `2 * (renown - 1)` Stars up to `98` at `FIRM_RENOWN_MAX` (`50`), and `craftPointsFor` grants `floor(sum of ranks / 8)` Craft points up to `125` (`223` total). `fits` requires combat nodes to fit within Stars and total nodes within Stars plus Craft, while `pointsLeft` spends Craft on life stars first. Removed star keys are never reused and are stripped and refunded by `cleanKeys`.
