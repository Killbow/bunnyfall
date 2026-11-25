---
slug: breach-portents-vanguard-waves
title: "The Vanguard: Platform Waves and Patience Meteors"
domain: multiplayer
kind: subcard
parent: breach-portents-overview
files:
  - src/net/gateBrain.js
  - src/world/gateArena.js
  - src/world/gateBoss.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Breach-Portents.md"
related:
  - breach-portents-overview
  - breach-boss-brain-and-courts
  - breach-portents-sundering-split
invariants:
  - "The first wave spawns `VG_OPEN_MS` (`6000` ms) after a challenger reaches the Bridgehead; subsequent waves trigger when `VG_WAVE_LEFT` (`0.25`) or fewer enemies remain or `VG_WAVE_MAX_MS` (`30` s) elapse, pausing whenever the platform has no fighters."
  - "`VG_STAGES` runs across two platforms (Bridgehead, then Muster) with three waves each; the final Muster wave includes its Markynaz lord, and clearing each stage forms the next lava walkway."
  - "Boss health shares scale by `VG_SHARE_X = (BOSS_TTK_S - VG_TEAM_S) / BOSS_TTK_S`, deducting `VG_TEAM_S` (`61`) team seconds of Vanguard wave combat from Valkynaz Ruhn's pool."
traps:
  - "Wave health equals team seconds of reference damage across living challengers on the platform, weighted by `VG_KIND_W`; `vanguardCountFor(n)` picks 3 to 10 bodies per wave while capping active enemies at `VG_STANDING_MAX` (`12`)."
  - "Once `VG_PATIENCE_MS` (`240` s) elapse after the opening wave, Valkynaz Ruhn hurls an Oblivion Meteor at a platform challenger every `VG_PATIENCE_EVERY_MS` (`15` s)."
dfu: []
tags:
  - portents
  - vanguard
  - waves
  - enemies
---

Under the Vanguard portent, challengers fight across two outer platforms before reaching Valkynaz Ruhn's courts (`src/net/gateBrain.js`, `src/world/gateArena.js`, and `src/world/gateBoss.js`). On Vanguard nights, `planOf` in `src/net/gateBrain.js` sets the `FloorPlan` entry `root` to `FLOOR.bridgehead`.

## Stage Progression and Wave Scaling

The gauntlet spans two `VG_STAGES` platforms (Bridgehead, then Muster) with three waves each. The first Bridgehead wave spawns `VG_OPEN_MS` (`6000` ms) after a fighter steps onto the platform. Later waves arrive when the active wave drops to `VG_WAVE_LEFT` (`0.25`) or `VG_WAVE_MAX_MS` (`30` seconds) elapse, while an empty platform waits for a challenger. The relay announces wave progress via `vgw` sub-words and enemy spawns or deaths via `ad` and `adie`.

Wave health equals team seconds of `dpsRef` across living challengers on that platform, split across enemy kinds by `VG_KIND_W`. `vanguardCountFor(n)` spawns `3` to `10` enemies per wave while capping active enemies at `VG_STANDING_MAX` (`12`). A Markynaz lord leads the final Muster wave, and clearing each platform raises the next walkway (`f.xa`).

## Boss Health Discount and Patience Meteors

Each fighter's boss health share scales by `VG_SHARE_X = (BOSS_TTK_S - VG_TEAM_S) / BOSS_TTK_S`, deducting `VG_TEAM_S` (`61` team seconds) for the waves. After `VG_PATIENCE_MS` (`240` seconds) from the first wave, Ruhn hurls an Oblivion Meteor at a platform fighter every `VG_PATIENCE_EVERY_MS` (`15` seconds).
