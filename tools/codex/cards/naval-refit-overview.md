---
slug: naval-refit-overview
title: "Naval Refit: Island Trade, Peace Way, Hold Access, and the Sea Clock"
domain: world
kind: overview
parent: null
files:
  - src/systems/naval/tradeGoods.js
  - src/systems/naval/peaceWay.js
  - src/systems/naval/comeSailAway.js
  - src/systems/naval/holdDoor.js
  - src/systems/naval/raidAshore.js
  - src/systems/naval/warmAshesShips.js
  - src/systems/naval/seaClock.js
  - src/travel/travelThreat.js
  - src/systems/naval/navalHost.js
  - src/scenes/world.js
replacesBible:
  - "03-World/Naval-Refit.md"
related:
  - naval-and-come-sail-away
  - naval-ramming-and-grapple-boarding
  - naval-shot-kinds-and-combat-feedback
  - captain-tree-and-ore-refits
  - ship-livery-flags-and-plaques
  - four-hosts-and-modal-frame
invariants:
  - "`peaceShare(k)` clamps the out-of-combat speed multiplier to `[1, PEACE_WAY]` (`1.15`), returning `1` for non-finite inputs."
  - "`peaceWayOf` returns `1` whenever enemies are near, boarding is active, or a broadside is aimed, and `src/scenes/world.js` caches the result for `PEACE_HOLD_S` (`0.1` seconds)."
  - "Only the player boat receives `PEACE_WAY`; `navalAI` captains keep their unmodified speeds."
  - "`raidRefusal()` returns `'busy'` while a ship voyage, boarding action, or raid is active so `onPreFastTravel` never starts a second overlapping raid."
  - "`seaSeconds(dt, scale, shared)` divides by `scale` on a shared sea (`sharedSea`, when a peer is within range) so multiplayer sea combat runs in real time."
  - "`foeRate` caps the fast-travel journey rate at `1x` while enemies are present, and `HOSTILE_NEAR_M = 700` (`src/systems/naval/navalHost.js`) counts a hostile ship within 700 meters as a nearby enemy."
traps:
  - "Applying `PEACE_WAY` to `navalAI` ships breaks combat speed tuning; only the player helm uses the multiplier."
  - "Stepping naval AI with `dt * worldTimeScale()` on a shared sea lets one client fast-forward enemies against a peer."
  - "Rowboats (`HULL_HOLDS[0] === false`) open a hold only when cargo or a laid-up hold already exists, and a boat's own parts placed inside its hold return to the player pack when the window closes."
dfu:
  - Assets/Scripts/Game/TransportManager.cs
tags:
  - naval
  - trade
  - peace-way
  - cargo-hold
  - time-dilation
  - raids
---

The Naval Refit arc expands open-water sailing (`naval-and-come-sail-away`) with island trade routes, out-of-combat cruising speed, direct hold access, raid withdrawal rules, and multiplayer-safe sea clock stepping.

## Island Trade and Hold Access

`portTrade` (`src/systems/naval/tradeGoods.js`) assigns each port a local trade good, while `isleGood(port)` gives every Eltheric island freeport an Iliac Bay commodity. On deck, `createHoldDoor` (`src/systems/naval/holdDoor.js`) binds the `ShipHold` action to a two-way cargo hold via `cargoLootTarget`. Rowboats (`HULL_HOLDS[0] === false`) open a hold only when cargo or a stored hold exists, and ship parts placed inside a vessel's own hold return to the player pack when closed.

## Peace Way, Sea Clock, and Raid Gates

During clear sailing, `peaceWayOf` and `peaceShare(k)` (`src/systems/naval/peaceWay.js`) grant the player helm up to a `PEACE_WAY` (`1.15x`) speed multiplier, cached in `src/scenes/world.js` for `PEACE_HOLD_S` (`0.1` seconds). The multiplier drops to `1` when enemies are within `HOSTILE_NEAR_M = 700` (`src/systems/naval/navalHost.js`), boarding runs, or a broadside is aimed.

`seaSeconds(dt, scale, shared)` (`src/systems/naval/seaClock.js`) divides by `scale` whenever `sharedSea` detects a nearby peer so shared waters advance in real time. During fast travel, `foeRate` (`src/travel/travelThreat.js`) caps time acceleration at `1x` while enemies remain active, `raidRefusal()` (`src/systems/naval/warmAshesShips.js`) blocks overlapping raids, and `createRaidAshore` (`src/systems/naval/raidAshore.js`) withdraws raid enemies via `questFoesOf` before `endQuest` runs with two grace ticks.

## Subcards

- `naval-ramming-and-grapple-boarding`: ramming damage, recoil floors, and grapple boarding.
- `naval-shot-kinds-and-combat-feedback`: ammunition types, reloads, and impact effects.
- `captain-tree-and-ore-refits`: captain star progression and ore refit tiers.
- `ship-livery-flags-and-plaques`: hull liveries, deck props, flags, and plaques.
