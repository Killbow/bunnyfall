---
slug: parkour-enhanced-climbing-overview
title: "Enhanced Climbing (Parkour) Overview"
domain: world
kind: overview
parent: null
files:
  - src/player/parkour.js
  - src/player/motor.js
  - src/scenes/shared.js
  - src/mods/features.js
  - src/mods/rrInstall.js
  - src/mods/rrRealism.js
  - src/platform/pageQuery.js
routes: []
tables: []
replacesBible:
  - "03-World/Parkour-Arc.md"
related:
  - parkour-ledge-sensing-mantle-vault-and-geometry
  - parkour-hang-grip-free-climb-and-leaps
  - parkour-climb-feel-hands-and-peer-sync
  - weapon-technique-runner-and-refusals
  - elite-breach-spire-client-rules-and-telegraphs
invariants:
  - "`parkourSwitchOn(search)` returns false whenever `pageParam('parkour') === 'off'`, then requires (online page OR enhanced skin) AND the `enhancedClimbing` pref, which `onlineForcedPref` forces on online."
  - "Features row `enhanced-climbing` has `initial: true, online: true`, and the classic skin keeps DFU's classic climb offline."
  - "No new keys: Jump catches/mantles/vaults, Forward climbs, strafe shimmies, Crouch drops or lowers."
  - "All pure geometry and skill laws live in src/player/parkour.js. The PlayerMotor in src/player/motor.js owns state and input."
  - "Every move except the vault asks `parkourRefusal()`, the Roleplay & Realism gate registered via `registerParkourGate` when `climbingRestriction` is on (\"You can't climb whilst holding your weapon.\")."
traps:
  - "Do not read the skin offline for online play: online the row alone decides, so every peer shares the same traversal."
  - "`parkourDeps` is the single construction seam for all four host motors. Do not build ad-hoc deps per scene."
dfu:
  - Assets/Scripts/Game/Player/ClimbingMotor.cs
tags:
  - parkour
  - climbing
  - traversal
  - features
  - kill-switch
---

# Enhanced Climbing (Parkour) Overview

Enhanced Climbing replaces Daggerfall Unity's vertical wall climb (`ClimbingMotor.cs`) with ledge catches, mantles, vaults, hanging shimmies, free climbing, running leaps, and wall runs while keeping classic keys (`Jump` catches, mantles, and vaults; `Forward` climbs; strafe shimmies; `Crouch` drops or lowers). Pure geometry and skill rules live in `src/player/parkour.js`, while `PlayerMotor` (`src/player/motor.js`) owns runtime state and input.

## Feature Switch, Parity, and Host Wiring

- **Activation and kill switch (`parkourSwitchOn`):** In `src/scenes/shared.js`, `parkourSwitchOn(search)` returns `false` whenever `pageParam('parkour') === 'off'` (`src/platform/pageQuery.js`). Otherwise it requires an online page or the enhanced skin, plus the `enhancedClimbing` preference (`enhanced-climbing` in `src/mods/features.js`, `initial: true, online: true`). Online play forces the preference on via `onlineForcedPref` so every peer shares the same traversal; offline classic skin keeps classic climbing.
- **Single construction seam (`parkourDeps`):** All four host motors wire dependencies through `parkourDeps` in `src/scenes/shared.js`. It supplies `enabled`, `leap` (true unless the made level's `runLeap` rule is `'refused'`), live `inputs` (`parkourSkill` from Climbing plus Khajiit bonus, doubled under the Climbing effect and clamped to `0..100`, `jumpingSkill`, fatigue fraction, and load fraction), and `tally` for Climbing skill training.
- **Refusals:** Moves refuse while swimming, levitating, mounted, or already climbing/holding. Every move except `'vault'` also checks `parkourRefusal()`, registered by `src/mods/rrInstall.js` via `registerParkourGate` when `climbingRestriction` (`src/mods/rrRealism.js`) is on (`"You can't climb whilst holding your weapon."`).
