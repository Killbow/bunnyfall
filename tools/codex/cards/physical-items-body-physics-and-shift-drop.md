---
slug: physical-items-body-physics-and-shift-drop
title: "Physical Items Fixed-Step Body, Corpse Scatter, and Shift-Drop Spiral"
domain: items
kind: subcard
parent: physical-items-overview
files:
  - src/items/physicalItems.js
  - src/items/physicalItemsLayer.js
  - src/characters/corpseMarker.js
  - src/items/itemTransfer.js
  - src/ui/enhancedInventory.js
  - src/world/gateSpew.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Physical-Items.md"
  - "01-Overview/audits/Audit-PI1.md"
related:
  - physical-items-overview
  - loot-ii-junk-quick-loot-and-ayleid-stones
invariants:
  - "PI_BODY replaces Unity Rigidbody/PhysX: gravity 9.81, dt 0.02, drag 0.9, bounce 0.35 above 2 m/s, grip (0.45+0.6)/2 sliding and (0.55+0.6)/2 static, settle within 0.1 m and under 0.05 m/s for 0.5 s, forced rest after 8 s."
  - "PI_SEPARATION shoulder: within 0.15 m of ground, slower than 0.65 across / 0.5 vertical, ease 1.5 m/s^2 toward 0.45 m/s, pad 0.04, query growth 0.08."
  - "PI_SCATTER disc 0.45-0.85 m out, 0.65 m up; PI_LAUNCH reach 0.85 fresh vs nudge 0.08, vertical 0.7-1.1, scaled by Impulse Strength (default 2 = 200%, clamp 0-400%)."
  - "PI_SPIRAL: center 1.1 m ahead, ring 0.78*sqrt(i) at golden angle, 256 tries, lift 0.025; footprint max(0.2, 0.6*height) plus 0.1 overlap; floor probe 2 up / 5 down, normal y >= 0.5; path lift 0.2, skin 0.05."
traps:
  - "Transportation items refuse shift-drop with DFU cannotRemoveItem text (shiftDropRefusal)."
  - "With wagon/storage open, shift-click stows instead of dropping (planStore); indoor and dungeon hosts pass `physicalDropOn: () => false` so shift-drops do not enter street pools."
dfu: []
tags:
  - physical-items
  - physics
  - shift-drop
---

# Physical Items Fixed-Step Body, Corpse Scatter, and Shift-Drop Spiral

`src/items/physicalItems.js` and `src/items/physicalItemsLayer.js` run fixed-step trajectories, corpse scatter, and shift-drop placement.

## Fixed-Step Body and Separation

`stepBody` integrates `PI_BODY` at `dt = 0.02` s (`gravity = 9.81`, `drag = 0.9`, `bounce = 0.35` above `2` m/s, sliding grip `(0.45 + 0.6) / 2`, static grip `(0.55 + 0.6) / 2`), pausing while the game is paused, with `constrainMove` (`PI_CONSTRAIN`) keeping bodies off walls. Items settle within `0.1` m of the ground under `0.05` m/s for `0.5` s, or force rest at `flightMaxS = 8` s (`src/world/gateSpew.js` uses separate spew flights). Within `0.15` m of the floor (`< 0.65` m/s across, `< 0.5` m/s vertical), `PI_SEPARATION` eases overlapping items apart at `1.5` m/s^2 toward `0.45` m/s (`pad = 0.04`, query growth `0.08`).

## Corpse Scatter and Shift-Drop Spiral

Kills stamp `markDeath` (`src/characters/corpseMarker.js`). Within `PI_FRESH_MS = 4000`, `diedRecently` triggers full `PI_LAUNCH` (`reach = 0.85`, vertical `0.7` to `1.1`, scaled by Impulse Strength at default `2` or `200%`, clamped `0%` to `400%`) from `PI_SCATTER` (`0.45` to `0.85` m radius, `0.65` m up); later reloads use the `0.08` nudge.

In `src/items/itemTransfer.js` and `src/ui/enhancedInventory.js`, shift-clicking with wagon or storage open runs `planStore`, and transportation items trigger `shiftDropRefusal`. Otherwise, `PI_SPIRAL` searches 256 golden-angle points around a center `1.1` m ahead (`0.78 * sqrt(i)`, footprint `max(0.2, 0.6 * height) + 0.1`, floor probe `2` m up and `5` m down with normal `y >= 0.5`, path lift `0.2`, skin `0.05`, and final lift `0.025`).
