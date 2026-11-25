---
slug: elite-breach-landed-word-damage-numbers
title: "Landed Damage Word (eland): Relay-Resolved Hit Numbers on Breach Stand-ins"
domain: combat
kind: subcard
parent: elite-breach-orrery-fair-still-and-landed-overview
files:
  - src/net/eliteGates/egBrain.js
  - src/net/eliteGates/egLords.js
  - src/net/eliteGates/egBodies.js
  - src/net/gateBrain.js
  - src/net/wire.js
  - src/net/online.js
  - src/systems/eliteGates/egFight.js
  - src/systems/eliteGates/egClient.js
  - src/ui/hitNumbers.js
  - src/player/playerDoor.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-20f.md"
related:
  - elite-breach-orrery-fair-still-and-landed-overview
  - elite-breach-lords-seam-and-vestiges
  - breach-boss-brain-and-courts
invariants:
  - "egBlow sends {k:'eland', i, d} only to the striker, with d = max(0, round(landed)). wire.js validates i as 1..1e9 and d as 0..EG_HP_MAX."
  - "egLordHit reports only the health actually removed. While an errand holds hpFloor, damage past the floor is cut off (got -= hpFloor - hp)."
  - "Landed damage is bounded by the member purse: HIT_CAP_X = 12 times the reference per blow, BUCKET_DEPTH_X = 15 times the reference deep, refilled at BUCKET_RATE_X = 3 times the reference per second (gateBrain.js), plus lord weight and hpFloor."
  - "Stand-ins marked landsByWord suppress claim numbers: hitNumbers.js numberFor returns null, and the number appears when fight.landed(i, d) runs on eland."
  - "Owed follow-ups (`oweFoe`; Many Endings echo, Open Hand second hit) ride the parent blow's claim. showFollowUp draws nothing on a landsByWord target."
traps:
  - "The client gates on relaySupportsEgLand(v), meaning a version number >= EG_LAND_RELAY_MIN = 237. Against older relays the legacy claim numbers stay. Never compare against a hardcoded RELAY_VERSION literal."
  - "Do not simulate the server purse on the client. The owner chose relay-reported landed damage."
  - "Multi-target spells draw from one bucket, so rendering raw claims would overstate damage (the original 31k-vs-millions report)."
dfu: []
tags:
  - elite-breach
  - damage-numbers
  - eland
  - purse
  - boss
  - LANDED-WORD
---

# Landed Damage Word (eland): Relay-Resolved Hit Numbers on Breach Stand-ins

Relay-resolved damage numbers (`LANDED-WORD`) replace raw client claim popups on Elite Breach stand-ins across `src/net/eliteGates/egBrain.js`, `src/net/eliteGates/egLords.js`, `src/net/eliteGates/egBodies.js`, `src/net/gateBrain.js`, `src/net/wire.js`, `src/net/online.js`, `src/systems/eliteGates/egFight.js`, `src/systems/eliteGates/egClient.js`, `src/ui/hitNumbers.js`, and `src/player/playerDoor.js`.

- **Purse Clamping and Floor Clipping:** Server blows draw from the member purse in `src/net/gateBrain.js` (`HIT_CAP_X = 12` times the reference per blow and `BUCKET_DEPTH_X = 15` times the reference deep, refilling at `BUCKET_RATE_X = 3` times the reference per second) and scale by lord weight and `egTtkRef` pacing (`egLordHitX` in `src/net/eliteGates/egBodies.js` and `src/systems/eliteGates/egFight.js`). Because multi-target spells share one bucket, raw client claims heavily overstate damage. In `src/net/eliteGates/egLords.js`, `egLordHit` reports only health actually removed, clipping damage at an active errand `hpFloor` (`got -= hpFloor - hp`).
- **Relay Frame (`eland`):** After resolving a strike, `egBlow` in `src/net/eliteGates/egBrain.js` sends `{k: 'eland', i, d}` solely to the striker with `d = max(0, round(landed))`. `src/net/wire.js` validates `i` in `1..1e9` and `d` in `0..EG_HP_MAX`.
- **Client Display and Version Gate:** When `egLandOk` and `relaySupportsEgLand(v)` hold (`v >= EG_LAND_RELAY_MIN = 237`, never compared against a hardcoded `RELAY_VERSION` literal; older relays keep legacy claim popups, and relays should deploy before or with client pages), `src/systems/eliteGates/egFight.js` marks breach stand-ins with `e.landsByWord = landWord`. For `landsByWord` targets, `numberFor` in `src/ui/hitNumbers.js` returns `null` on initial swing, `showFollowUp` suppresses owed follow-up numbers (`oweFoe` for Many Endings echo and Open Hand second hit, which ride the parent claim), and `fight.landed(i, d)` renders the confirmed popup upon receiving `eland`.
