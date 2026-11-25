---
slug: breach-portents-captive-and-tithe-imp
title: "The Captive Ward and the Tithe-Imp"
domain: multiplayer
kind: subcard
parent: breach-portents-overview
files:
  - src/net/gateBrain.js
  - src/net/gateLaw.js
  - src/net/gateMods.js
  - src/worldEvents/gateCaptive.js
  - src/worldEvents/gateSpoils.js
  - src/world/gateBoss.js
  - server/src/index.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Breach-Portents.md"
related:
  - breach-portents-overview
  - breach-boss-brain-and-courts
  - breach-receipts-spoils-and-embers
invariants:
  - "Under the Captive portent, jailers guard a Covenant knight (`CAPTIVE_NAMES` and `CAPTIVE_DAMES`) inside a `CAPTIVE_RING_R` (`7` m) ring, and defeating the last jailer frees the prisoner (`cpf`)."
  - "The freed knight holds a ward (`captiveWard`, `cpw`) that absorbs the next Dagon's Reckoning detonation; breaking all crystals preserves the ward for a later Reckoning, and the knight departs `CAPTIVE_GONE_MS` (`1500` ms) after spending it."
  - "The Tithe-Imp rolls secretly via `gateTitheOf(day)` on one night in `TITHE_ONE_IN` (`5`), spawning after `TITHE_AFTER_MS` plus up to `TITHE_SPREAD_MS` during phase one or two when a challenger is present."
  - "The imp flees `TITHE_FLEE_M` (`8` m) ahead of attackers with `TITHE_S` (`10`) seconds of mean reference damage in health, diving back into the lava after `TITHE_LIFE_MS` (`22` s) or on a phase turn."
traps:
  - "Slaying the Tithe-Imp sends each striker a relay seed via `tithe` (recorded by `_gateFanKept` on `ahit`); `titheList(seed, level)` grants `TITHE_GOLD_PER_LEVEL` (`60`) times level (+/-20%) gold plus one gem independently of receipt spoils."
  - "Captive jailers share the Ward-Bearer scaling and pulse constants (`BEARER_TEAM_S` and `BEARER_PULSE_FIRST_MS`)."
dfu: []
tags:
  - portents
  - captive
  - tithe-imp
  - rewards
---

The Captive portent and the unannounced Tithe-Imp add secondary objectives and direct combat rewards inside the court (`src/net/gateBrain.js`, `src/worldEvents/gateCaptive.js`, and `src/worldEvents/gateSpoils.js`).

## The Captive Knight and Reckoning Ward

On Captive nights (`f.cp`), jailers hold a Covenant knight (`CAPTIVE_NAMES` and `CAPTIVE_DAMES`) inside a `CAPTIVE_RING_R` (`7`-meter) ring, reusing the Ward-Bearer health and pulse rules (`BEARER_TEAM_S` and `BEARER_PULSE_FIRST_MS`). Slaying the final jailer broadcasts `cpf` and frees the knight, who raises a protective ward (`captiveWard`).

If challengers fail to break every Reckoning crystal before the window plus `RECKON_CLOSE_MS` (`500` ms) closes, the ward absorbs the blast (`cpw`) and the knight leaves `CAPTIVE_GONE_MS` (`1500` ms) later. Shattering all crystals stuns the boss and preserves the ward for the next Reckoning.

## The Unannounced Tithe-Imp

Separately from announced portents, `gateTitheOf(day)` (`src/net/gateLaw.js` and `src/net/gateMods.js`) schedules a Tithe-Imp (`TITHE_SCALE` = `1.3` in `src/world/gateBoss.js`) on one night in `TITHE_ONE_IN` (`5`). It spawns at `TITHE_AFTER_MS` plus up to `TITHE_SPREAD_MS` during phase one or two when a challenger is present.

The imp has `TITHE_S` (`10`) seconds of mean challenger `dpsRef` health, flees `TITHE_FLEE_M` (`8` meters) ahead, and dives away after `TITHE_LIFE_MS` (`22` seconds) or on a phase turn. When slain, `_gateFanKept` (`server/src/index.js`) sends a `tithe` seed to each striker recorded via `ahit`, and `titheList(seed, level)` awards `TITHE_GOLD_PER_LEVEL` (`60`) times level (`+/-20%`) gold plus one gem outside receipt spoils.
