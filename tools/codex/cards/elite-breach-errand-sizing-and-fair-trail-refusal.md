---
slug: elite-breach-errand-sizing-and-fair-trail-refusal
title: "Elite Breach Wake-Company Errand Sizing, Fair Trail Refusal, and Boss TTK Peers"
domain: multiplayer
kind: subcard
parent: elite-breach-lord-shares-overview
files:
  - src/net/eliteGates/egBrain.js
  - src/net/eliteGates/egFair.js
  - src/net/eliteGates/egLink.js
  - src/net/sdRemnant.js
  - src/net/gateBrain.js
  - src/net/serpentBrain.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-19e.md"
related:
  - elite-breach-lord-shares-overview
  - elite-breach-fair-still-and-door-word
  - brass-remnant-fight-and-rewards
invariants:
  - "Hall errands and legion counts read `ctx.n` from `lordCtx` (the living company count at hall wake) and scale required bodies to `min(k, n)`."
  - "After a player second Fair Trail violation, `egFairRefuses` (`src/net/eliteGates/egFair.js`, checked in `egBlow`) drops that player hits for `EG_FAIR_REPEAT_MS = 5000` ms (`A.refuse`)."
  - "Across world events, reference TTKs are `EG_TTK_S = 180` (`egLords.js`), `BOSS_TTK_S = 240` with `ABSENT_RETIRE_MS = 30_000` (`gateBrain.js`), `SD_TTK_S = 420` (`sdRemnant.js` `stepRemnant`), and `SERPENT_TTK_S = 150` (`serpentBrain.js`)."
traps:
  - "During an `egFairRefuses` window, local hit visuals still play on the client while the relay discards damage."
  - "Ordering `ehp` ahead of `efs` when a member falls before wake can make sleeping lords flinch."
dfu: []
tags:
  - elite-breach
  - fair-trail
  - errands
  - boss-scaling
---

# Elite Breach Wake-Company Errand Sizing, Fair Trail Refusal, and Boss TTK Peers

Wake-company errand sizing, repeat Fair Trail hit refusals, and peer world-event TTK budgets span `src/net/eliteGates/egBrain.js`, `src/net/eliteGates/egFair.js`, `src/net/eliteGates/egLink.js`, `src/net/sdRemnant.js`, `src/net/gateBrain.js`, and `src/net/serpentBrain.js`.

- **Wake-company errand and legion sizing:** In `src/net/eliteGates/egBrain.js`, hall errands and legion counts read `ctx.n` from `lordCtx`, capturing the living company count on the arrival plate at hall wake and clamping required body counts to `min(k, n)`. Active errands keep their wake-time `ctx.n` even if members fall later in the fight, and `standFight` emits `efs` ahead of `ehp` (`src/net/eliteGates/egLink.js`) so pre-wake deaths never make sleeping lords flinch.
- **Repeat Fair Trail blow refusal:** After a player commits a second Fair Trail violation, `egFairRefuses` in `src/net/eliteGates/egFair.js` sets `A.refuse` for `EG_FAIR_REPEAT_MS = 5000` ms. While `egFairRefuses` holds, `egBlow` in `src/net/eliteGates/egBrain.js` discards all incoming hits from that striker even though local hit animations still render on the client.
- **Peer boss TTK references:** Peer world events scale boss health against `EG_TTK_S = 180` (`egLords.js`), `BOSS_TTK_S = 240` with `ABSENT_RETIRE_MS = 30_000` (`src/net/gateBrain.js`), `SD_TTK_S = 420` (`stepRemnant` in `src/net/sdRemnant.js`), and `SERPENT_TTK_S = 150` (`src/net/serpentBrain.js`).
