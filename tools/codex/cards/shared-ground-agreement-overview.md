---
slug: shared-ground-agreement-overview
title: "Shared Ground Agreement and Oblivion Gate Clearings"
domain: world
kind: overview
parent: null
files:
  - src/scenes/world.js
  - src/characters/exteriorFoes.js
  - src/combat/playerWeapon.js
  - src/net/wire.js
  - src/world/pixelBuild.js
  - src/world/gateClearance.js
  - src/world/roadClearance.js
  - src/systems/eliteGates/egArch.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-24b.md"
related:
  - shared-ground-spawn-roll-agree
  - roads-verge-clearance-and-tree-fit
invariants:
  - "Pose heights carry the sender's ground; the receiver sheds only the floating origin."
  - "Enemy puppets stand at `_net.toScene(p.wire)` (puppetStep), never on the receiver's ground."
  - "Any per-client belief that changes pixel ground height desyncs peers; ground must derive from shared deterministic inputs only."
  - "Only the road test (`wodSiteClear`) decides a World of Daggerfall pick."
  - "Clearing is asked after picking (`wodHeld`); a held site stands no objects but keeps its pick so the ground stays levelled."
  - "A held pixel is marked `gateRefused`; the gate clear sweep rebuilds it when the clearing goes."
traps:
  - "An enemy sunk more than about eye height is out of melee reach (`WEAPON_REACH` = `DEFAULT_WEAPON_REACH` + `SPHERE_CAST_RADIUS`)."
  - "`GROUND_LAW` gates builds in ground rooms; bump it (and the relay version) when ground shaping changes."
  - "Refusing a pick at pick time removes its levelling and lets another levelling instance take the pixel."
dfu: []
tags:
  - ground
  - multiplayer
  - desync
  - terrain
  - gate
  - clearing
  - wod
  - arches
---

# Shared Ground Agreement and Oblivion Gate Clearings

Multiplayer exterior terrain height must derive strictly from shared deterministic inputs so peers never desynchronize over ground elevation (`src/scenes/world.js`, `src/world/pixelBuild.js`, `src/net/wire.js`).

- **Wire Pose Elevation and Ground Law (`src/scenes/world.js`, `src/characters/exteriorFoes.js`, `src/combat/playerWeapon.js`, `src/net/wire.js`):** Networked poses carry the ground height of the sender while the receiver subtracts only the floating origin. Enemy puppets step at `_net.toScene(p.wire)` inside `puppetStep` rather than snapping to local receiver terrain. If a height mismatch sinks an enemy past roughly eye height, melee swings miss because `WEAPON_REACH` equals `DEFAULT_WEAPON_REACH` (`2.25`) plus `SPHERE_CAST_RADIUS` (`0.25`). `GROUND_LAW` (`1` in `src/net/wire.js`) gates client builds in ground rooms and must increment alongside the relay version whenever terrain shaping changes.
- **World of Daggerfall Picks and Gate Clearings (`src/world/pixelBuild.js`, `src/world/gateClearance.js`, `src/world/roadClearance.js`, `src/systems/eliteGates/egArch.js`):** Only the road test (`wodSiteClear`) decides a World of Daggerfall site pick; refusing at pick time would drop its leveling and let another instance claim the pixel. Gate clearing runs after picking via `wodHeld`: a held site places no objects and marks the pixel `gateRefused`, preserving the leveled ground until the gate clear sweep rebuilds the tile. Elite gate arches obey `EG_ARCH_PEER_M` (`40`), `EG_ARCH_PER_CELL` (`2`), and `EG_ARCH_GATE_NEAR_M` (`300`), accepting remote arches only after hub signature verification in `egArch` (`heard`).
