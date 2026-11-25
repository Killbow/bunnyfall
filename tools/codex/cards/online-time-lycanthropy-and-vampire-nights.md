---
slug: online-time-lycanthropy-and-vampire-nights
title: "Full Moon Nights and Vampire Sun Online"
domain: systems
kind: subcard
parent: online-time-arc-overview
files:
  - src/afflictions/lycanthropy.js
  - src/world/gameDate.js
  - src/afflictions/vampirism.js
  - src/world/worldTick.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Online-Time-Arc.md"
related:
  - online-time-arc-overview
  - balance-arc-lycanthropy-and-vampirism
invariants:
  - "Online (`moonNight`), the forced werewolf transformation uses `isFullMoonNightFromMinutes(skyMinutes)`, active from 18:00 dusk on a full-moon date until 06:00 dawn."
  - "Offline play retains classic Daggerfall behavior via `isFullMoonFromMinutes`, covering the entire 24-hour calendar day of either moon's full phase."
  - "Equipping the Hircine Ring blocks the forced transformation, and an entity already transformed is not forced again."
  - "Moon phase and sunlight checks read `skyMinutes`, while the lycanthrope kill timer and vampire blood thirst read the character clock (`ownMinutes`)."
traps:
  - "Resting online advances only `ownMinutes`, so resting cannot skip ahead to dusk or wait out a full-moon night."
  - "`nightDateMinutes` assigns each night to the calendar date of its 18:00 dusk, so minutes between 00:00 and 06:00 belong to the previous date's night."
dfu:
  - LycanthropyEffect.ForceTransformDuringFullMoon
  - EntityEffectBroker
tags:
  - lycanthropy
  - werewolf
  - vampire
  - full-moon
  - sky
---

Online curse checks in `src/world/worldTick.js` split environmental day-and-night rules from personal biological timers by passing both `skyMinutes` and `ownMinutes` into `src/afflictions/lycanthropy.js` and `src/afflictions/vampirism.js`.

## Full-Moon Nights and Forced Lycanthropy

Offline play follows classic `LycanthropyEffect.ForceTransformDuringFullMoon`, using `isFullMoonFromMinutes` (`src/world/gameDate.js`) to force beast form across the entire 24-hour calendar day when Masser or Secunda is full. Online (`moonNight`), `src/afflictions/lycanthropy.js` switches to `isFullMoonNightFromMinutes(skyMinutes)`, restricting forced transformation to the 12 sky hours from 18:00 dusk until 06:00 dawn.

`nightDateMinutes` (`src/world/gameDate.js`) labels an overnight span by the calendar date of its 18:00 dusk, keeping hours between midnight and 06:00 attached to the dusk date. At TimeScale 24, a 12-hour full-moon night lasts 30 real minutes. Because resting online advances only `ownMinutes`, players cannot rest to reach dusk or skip a full-moon lock. The Hircine Ring prevents forced transformation, and once dawn arrives at 06:00 the lock lifts so the player can revert at will.

## Vampire Sunlight and Character Timers

`vampirismMagicRound` (`src/afflictions/vampirism.js`) receives `skyMinutes` to evaluate day-and-night sunlight exposure for `vampireStatMod`, while reading `nowMinutes` from `ownMinutes()` to track feeding and blood thirst. Similarly, the lycanthrope innocent-kill timer ticks on the character clock rather than the shared sky.
