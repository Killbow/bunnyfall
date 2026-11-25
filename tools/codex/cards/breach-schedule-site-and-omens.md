---
slug: breach-schedule-site-and-omens
title: "Breach Schedule, Site Selection, and Omens"
domain: multiplayer
kind: subcard
parent: dagons-breach-world-boss
files:
  - src/net/gateLaw.js
  - src/net/gateMods.js
  - src/worldEvents/gateSite.js
  - src/worldEvents/gateOmen.js
  - src/world/gateModel.js
  - src/world/gateClearance.js
  - src/world/dreadSky.js
  - src/render/gateVeil.js
  - src/ui/gateMapMark.js
  - src/ui/gateMarksView.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/World-Bosses.md#schedule"
  - "11-Multiplayer/World-Bosses.md#site"
  - "11-Multiplayer/World-Bosses.md#marks"
related:
  - dagons-breach-world-boss
  - breach-boss-brain-and-courts
invariants:
  - "Site selection draws from a deterministic shuffle bag over qualifying regions and hashes land pixels near a town with `gateHash` and `GATE_SALT` (`0x6a7e`), while `gateSeaPixel` rejects ocean climates and low height bytes."
  - "`gateModsOf(day)` returns `[aspect, trial, trial]` from a 144-gate cycle (`gateMarksCycleLength`: 4 aspects times 36 trial pairs across 9 trials, with one trial resting each round) so consecutive gates never share a mark."
traps:
  - "`marksCycle` is an internal helper in `src/net/gateLaw.js`; callers must use the exported `gateModsOf` and `gateMarksCycleLength` functions."
  - "Live `GATE_PHASES` are `quiet`, `omen`, `rising`, `sealed`, `open`, `closed`, `collapsing`, and `gone` (never `hidden` or `sealed_after`)."
tags:
  - schedule
  - site
  - omen
  - marks
  - dread-sky
---

Each game day (`src/net/gateLaw.js`) steps through eight `GATE_PHASES` driven by daily minute thresholds: `GATE_OMEN_MINUTE` (1020), `GATE_RISE_MINUTE` (1140), `GATE_OPEN_MINUTE` (1200), `GATE_SEAL_MINUTE` (1320), and `GATE_WRATH_MINUTE` (1440). Rising plays over `GATE_RISE_MS` (20 seconds), and collapse lasts `GATE_COLLAPSE_MS` (10 seconds).

## Site Selection, Clearance, and Veil

`src/worldEvents/gateSite.js` picks a region from a deterministic shuffle bag and hashes candidate land pixels near a town (`gateHash` with `GATE_SALT` = `0x6a7e`), filtering out water via `gateSeaPixel`. During the omen phase (`src/worldEvents/gateOmen.js`, `src/ui/gateMapMark.js`), the map displays an approximate ring of radius `OMEN_RING_PIXELS` (2) offset by up to `OMEN_RING_SHIFT_PIXELS` (1.2).

On the ground (`src/world/gateClearance.js`), terrain clearance flattens rocks and foliage within `GATE_CLEAR_M` (24 meters) of the gate and `RITE_CLEAR_M` (20 meters) of the rite circle. The gate mesh (`src/world/gateModel.js`) derives `GATE_HALF_W` from its baked vertex positions, and the crossing fire veil (`src/render/gateVeil.js`) animates with `VEIL_CLOSE_S` (1.2 seconds), `VEIL_OPEN_S` (1.7 seconds), and `VEIL_HOLD_MAX_S` (20 seconds).

## Aspects and Trials

`gateModsOf(day)` (`src/net/gateMods.js`, rendered by `src/ui/gateMarksView.js`) pairs one of four elemental Aspects (`Burning`, `Rime-Wrought`, `Storm-Crowned`, or `Venom-Blooded`) with two of nine `GATE_TRIALS` (including `Legion-Lord`) over a 144-gate cycle. Non-Legion-Lord nights can also layer post-arc Breach Portents and a 1-in-5 (`TITHE_ONE_IN`) Tithe-Imp roll in `gateLaw.js`.
