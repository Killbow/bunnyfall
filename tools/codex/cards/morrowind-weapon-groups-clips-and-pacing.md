---
slug: "morrowind-weapon-groups-clips-and-pacing"
title: "Weapon Types, Animation Groups, Clip Loops, and Blow Pacing"
domain: "combat"
kind: "subcard"
parent: "morrowind-first-person-rig-overview"
files:
  - "src/formats/mwFirstPerson.js"
  - "src/formats/mwAnim.js"
  - "src/combat/fpArm.js"
  - "src/combat/fpsSpellCasting.js"
  - "src/magic/castSpeed.js"
  - "src/items/lootPowers.js"
routes: []
tables: []
replacesBible:
  - "02-Formats/Morrowind-Rules.md"
related:
  - "morrowind-first-person-rig-overview"
  - "morrowind-attachment-aim-and-declared-divergences"
  - "weapon-widget-overview"
  - "spell-hand-wire-pose-and-torch-stow"
invariants:
  - "MW_WEAPON_TYPE has 18 enumerators (PickProbe -4 through Bolt 13), which map to 11 distinct short groups: 1s, 1h, 1b, 2c, 2b, 2w, bow, crossbow, 1t, hh, spell."
  - "composeStanceGroup mirrors OpenMW fallbackShortWeaponGroup: a real two-handed melee weapon falls back to 2c, any other real weapon to 1h."
  - "Attack keys are namespaced by the LONG group (WEAPON_LONG_GROUP, e.g. weapononehand, bowandarrow)."
  - "First-person idle loops 1 + rollDice(4), ported as FP_IDLE_LOOPS = 1 + floor(random*4), so the idle plays 2 to 5 times."
  - "A change that arrives while the rig is `busy` (the worn table, the weapon, the off-hand weapon, the torch, the hip light, a form change, or a whole build) is queued before any key compare and applied by `flushPending` when `busy` clears, from every path that holds `busy`."
  - "`movementAnimState` counts a move as strafing only when the side component is more than twice the forward one, and returns turn states only in third person while not sneaking."
  - "`MOVEMENT_FALLBACK_SPEED` (sneak 33.5452, run 222.857, walk 154.064 units per second) applies when a clip has no accum-root velocity, as first-person clips have none."
traps:
  - "MW-PACE1: blowRate clamps melee section rates to BLOW_RATE_MIN 0.1 .. BLOW_RATE_MAX 12. blowPace returns null for shots, held wind-ups and empty schedules."
  - "MS1: REVERSED_STRIKES = ['StrikeRight'] plays the slash backwards through poseTime (startTime + stopTime - time) without mirroring the arm."
  - "Per-bone-group BlendMask priority is deferred; fpArm resolves priority for the whole body."
  - "`parseAnimGroups` is the viewer's group listing and deliberately differs from `resetClip` (line split, ': ' test, stop-key compare, key order); playback must use `resetClip`."
dfu:
  - "Assets/Scripts/Game/FPSSpellCasting.cs"
  - "Assets/Scripts/Game/MagicAndEffects/EntityEffectManager.cs"
tags:
  - "weapon-groups"
  - "text-keys"
  - "pacing"
  - "spellcast"
---

# Weapon Types, Animation Groups, Clip Loops, and Blow Pacing

Morrowind weapon types map onto short stance prefixes and long animation group namespaces, while clip looping and section pacing fit melee swings and spell releases to combat timing (`src/formats/mwFirstPerson.js`, `src/formats/mwAnim.js`, `src/combat/fpArm.js`, `src/combat/fpsSpellCasting.js`, `src/magic/castSpeed.js`, and `src/items/lootPowers.js`).

- **Weapon groups and clip loops (`mwFirstPerson.js`, `mwAnim.js`, `fpArm.js`):** `MW_WEAPON_TYPE` defines 18 enumerators (`PickProbe` `-4` through `Bolt` `13`) across 11 short groups (`1s`, `1h`, `1b`, `2c`, `2b`, `2w`, `bow`, `crossbow`, `1t`, `hh`, and `spell`). `composeStanceGroup` falls back to `2c` for two-handed melee weapons and `1h` for any other real weapon, while attack text keys use `WEAPON_LONG_GROUP` names (such as `weapononehand` and `bowandarrow`). `resetClip` and `advanceClip` enforce start, stop, and loop keys; first-person idles repeat `FP_IDLE_LOOPS = 1 + floor(random * 4)` (2 to 5 plays), and `fpArm.js` resolves animation priority across the whole body.
- **Blow, strike, and cast pacing (`mwFirstPerson.js`, `fpsSpellCasting.js`, `castSpeed.js`, `lootPowers.js`):** `blowRate` clamps section playback to `BLOW_RATE_MIN = 0.1` through `BLOW_RATE_MAX = 12` (`blowPace` returns `null` for shots, held wind-ups, and empty schedules), while `REVERSED_STRIKES = ['StrikeRight']` reverses `poseTime` (`startTime + stopTime - time`) without mirroring geometry. Spellcasting fits `<type> release` to frame 5 (`CAST_FRAME_PERIOD = 0.04` s, or `0.2` s at rate 1, with `HELD_RELEASE_MAX_S = 1.5`), scaled by `CAST_SPEED_CAP = 30` and clamped to `0.5..2` by `validCastRate`.
