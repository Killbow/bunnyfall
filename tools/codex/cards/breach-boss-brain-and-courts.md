---
slug: breach-boss-brain-and-courts
title: "Breach Boss Brain, Phases, and Reckoning"
domain: multiplayer
kind: subcard
parent: dagons-breach-world-boss
files:
  - src/net/gateBrain.js
  - src/net/gateStrike.js
  - src/net/wire.js
  - src/world/gateBoss.js
  - src/world/gateArena.js
  - src/worldEvents/gateCourt.js
  - src/worldEvents/standInSpell.js
  - src/render/gateTelegraph.js
  - src/render/courtCrystals.js
  - src/ui/gateBossBar.js
  - src/ui/gateDamageChart.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/World-Bosses.md#brain"
  - "11-Multiplayer/World-Bosses.md#attacks"
  - "11-Multiplayer/World-Bosses.md#reckoning"
related:
  - dagons-breach-world-boss
  - breach-schedule-site-and-omens
  - breach-receipts-spoils-and-embers
invariants:
  - "Each joining fighter adds `BOSS_TTK_S` times `dpsRef(lv)` to boss health at the current HP fraction, where `dpsRef(lv) = 5 + lv` with `lv` clamped between 1 and 60."
  - "Per-player damage buckets refill at `BUCKET_RATE_X` (3) times `dpsRef` per second up to `BUCKET_DEPTH_X` (15), clipping single blows at `HIT_CAP_X` (12)."
  - "Absent fighters retire their HP share after `ABSENT_RETIRE_MS` (`retireShare`, `restoreShare`), and `standsAt` preserves the remaining HP fraction if everyone retires."
  - "`crystalStandIn` sets `crystalC` and `hostStandIn` sets `hostI`, so `standInSpell.js` routes a Cast When Strikes spell to that crystal or host body instead of the boss."
traps:
  - "`STAND_IN_WHOLE` (`src/world/gateBoss.js`) is derived from `HIT_CAP_X * dpsRef(LV_MAX) * EG_BUCKET_X_MAX` (`12 * 65 * 1.25 = 975`) so stand-in Disintegrate claims stay below `GATE_DMG_WIRE_MAX` (100,000)."
  - "Health and magicka regeneration are disabled inside the court, and both the boss and summoned host carry `pacifyImmune`."
  - "The relay accepts a blow on the boss or a crystal only from inside the boss's court plus `POSE_SLACK`, and a host blow only from that body's floor (`applyHostHit`)."
  - "Clients identify an attack by index plus landing time and a Reckoning by number plus first crystal spot, because a room restored from a checkpoint reuses attack numbers."
tags:
  - boss
  - relay
  - phases
  - telegraphs
  - reckoning
---

The court brain (`src/net/gateBrain.js`) steps every `BRAIN_TICK_MS` (250 ms) after an `OPENING_MS` (8,000 ms) opening window. Valkynaz Ruhn moves at `BOSS_SPEED` (3.2) with melee reach `BOSS_REACH_R` (16) inside a `COURT_R` (24-meter) court radius. Target selection blends threat (`THREAT_PICK` = 0.6, `THREAT_DECAY` = 0.1) and caps identical consecutive attacks at `REPEAT_MAX` (2).

## Court Crossings and Phase Turns

At `PHASE_AT` thresholds (`0.66` and `0.33`), the boss leaps across the three boss courts (`COURTS_HIS` = 3 in `COURTS`; extra `FLOOR` entries serve portents and arrival) over `CROSS_AIR_MS` (2,000 ms) at `CROSS_HEIGHT` (22 meters, `src/world/gateBoss.js`). A lava walkway of half-width `WALK_HALF_W` (3.2 meters) forms after `WALK_LEAD_MS` (1,000 ms) over `WALK_FORM_MS` (4,000 ms). The boss waits up to `CROSS_WAIT_MAX_MS` (30 seconds) with a `SHIELD_MS` (3,000 ms) arrival shield.

## Reckoning, Legion-Lord, and Combat Telemetry

Reckoning begins at `RECKON_FIRST_MS` (18 seconds) and repeats every `RECKON_EVERY_MS` (60 seconds), spawning crystals of radius `CRYSTAL_R` (1.3 meters, `src/render/courtCrystals.js`) with an 8-second team window (`RECKON_TEAM_S`) and `RECKON_CLOSE_MS` (500 ms) close slack. Breaking every crystal stuns the boss for `STUN_MS` (8,000 ms) at `STUN_HIT_X` (1.5x) damage vulnerability.

Under the `Legion-Lord` trial, the boss summons Harriers, Sappers (`SAP_HEAL` = 0.02, `SAP_FEEDS_MAX` = 6), and Ward-Bearers up to `GATE_HOST_MAX` (16 in `src/net/wire.js`). Clients report ally healing every `HEAL_SEND_MS` (1,000 ms, `src/worldEvents/gateCourt.js`), and the leaderboard (`src/ui/gateDamageChart.js`) displays up to `DAMAGE_CHART_MAX` (`GATE_CHART_MAX` = 32) entries.
