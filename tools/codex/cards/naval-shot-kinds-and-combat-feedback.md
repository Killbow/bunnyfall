---
slug: naval-shot-kinds-and-combat-feedback
title: "Cannon Shot Kinds, Reloads, and Combat Feedback"
domain: world
kind: subcard
parent: naval-refit-overview
files:
  - src/systems/naval/shotKinds.js
  - src/systems/naval/navalGunnery.js
  - src/systems/naval/navalLoads.js
  - src/systems/naval/navalFeel.js
  - src/systems/naval/navalEffects.js
  - src/systems/naval/navalHost.js
replacesBible:
  - "03-World/Naval-Refit.md"
related:
  - naval-refit-overview
  - naval-ramming-and-grapple-boarding
  - captain-tree-and-ore-refits
  - audio-midi-and-soundscape
invariants:
  - "`SHOT_ORDER` orders ammunition as `'round'`, `'grape'`, `'chain'`, and `'heated'`; `SHOT_CODES` maps each kind to its wire index, and `shotId` normalizes unknown identifiers to `'round'`."
  - "`shotGun` returns the original gun definition when the loaded shot matches `naturalShot` (`'chain'` for chase guns and `'round'` otherwise) or when the weapon is a barrel."
  - "Switching ammunition on a loaded battery incurs a `SHOT_SWITCH` (`0.5`) reload fraction penalty."
  - "Heated shot applies a `0.45` base hull-hit fire chance, and captain bonuses clamp the final probability at `FIRE_MOST` (`0.9`)."
traps:
  - "Grapeshot deals full crew damage only up to `GRAPE_FULL_S` (`1.2` seconds) of flight and decays to half strength by `GRAPE_SPENT_S` (`2.6` seconds), so long-range grape fire is weak by design."
tags:
  - naval
  - cannons
  - ammunition
  - feedback
  - effects
---

Naval gunnery supports four selectable cannon ammunition types across independent battery groups, paired with directional hit feedback, deck spray, and magazine explosions.

## Ammunition Profiles and Battery Reloads

`src/systems/naval/shotKinds.js` defines `SHOT_ORDER` (`'round'`, `'grape'`, `'chain'`, and `'heated'`), wire indices in `SHOT_CODES`, and fallback normalization in `shotId`. Each entry in `SHOT` modifies baseline gun performance:
- **Round shot:** baseline hull damage (`1.0x`) and reload duration (`1.0x`).
- **Grapeshot:** `4.0x` crew damage and `0.2x` hull damage, holding full lethality until `GRAPE_FULL_S` (`1.2` seconds) of flight before dropping to `0.5x` by `GRAPE_SPENT_S` (`2.6` seconds).
- **Chain shot:** `4.0x` sail damage with a `1.15x` reload multiplier.
- **Heated shot:** `0.85x` hull damage, a `1.6x` reload multiplier, `rigFire: true`, and a `0.45` base hull-fire chance capped at `FIRE_MOST` (`0.9`).

`src/systems/naval/navalLoads.js` tracks active loads per battery across `LOAD_GROUPS` (`broadside`, `bow`, and `stern`). `shotGun` returns the unmodified gun entry whenever the load matches `naturalShot` (`'chain'` for chase guns and `'round'` for broadsides) or when firing a barrel. Changing ammunition on a ready battery costs `SHOT_SWITCH` (`0.5`) of its reload timer. `reloadSeconds(gunKind, crewShare, crewed, shot)`, `aimSolution`, and `volleyLaunches` in `src/systems/naval/navalGunnery.js` compute reload times, ballistic lead, and projectile spawns.

## Impact Feedback and Visual Effects

`src/systems/naval/navalFeel.js` resolves directional hull impacts via `blowSide`, triggers near-miss water plumes within `NEAR_SPLASH_M` (`6` meters), drenches the deck within `DRENCH_FEET_M` (`2` meters), and rolls catastrophic magazine detonations at `MAGAZINE_CHANCE` (`0.55`). Incoming shot whistles and sinking particle emitters (`effects.founder` in `src/systems/naval/navalEffects.js`) layer with `navalShots.js` and `navalSounds.js`.
