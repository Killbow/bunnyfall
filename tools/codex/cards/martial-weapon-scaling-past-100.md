---
slug: martial-weapon-scaling-past-100
title: "Weapon Skill Climb Past 100 and Relay Health Share"
domain: combat
kind: subcard
parent: martial-specializations-overview
files:
  - src/characters/weaponMastery.js
  - src/characters/skillSoftcap.js
  - src/characters/powerCeiling.js
  - src/characters/entityMods.js
  - src/combat/healthShare.js
  - src/world/gateBoss.js
  - src/combat/arrowFlight.js
  - src/platform/onlineLane.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Martial-Specialisations.md"
related:
  - martial-specializations-overview
  - martial-swing-pace-and-frame-floor
  - arcane-school-potency-past-100
  - boss-traits-overview
  - sea-serpent-world-boss
invariants:
  - "`weaponClimb` returns 0 offline, for non-players or peers, while mentoring, or in beast form. Otherwise it returns `climbedSkill - SKILL_SOFT_CAP`, which ranges from 0 to 40."
  - "`WEAPON_POTENCY_PER_POINT = SCHOOL_POTENCY_PER_POINT` (1%). Long Blade and Archery (including Thunderlock shots) gain +1% per point on every blow."
  - "With `WEAPON_HALF_PER_POINT` (2%): Axe gains it against an enemy below `WEAPON_HALF_LINE` (0.5) health, and Blunt Weapon gains it against an enemy at or above that line. Hand-to-Hand gets nothing extra."
  - "`weaponMasteryBlow` skips player targets, `target.warded` (the Warden ward), and `sigilDueling()`. It routes the percentage through `blowRoom(..., 'mastery')` and carries fractional damage per weapon."
traps:
  - "`healthShare` returns null for `relayHealth` stand-ins (from `bossStandIn` in gateBoss.js) that have no usable `relayShare` reader. When the share is null, Axe and Blunt fall back to the 1% mean instead of their half-health bonus."
  - "Estimate calls (`info.estimate`, used by the Stats page) do not change the carried fraction."
  - "`shaftOnRelayBody` (arrowFlight.js) notifies technique riders when an arrow hits relay bodies such as the sea serpent hide."
dfu: []
tags:
  - softcap
  - past-100
  - online-only
  - health-share
  - relay-health
---

# Weapon Skill Climb Past 100 and Relay Health Share

`src/characters/weaponMastery.js` scales weapon performance above `SKILL_SOFT_CAP` (`100`) up to effective skill `140` during online play, registering `WEAPON_MASTERY` with both `registerWeaponBlowMod` and `registerSwingPaceMod`.

## Climb Rules and Per-Weapon Scaling

- **Online climb gate (`weaponClimb`):** Returns `0` offline, for non-player or peer entities, while mentoring, or in beast form. Otherwise it returns `climbedSkill - SKILL_SOFT_CAP` (`0` to `40`).
- **Flat and half-health potency (`weaponPastPct`):** `WEAPON_POTENCY_PER_POINT` equals `SCHOOL_POTENCY_PER_POINT` (`1%`), giving Long Blade and Archery (including Thunderlock shots) `+1%` damage per point above `100` (`x1.4` at `140`). `WEAPON_HALF_PER_POINT` (`2%`) gives Axe `+2%` per point against an enemy below `WEAPON_HALF_LINE` (`0.5`) health and gives Blunt Weapon `+2%` per point against an enemy at or above `0.5` health (`x1.8` at `140` on their active half). Short Blade gains `+1%` swing pace per point (`x1.4` at `140`), while Hand-to-Hand receives no extra post-100 modifier.
- **Blow routing and relay fallback:** `weaponMasteryBlow` skips player targets, `target.warded` (Warden ward), and `sigilDueling()`, routing the percentage through `blowRoom(..., 'mastery')` and carrying fractional damage per weapon without mutating the carry during `info.estimate` calls. When `healthShare` (`src/combat/healthShare.js`) returns `null` on a `relayHealth` stand-in (`bossStandIn` in `src/world/gateBoss.js`) without a usable `relayShare` reader, Axe and Blunt fall back to the `1%` mean. `shaftOnRelayBody` (`src/combat/arrowFlight.js`) notifies technique riders when arrows strike relay bodies such as the sea serpent hide.
