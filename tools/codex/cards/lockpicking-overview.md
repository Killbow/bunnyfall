---
slug: lockpicking-overview
title: "Lockpicking: Lockpick Item, Tumbler Minigame, and Auto-Pick Default"
domain: systems
kind: overview
parent: null
files:
  - src/systems/lockpick/lockpickHost.js
  - src/systems/lockpick/lockpickLaw.js
  - src/systems/lockpick/lockpickAct.js
  - src/systems/lockpick/lockpickItem.js
  - src/ui/lockpickDoor.js
  - src/mods/features.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Lockpicking.md"
related:
  - lockpicking-tumbler-law-and-timing
  - lockpick-item-stock-and-loot
  - lockpick-window-hosts-and-controls
  - world-modes-and-transitions
  - four-hosts-and-modal-frame
invariants:
  - "Picking any lock in Steal mode (front door, dungeon door, chest, or crate) requires `lockpickCount(player.items) >= 1`; otherwise `LOCKPICK_HOST_WORDS.need` is shown and nothing is rolled, tallied, or spent."
  - "Feature `lockpick-minigame` (pref `lockpickMinigame`, initial `false`, online `'player'`) gates the window: off means one DFU roll via `autoOpens`, one Lockpicking tally per press, and a failure costs nothing."
  - "DFU chance formulas stay the backbone: `interiorLockpickingChance` and `exteriorLockpickingChance` in `src/world/actionSystem.js`, clamped `5..95`."
  - "The DFU retry gate (`failedSkillLevel`) is bypassed whenever a host owns `onLockpickAttempt`."
traps:
  - "Do not assume the minigame is on: it is opt-in by default."
  - "Leaving the window costs nothing and tallies nothing."
dfu:
  - DaggerfallActionDoor.cs
  - PlayerActivate.cs
  - FormulaHelper.cs
tags:
  - lockpicking
  - steal-mode
  - minigame
  - dfu-departure
---

# Lockpicking: Lockpick Item, Tumbler Minigame, and Auto-Pick Default

Steal-mode lockpicking (`src/systems/lockpick/lockpickHost.js`, `src/systems/lockpick/lockpickLaw.js`, `src/systems/lockpick/lockpickAct.js`, and `src/systems/lockpick/lockpickItem.js`) replaces free DFU door attempts (`AttemptLockpicking` in `DaggerfallActionDoor.cs` and `ActivateStaticDoor` in `PlayerActivate.cs`) with an item-gated flow and an opt-in tumbler overlay (`src/ui/lockpickDoor.js`).

## Item Requirement and DFU Backbone

Unlike DFU, attempting any front door, dungeon door, chest, or crate lock in Steal mode requires at least one lockpick (`LOCKPICK_TEMPLATE = 584`, verified by `lockpickCount(player.items) >= 1`). With zero picks, the host shows `LOCKPICK_HOST_WORDS.need` without rolling, tallying skill, or consuming items.

Base chances preserve `CalculateInteriorLockpickingChance` and `CalculateExteriorLockpickingChance` from `FormulaHelper.cs` via `src/world/actionSystem.js`:

- `interiorLockpickingChance`: `5 * (level - lock) + Lockpicking`, clamped `5..95`.
- `exteriorLockpickingChance`: `Lockpicking - 5 * lock`, clamped `5..95`.

When a host owns `onLockpickAttempt`, the `failedSkillLevel` retry lock is bypassed for immediate retries, while dungeon doors at or above `MAGIC_LOCK_THRESHOLD` (`20`) fall through to the magical lock failure path.

## Auto-Pick Default and Opt-In Minigame

The `lockpick-minigame` feature (`src/mods/features.js`, preference `lockpickMinigame`, initial `false`, online policy `'player'`) is opt-in by default:

- **Minigame off (default):** Each press calls `tallySkill` once and runs `autoOpens(chance, roll, exterior)`, either opening the lock or reporting `LOCKPICK_HOST_WORDS.failed` without consuming a pick.
- **Minigame on:** `createLockpickAct` drives `createLockpickOverlay`, where pin snaps consume one pick and tally once, opening tallies once, and leaving costs nothing.
