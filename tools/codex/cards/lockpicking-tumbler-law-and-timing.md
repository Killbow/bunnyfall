---
slug: lockpicking-tumbler-law-and-timing
title: "Tumbler Law: Pins, Spools, Binding Order, Windows, and Snap Odds"
domain: systems
kind: subcard
parent: lockpicking-overview
files:
  - src/systems/lockpick/lockpickLaw.js
  - src/systems/lockpick/lockpickAct.js
  - src/net/professionLaw.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Lockpicking.md"
related:
  - lockpicking-overview
  - lockpick-window-hosts-and-controls
invariants:
  - "`pinsFor(lock) = clamp(2 + floor(lock / 4), 2, 6)` (`LOCK_PINS_MIN`, `LOCK_PINS_MAX`, and `LOCK_PINS_STEP`)."
  - "`spoolsFor` assigns `1` spool from `SPOOL_ONE = 8` and `2` from `SPOOL_TWO = 14`; `spoolPins` never marks the first binding pin."
  - "`lockSeed` is a 32-bit FNV-1a hash of the lock key, and `bindingOrder` is a `mulberry32` Fisher-Yates shuffle that stays identical across visits and clients."
  - "`setWindowS(chance, band) = (0.08 + 0.52 * (chance - 5) / 90) * band`."
  - "`slipBreakChance = clamp((100 - chance) / 100 * 0.55, 0.04, 0.6)`; a forced free pin snaps at `0.35` times that rate."
  - "The act reads no clock or dice of its own: `rng` and `dt` are injected, and `tick` caps `dt` at `0.25` s."
traps:
  - "`riseJitter` (`0.45`) must keep outspanning the hang window plus both graces, or blind rhythm opens locks again."
  - "A surviving slip drops only the last set pin and clears unset spool false-set flags, whereas a snap drops all pins (`dropAll`)."
  - "`auto()` never increments `broken`."
dfu:
  - DaggerfallActionDoor.cs
tags:
  - lockpicking
  - tumblers
  - spool-pins
  - fnv1a
  - timing
---

# Tumbler Law: Pins, Spools, Binding Order, Windows, and Snap Odds

`src/systems/lockpick/lockpickLaw.js` and `src/systems/lockpick/lockpickAct.js` expand `AttemptLockpicking` (`DaggerfallActionDoor.cs`) into a deterministic tumbler machine.

## Pin Layout and Binding Order

`pinsFor(lock)` returns `clamp(2 + floor(lock / 4), 2, 6)` (`LOCK_PINS_MIN = 2`, `LOCK_PINS_MAX = 6`, `LOCK_PINS_STEP = 4`). `spoolsFor` adds `1` spool at `SPOOL_ONE` (`8`) and `2` at `SPOOL_TWO` (`14`). `lockSeed` hashes the lock key with 32-bit FNV-1a to seed a `mulberry32` Fisher-Yates shuffle for `bindingOrder`, while `spoolPins` never marks the first binding pin. At Lockpicking `>= 50` (`senseSkill`), `sensesBinding` highlights the active binding pin.

## Phases, Windows, and Snap Odds

`createLockpickAct` takes injected `rng` and `dt` (`tick` caps `dt` at `0.25` s). Pins move across `rest`, `rise`, `hang`, `fall`, `spring`, and `set` with a `falseSet` flag:

- **Timing (`LOCKPICK_ACT`):** Mean `riseS` is `0.2` s (`riseJitter = 0.45`), `fallS = 0.32` s, `springS = 0.22` s, and `graceS = 0.03` s. `setWindowS(chance, band)` scales from `windowMinS` (`0.08` s) to `windowMaxS` (`0.6` s), where `lockBand` applies `actBand` (`src/net/professionLaw.js`, `0.85` to `1.30` times by Agility).
- **Press and snap odds:** `press()` returns `lift`, `springy`, `set`, `false-set`, `open`, `already`, `slip`, or `break`. The first timed press on a spool returns `false-set` and drops to `rest` with `falseSet` marked. Mistimed presses roll `slipBreakChance` (`breakScale = 0.55`, `breakMin = 0.04`, `breakMax = 0.6`), and forced free pins roll `freeRisk` (`0.35`) times that rate. Surviving slips drop only the last set pin; snaps and failed `auto()` rolls (`autoOpens`: exterior `1..100`, interior `0..99`) run `dropAll`.
