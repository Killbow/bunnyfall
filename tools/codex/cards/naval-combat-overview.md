---
slug: naval-combat-overview
title: "Naval Combat: Sea Host, Hulls, and Ship Classes"
domain: world
kind: overview
parent: null
files:
  - src/systems/naval/navalHost.js
  - src/systems/naval/seasWorld.js
  - src/systems/naval/navalShips.js
  - src/systems/naval/comeSailAwayPool.js
  - src/systems/naval/comeSailAwayHulls.js
  - src/scenes/world.js
  - src/mods/features.js
  - src/render/navalRender.js
  - src/ui/navalHud.js
routes: []
tables: []
replacesBible:
  - "03-World/Naval-Combat.md"
related:
  - naval-and-come-sail-away
  - naval-refit-overview
  - naval-ballistics-damage-and-striking
  - naval-traffic-captain-ai-and-online-sea
  - naval-living-crew-companions-and-repairs
  - naval-plunder-prize-deeds-and-raid-gate
invariants:
  - "`createNavalHost` is built only by `createSeasWorld` (`src/systems/naval/seasWorld.js`), which the exterior streaming world (`src/scenes/world.js`) constructs."
  - "`navalOn` is true when `csaOn()` holds and pref `naval` is not `false`; the pref is declared `online: true` in `src/mods/features.js`."
  - "Naval hostility applies only while `aboardShip`; ashore or swimming, ships do not target the player."
  - "`saveRefused` returns true during a boarding or while standing on a sea ship's deck."
traps:
  - "Sea ships come from `spawnSeaNow` in `comeSailAwayPool.js` on the five Come Sail Away hulls; do not author a separate hull pipeline."
  - "`SHIP_CLASSES` has 17 rows (base, legend, and fishing); index-based code must not assume 9."
  - "A ship class goes on the wire as its row in `SHIP_CLASSES`, and older builds know only the first `NAVAL_WIRE_OLD_CLASSES` (15, in `navalWire.js`) rows, so new classes are appended at the end."
dfu: []
tags:
  - naval
  - combat
  - ships
  - come-sail-away
  - sea
---

# Naval Combat: Sea Host, Hulls, and Ship Classes

The naval combat subsystem builds on the Come Sail Away hulls to run open-sea battles, AI traffic, living crews, boarding, and prize plunder inside the exterior streaming world.

- **Host Lifecycle and Activation (`src/systems/naval/seasWorld.js`, `src/systems/naval/navalHost.js`, `src/scenes/world.js`, `src/mods/features.js`):** `createSeasWorld` constructs `createNavalHost` for `src/scenes/world.js`. `navalOn` is active when `csaOn()` holds and the `naval` feature preference (`online: true`) is not `false`. Naval hostility engages only while `aboardShip` is true; enemies ignore players who are ashore or swimming. `saveRefused` blocks saving during boarding actions or while standing on a sea ship deck.
- **Hulls and Broadside Weights (`src/systems/naval/comeSailAwayHulls.js`, `src/systems/naval/comeSailAwayPool.js`, `src/systems/naval/navalShips.js`):** Sea ships spawn through `spawnSeaNow` across the five `HULL` tiers: Rowboat (`0`), LargeBoat (`1`), SmallShip (`2`), LargeGalley (`3`), and Carrack (`4`), with `HULL_PRICES` of `4000`, `8000`, `100000`, `200000`, and `150000`. `playerBatteryWeight` (`MOD_BUILDS` `{1, 2, 4}`) and `shipBatteryWeight` scale broadsides by `6/5` on Small Ship and `7/5` on Carrack.
- **Classes, Ordinance, and Crowns (`src/systems/naval/navalShips.js`, `src/render/navalRender.js`, `src/ui/navalHud.js`):** `SHIP_CLASSES` defines 17 rows: rows `0-8` cover pirate, merchant, and navy base classes, rows `9-14` cover legend pirates, and rows `15-16` cover Fishing Skiff and Fishing Smack. `GUNS` supports `long`, `swivel`, `heavy`, `chain`, and `barrel` ordinance, and `CROWNS` maps Daggerfall (Gothryd), Wayrest (Eadwyre), and Sentinel (Akorithi).
