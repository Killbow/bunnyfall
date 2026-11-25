---
slug: elite-breach-orrery-fair-still-and-landed-overview
title: "Elite Breach Orrery Stones, Fair-Still Door Word, and Landed Damage Word"
domain: multiplayer
kind: overview
parent: null
files:
  - src/systems/eliteGates/egOrrery.js
  - src/world/sdHall.js
  - src/worldEvents/sdHall.js
  - src/net/sdBrain.js
  - src/net/eliteGates/egLaw.js
  - src/net/eliteGates/egBrain.js
  - src/net/eliteGates/egLegion.js
  - src/systems/eliteGates/egFight.js
  - src/net/wire.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-20f.md"
related:
  - elite-breach-fair-still-and-door-word
  - elite-breach-landed-word-damage-numbers
  - elite-breach-spire-overview
  - elite-breach-lords-seam-and-vestiges
  - elite-breach-spire-client-rules-and-telegraphs
invariants:
  - "The six Athenaeum stones stand at radius 1100 cm on bearings 30/90/150/210/270/330 (egLaw.js polar spot 'stone'), each facing the court center."
  - "Each stone is the Hour's own model (sdHall.js buildStoneModel, bezel, hand, crown gear), moved by translation only through egStoneShift. There is no rotation, because the bearings match SD_STONE_BEARINGS."
  - "The levers are the activation handles (handleBox via egStoneHandleBox). Facing the stone, the right lever turns it forward one hour and the left lever turns it back one hour."
  - "Hands animate the short way (sdHandWay) at SD_HAND_RATE = 3 hours/s."
  - "Encounter pressure is unchanged: an unsolved lock spawns ceil(n/4) Harriers every EG_LOCK_EVERY_MS = 15000, up to egLegionCapOf."
traps:
  - "Do not remove the gold floor discs (drawGround). The owner kept them for errand identity."
  - "Stones are solid (egStoneSolidTris). Moving a stone without moving its collider desyncs the levers from the hitboxes."
dfu: []
tags:
  - elite-breach
  - spire
  - athenaeum
  - orrery
---

# Elite Breach Orrery Stones, Fair-Still Door Word, and Landed Damage Word

This overview covers Athenaeum Orrery stone models, standing-still fair-trail gaps with `efair` door feedback, and relay-resolved `eland` hit numbers (`src/systems/eliteGates/egOrrery.js`, `src/world/sdHall.js`, `src/worldEvents/sdHall.js`, `src/net/sdBrain.js`, `src/net/eliteGates/egLaw.js`, `src/net/eliteGates/egBrain.js`, `src/net/eliteGates/egLegion.js`, `src/systems/eliteGates/egFight.js`, and `src/net/wire.js`).

- **Athenaeum Orrery Stones (`ORRERY-STONES`):** Replaces the flat discs and invisible side handles with the full Shattered Hour stone assembly (`buildStoneModel` in `src/world/sdHall.js`, including bezel, hand, and crown gear up to `EG_STONE_TOP_M = SD_CROWN_GEAR.y + SD_CROWN_GEAR.tip`), while retaining the gold floor discs (`drawGround`) for errand identity. Six stones stand at radius `1100` cm on bearings `30`, `90`, `150`, `210`, `270`, and `330` (`polar` spot `'stone'` in `src/net/eliteGates/egLaw.js`), facing the court center. Because those bearings match `SD_STONE_BEARINGS`, `egStoneShift` positions each model and its solid collider (`egStoneSolidTris`) by translation alone. Facing a stone, its lever hitboxes (`handleBox` via `egStoneHandleBox`) turn the hand one hour forward on the right lever or one hour back on the left lever, animating along the shortest arc (`sdHandWay`) at `SD_HAND_RATE = 3` hours/s.
- **Encounter Pressure and Depth Scaling:** An unsolved lock spawns `ceil(n/4)` Harriers every `EG_LOCK_EVERY_MS = 15000` up to `egLegionCapOf`, where `egLegionCap(n, c) = min(14, 2 + ceil(1.5n) + floor((c - 1) / 5))` (giving a solo player `4` at circle `1` and `7` at circle `16`, capped by `EG_STANDING_MAX = 16`). Late-circle depth scaling works as designed.
- **Subcards:** `elite-breach-fair-still-and-door-word` (`FAIR-STILL` and `DOOR-WORD`) and `elite-breach-landed-word-damage-numbers` (`LANDED-WORD`).
