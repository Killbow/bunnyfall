---
slug: martial-swing-pace-and-frame-floor
title: "Swing Pace Modifiers, Handling, and the Frame Floor"
domain: combat
kind: subcard
parent: martial-specializations-overview
files:
  - src/characters/weaponStates.js
  - src/combat/swingLaw.js
  - src/combat/weaponRig.js
  - src/characters/weaponMastery.js
  - src/characters/martialPowers.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Martial-Specialisations.md"
related:
  - martial-specializations-overview
  - martial-weapon-scaling-past-100
  - martial-passives-signatures-and-riders
  - weapon-technique-runner-and-refusals
invariants:
  - "`registerSwingPaceMod(name, fn)` registers a named `fn(ctx, w) -> percent` modifier. Passing a non-function removes the name."
  - "`swingPacePct` sums only finite positive results and ignores modifiers that throw. The sum is capped at `SWING_PACE_MOST` (50)."
  - "A paced frame takes `max(SWING_FRAME_MIN, t / (1 + pct/100))`, with `SWING_FRAME_MIN = 0.09` s per frame (0.45 s for a 5-frame swing) and `SWING_FRAME_MAX = 0.4`."
  - "Pacing applies only when `ctx.entity` is set, i.e. to a wielder the port knows."
traps:
  - "`readSwing` and `swingFamily` (swingLaw.js) provide the weapon reader, registered by `installSwingLaw`. weaponStates.js stays a leaf module and does not import the equip table."
  - "`swingHandling` multiplies by `SWING_HANDLING[weaponType]`. Short blades use `SWING_SHORT_BLADE` (`SWING_HANDLING[4]`), and two-handed weapons add `SWING_TWO_HANDED` (1.06)."
  - "Pace contributors are Short Blade past 100 (weaponMastery.js) and the martial paths' War Rhythm, Frenzy and Cyclone windows (`martialPace`). The cap applies to their combined total."
  - "The classic weapon machine steps at most once per frame and drops the leftover time. Carrying it lets the machine outrun the weapon widget's clone, which then misses the bow's hit frame. Only a machine with `m.tick` keeps its remainder."
dfu: []
tags:
  - swing-pace
  - weapon-states
  - frame-floor
---

# Swing Pace Modifiers, Handling, and the Frame Floor

`src/characters/weaponStates.js` and `src/combat/swingLaw.js` calculate melee frame durations from Speed, weapon handling multipliers, and registered swing-pace modifiers, enforcing a strict per-frame floor.

## Tempo, Handling, and Pace Registration

- **Base tempo and weapon handling:** `swingTempo` interpolates across Speed from `SWING_TEMPO_AT_0` (`1.4`) to `SWING_TEMPO_AT_100` (`0.6`). `swingHandling` multiplies by `SWING_HANDLING[weaponType]`, using `SWING_SHORT_BLADE` (`SWING_HANDLING[4]`) for short blades and applying `SWING_TWO_HANDED` (`1.06`) to two-handed weapons. `installSwingLaw` (`src/combat/swingLaw.js`) injects `readSwing` and `swingFamily` so `src/characters/weaponStates.js` stays a leaf module without importing the equip table.
- **Pace modifiers and cap (`registerSwingPaceMod`, `swingPacePct`):** `registerSwingPaceMod(name, fn)` installs a named `fn(ctx, w) -> percent` callback (or removes it when passed a non-function). `swingPacePct` runs only when `ctx.entity` is present, summing finite positive modifier outputs, ignoring callbacks that throw, and capping the combined total at `SWING_PACE_MOST` (`50`). Short Blade skill past `100` (`src/characters/weaponMastery.js`) and the martial War Rhythm, Frenzy, and Cyclone windows (`martialPace` in `src/characters/martialPowers.js`) share this `50%` ceiling.
- **Frame clamping (`getMeleeWeaponAnimTime`):** Base frame time is clamped to `[SWING_FRAME_MIN, SWING_FRAME_MAX]` (`0.09` s to `0.4` s), and paced frames evaluate `max(SWING_FRAME_MIN, t / (1 + pct / 100))`, establishing a `0.45` s floor across a five-frame swing.
