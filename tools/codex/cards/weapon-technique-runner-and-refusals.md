---
slug: weapon-technique-runner-and-refusals
title: "Technique Runner, Refusals, and Flight"
domain: combat
kind: subcard
parent: weapon-techniques-overview
files:
  - src/combat/techniques.js
  - src/player/motor.js
  - src/player/groundRay.js
  - src/combat/weaponRig.js
  - src/combat/hostCombat.js
  - src/characters/statMods.js
  - src/net/arenaLaw.js
  - src/characters/madeLevel.js
  - src/scenes/world.js
  - src/scenes/exterior.js
  - src/scenes/worldModes.js
  - src/scenes/dungeonContext.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Weapon-Techniques.md"
related:
  - weapon-techniques-overview
  - four-hosts-and-modal-frame
  - integrity-pvp-duel-and-wild-referees
invariants:
  - "Refusal order begins: beast claws (`BEAST_TEXT`), no line or Gauntlets with a weapon drawn, ladder off (`LADDER_OFF_TEXT`), duel (`DUEL_TEXT`), then fatigue."
  - "Fatigue refuses when `entity.fatigue <= techniqueFatigue(tech) + SWING_FATIGUE_COST`; `techniqueFatigue` is sheet points times `FATIGUE_MULTIPLIER` (`64`), with no drain scale."
  - "`SWING_FATIGUE_COST` is `trunc(11 * 0.75) = 8` entity units."
  - "`TECHNIQUE_MAX_SPEED` is `12` m/s (under arena `ARENA_SPEED_MAX` at `12.5`); `launchTo` raises the arc until horizontal speed fits."
  - "Landing may be at most `TECH_DROP_MAX` (`4` m) below or `TECH_RISE_MAX` (`2.5` m) above the player's feet."
  - "Leaps and dashes launch only while grounded, except roster entries marked `airborne` (Flying Kick)."
  - "A change in `restoresSoFar()` marks a load, and the runner then clears the aim, the act in flight, every cooldown, and the technique camera and hand offsets (`resetTechniqueFx`)."
traps:
  - "`ctx.blocked` (an open UI window) clears the aim and returns early from `stepTechnique`, pausing cooldown ticks for that frame."
  - "`flightApex` lowers the arc apex under low ceilings or returns `null` (`NO_ROOM_TEXT`)."
  - "Motor `techFlight` must clear on ground contact, wall grab, and clamber exits, or Slowfall glide misbehaves."
  - "The made-level rule `techFlight: 'refused'` blocks flights on Spire traversal ground."
  - "The collider's `raycast` never meets outdoor terrain, which is a height sampler and not a mesh. A ray that must reach the ground uses `groundHit` or `rayHit`."
dfu: []
tags:
  - techniques
  - motor
  - fatigue
  - refusals
---

`stepTechnique` in `src/combat/techniques.js` runs the active weapon technique each frame across exterior, dungeon, and world hosts (`src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/worldModes.js`, and `src/scenes/dungeonContext.js`). When `ctx.blocked` is set by an open modal window, `stepTechnique` clears any active aim and returns early before advancing cooldown timers.

## Refusal Order and Fatigue Gate

Pressing the technique key evaluates gates in fixed order: beast form (`BEAST_TEXT`), missing technique line or relying on Gauntlets while a weapon is drawn, loot rarity disabled without a martial path signature (`LADDER_OFF_TEXT`), active duel (`DUEL_TEXT`), and fatigue. The fatigue gate refuses when `entity.fatigue <= techniqueFatigue(tech) + SWING_FATIGUE_COST`, where `techniqueFatigue` multiplies sheet fatigue points by `FATIGUE_MULTIPLIER` (`64`, ignoring fatigue-drain modifiers in `src/characters/statMods.js`) and `SWING_FATIGUE_COST` is `8` (`Math.trunc(11 * 0.75)`).

## Aiming, Flight Physics, and Motor Handoff

Ground raycasts via `rayHit` (`src/player/groundRay.js`) validate leap and dash targets within `TECH_DROP_MAX` (`4` m below the feet) and `TECH_RISE_MAX` (`2.5` m above). Shadowstep checks behind the target enemy first, then each flank, and finally in front. Leaps and dashes require a grounded player unless the technique is marked `airborne` (Flying Kick), and respect `techFlight: 'refused'` in `src/characters/madeLevel.js`.

`flightApex` lowers the trajectory under ceilings or refuses with `NO_ROOM_TEXT`. `launchTo` hands flight control to `techniqueLaunch` in `src/player/motor.js` while keeping horizontal speed at or below `TECHNIQUE_MAX_SPEED` (`12` m/s, below `ARENA_SPEED_MAX = 12.5` in `src/net/arenaLaw.js`). `offsetTechniques` shifts stored coordinates on world-origin recentering.
