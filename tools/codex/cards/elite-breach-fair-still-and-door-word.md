---
slug: elite-breach-fair-still-and-door-word
title: "Fair Trail Standing-Still Gap (egStillGap) and the efair Door Word"
domain: multiplayer
kind: subcard
parent: elite-breach-orrery-fair-still-and-landed-overview
files:
  - src/net/eliteGates/egFair.js
  - src/net/eliteGates/egBrain.js
  - src/net/eliteGates/egLaw.js
  - src/net/wire.js
  - src/systems/eliteGates/egClient.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-20f.md"
related:
  - elite-breach-orrery-fair-still-and-landed-overview
  - elite-breach-lords-seam-and-vestiges
  - elite-breach-broken-way-and-trial-await
invariants:
  - "A pose gap longer than EG_BLIND_MS = 400 counts as blind unless egStillGap holds: there is a hold, the support is the same (A.sup[0] === L[0]), and the end pose is within EG_FAIR_SNAP_M = 2.5 m of the last pose."
  - "A traversal whose blind share exceeds EG_FAIR_BLIND_MAX = 0.3 is refused at the door (fairOf)."
  - "doorWord sends {k:'efair', w} once per hall, only to the refused member. w is the break reason (speed, air or void, from EG_FAIR_WORDS) when A.brk > 0, otherwise 'blind'."
  - "A trail break clears when the member stands again on the last valid island."
traps:
  - "A gap that starts mid-air or at a jump peak has no held support, so it stays blind."
  - "The door reach stays at EG_DOOR_REACH_M = 3, so a player on the plate's rim must step inward. The owner kept this to protect race timing."
  - "Waiting at the door adds seen time, so the blind share can fall below 0.3 and the door then opens."
  - "EG_FAIR_WIRE_WORDS in wire.js must stay pinned to EG_FAIR_WORDS. validEgRun drops any other w."
dfu: []
tags:
  - elite-breach
  - anti-cheat
  - fair-trail
  - door
  - efair
  - FAIR-STILL
  - DOOR-WORD
---

# Fair Trail Standing-Still Gap (egStillGap) and the efair Door Word

Fair-trail standing-still tolerance and door refusal messaging live in `src/net/eliteGates/egFair.js`, `src/net/eliteGates/egBrain.js`, `src/net/eliteGates/egLaw.js`, `src/net/wire.js`, and `src/systems/eliteGates/egClient.js`.

- **Standing-Still Gaps (`FAIR-STILL`):** The fair trail judges pose samples against `HEARTBEAT_MS`. In `src/net/eliteGates/egFair.js`, `egFairPose` counts any gap with `dt > EG_BLIND_MS` (`400` ms) as blind time when `egStillGap(...)` is false. `egStillGap(...)` exempts a gap only when a hold exists, the support is unchanged (`A.sup[0] === L[0]`), and the end pose stays within `EG_FAIR_SNAP_M` (`2.5` m) of the last pose. A gap starting mid-air or at a jump peak has no held support and stays blind.
- **Blind Share and Breaks:** At the exit door (`EG_DOOR_REACH_M = 3`, so a player on the plate rim must step inward), `fairOf` refuses entry if the blind share exceeds `EG_FAIR_BLIND_MAX` (`0.3`) or `A.brk > 0`. Waiting at the door adds seen time so the blind share can drop below `0.3`, while a break clears when the member stands again on the last valid island. The `"No footing"` message and loop layout are unchanged.
- **Door Word (`DOOR-WORD`):** On refusal, `doorWord` in `src/net/eliteGates/egBrain.js` sends `{k: 'efair', w}` once per hall to the refused member, where `w` is the break reason from `EG_FAIR_WORDS` (`'speed'`, `'air'`, or `'void'`) when `A.brk > 0`, or `'blind'` otherwise. `EG_FAIR_WIRE_WORDS` in `src/net/wire.js` stays pinned to `EG_FAIR_WORDS` (`validEgRun` drops any other `w`). `src/systems/eliteGates/egClient.js` shows `EG_FAIR_TEXT[w]` (`eg.fair.blind`, `eg.fair.speed`, `eg.fair.air`, and `eg.fair.void`) center-screen and in chat.
