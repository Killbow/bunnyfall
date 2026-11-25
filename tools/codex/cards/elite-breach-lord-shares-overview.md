---
slug: elite-breach-lord-shares-overview
title: "Elite Breach Lord Shares: Arrival-Plate Sizing and Kept Fallen Shares"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/eliteGates/egLords.js
  - src/net/eliteGates/egBrain.js
  - src/net/eliteGates/egLaw.js
  - src/net/eliteGates/egLink.js
  - src/ui/eliteGates/egSpireHud.js
  - src/net/wire.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-19e.md"
related:
  - elite-breach-errand-sizing-and-fair-trail-refusal
  - elite-breach-spire-overview
  - breach-boss-brain-and-courts
  - elite-breach-clock-and-hall-rhythm
invariants:
  - "Lord max health scales by `EG_TTK_S = 180` s of `ttkRef(c)` per active share (`src/net/eliteGates/egLords.js`), sized at hall wake (`standFight`, within `EG_ARRIVE_MAX_MS = 30_000` ms) with `efs` sent before `ehp`."
  - "`egLordsStand` retires shares for members absent from the arrival plate `here` while never retiring the last remaining share."
  - "`egLordsShare(F, sub, lv, admits)` restores a late arrival at the lord current health fraction so arrivals never heal the boss, and skips retiring shares once `L.up2` is set so a woken lord never loses health when a teammate dies."
traps:
  - "Because `ehp` carries no max-health field in `foldFight`, shrinking a woken lord max health would misread as a damage blow; never retire shares after wake."
dfu: []
tags:
  - elite-breach
  - lords
  - scaling
  - relay
---

# Elite Breach Lord Shares: Arrival-Plate Sizing and Kept Fallen Shares

Elite Breach lord share sizing, arrival-plate pruning, and post-wake share retention coordinate across `src/net/eliteGates/egLords.js`, `src/net/eliteGates/egBrain.js`, `src/net/eliteGates/egLaw.js`, `src/net/eliteGates/egLink.js`, `src/ui/eliteGates/egSpireHud.js`, and `src/net/wire.js`.

- **Wake sizing and frame order:** In `src/net/eliteGates/egLords.js`, lord maximum health scales by `EG_TTK_S = 180` s of `ttkRef(c)` per active share. Sizing occurs at hall wake (`standFight` in `src/net/eliteGates/egBrain.js`, bounded by `EG_ARRIVE_MAX_MS = 30_000` ms), emitting `efs` before `ehp` so sleeping lords never flinch when a member falls prior to wake. Any share change resets `F.stateAt` so the full fight state resends on the next beat.
- **Arrival-plate pruning (`egLordsStand`):** At wake, `egLordsStand` retires shares for roster members absent from the arrival plate `here`, while always preserving at least one share.
- **Late arrivals and kept fallen shares (`egLordsShare`):** Calling `egLordsShare(F, sub, lv, admits)` restores a late arrival at the lord current health fraction so joining mid-fight never heals the boss. Once `L.up2` is set, `egLordsShare` refuses to retire shares when a teammate dies because `ehp` carries no max-health field in `foldFight` (`src/net/eliteGates/egLink.js`).
