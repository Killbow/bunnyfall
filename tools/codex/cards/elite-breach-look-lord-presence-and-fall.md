---
slug: elite-breach-look-lord-presence-and-fall
title: "Elite Breach Lord Presence: Oversized Sprites, Hover, and Scaled Fall"
domain: rendering
kind: subcard
parent: elite-breach-look-overview
files:
  - src/world/eliteGates/egKit.js
  - src/systems/eliteGates/egFight.js
  - src/systems/eliteGates/egLordFall.js
  - src/net/eliteGates/egLaw.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Elite-Gates-Look.md"
related:
  - elite-breach-look-overview
  - elite-breach-lords-seam-and-vestiges
  - breach-boss-brain-and-courts
invariants:
  - "`EG_LORD_PRESENCE` (lord 1.6, valkynaz 1.8, champion 1.4) scales only the drawn sprite. The body scale in `EG_LORDS`, the relay `bodyR`, and the client hit floor radius stay unchanged."
  - "`egPresenceOf(key)` picks champion for Kyn ranks, valkynaz for `EG_LORDS[key].valk`, and lord otherwise."
  - "Lords and enemies are base-anchored billboard sprites that cast no shadow (OW-BIG); there are no 3D boss or enemy models."
  - "Flyers hover at `EG_LORD_HOVER_M` (6 m at body size) times presence, so the grown sprite clears player heads."
traps:
  - "Never grow `bodyR` to match the sprite; only the vertical hit height follows the drawn sprite."
  - "EG-FALL scales the sink depth, fall height, and corpse size by `EG_FALL_PER(drawn)` (`egFallSinkM`, `egFallTallM`, `egCorpseScale`), relative to the Ruhn boss look's scale."
dfu: []
tags:
  - elite-gates
  - eg-look
  - lords
  - sprites
  - boss
  - eg-fall
---

# Elite Breach Lord Presence: Oversized Sprites, Hover, and Scaled Fall

`src/systems/eliteGates/egFight.js` and `src/systems/eliteGates/egLordFall.js` scale Elite Breach boss billboard sprites, flyer hover heights, and death fall animations without altering horizontal combat collision radii.

- **Presence Multipliers:** `egPresenceOf(key)` selects a visual multiplier from `EG_LORD_PRESENCE` (`champion: 1.4` for Kyn ranks, `valkynaz: 1.8` when `EG_LORDS[key].valk` is set, and `lord: 1.6` otherwise). Combined with band growth, champions draw at roughly `3.5x` base enemy size, Court lords at `4-8x`, and Valkynaz at `5.4-7.2x`. Champions and Valkynaz use the legion Daedra Lord sprite (mobile `31`).
- **Billboard Rules and Collision:** Lords and enemies render strictly as base-anchored billboard sprites that cast no shadows (OW-BIG), with no 3D boss meshes. Presence scaling affects only the drawn sprite and vertical hit height; `EG_LORDS` body scale, relay `bodyR`, and client hit floor radii remain untouched.
- **Flyer Hover and Scaled Fall:** Flying bosses hover at `EG_LORD_HOVER_M` (`6` m at base body size) multiplied by presence so oversized sprites clear player heads. On death, `egLordFallAct(since, anims, drawn, winged)` and `egFallAloft` ease flyers down to impact while `EG_FALL_PER(drawn)` scales sink depth (`egFallSinkM`), fall height (`egFallTallM`), and corpse size (`egCorpseScale`).
