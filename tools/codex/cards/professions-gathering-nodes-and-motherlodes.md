---
slug: professions-gathering-nodes-and-motherlodes
title: "Gathering Nodes, Fishing, Node Marks and Glow, Motherlodes"
domain: economy
kind: subcard
parent: professions-arc-overview
files:
  - src/net/nodeLaw.js
  - src/net/motherlodeLaw.js
  - src/net/motherlodeBook.js
  - src/professions/gatherHost.js
  - src/professions/mineHost.js
  - src/professions/fishHost.js
  - src/render/nodeGlow.js
  - src/render/nodeGlint.js
  - src/net/peerGather.js
  - server-account/src/motherlodes.js
routes:
  - /v1/prof/harvest
  - /v1/prof/pixels
  - /v1/prof/motherlodes
tables:
  - node_harvests
  - world_witness
  - motherlodes
  - motherlode_days
  - motherlode_strikes
replacesBible:
  - "06-Systems/Professions-Arc.md"
related:
  - professions-arc-overview
  - professions-marks-and-silver-finds
invariants:
  - "Routine harvests, fishing hauls, and common hides have no daily cap; only `DEEP_UNCONFIRMED_PER_DAY` (4 unvouched dungeon veins) and `HIGH_HIDES_PER_DAY` (3 hides at or above `HIGH_HIDE_TIER = 5`) are capped per account."
  - "`UNCONFIRMED_VEIN_TIER` caps unwitnessed map pixels at tier 3, and `JUNGLE_TREE_SLOTS` provides 48 timber slots."
  - "`SCHOOL_HAULS_DAY` (40) limits only the fishing school bonus, never total daily hauls."
  - "Motherlodes spawn `MOTHERLODES_A_DAY = 3` (one per `MOTHERLODE_THIRD_S = 8` h window), stay open for `MOTHERLODE_OPEN_S = 2` h for up to `MOTHERLODE_STRIKERS = 20` strikers, warn `MOTHERLODE_WARN_S = 600` s ahead (`1,800` s with Sense), and pay `MOTHERLODE_SILVER = 10` Marks."
traps:
  - "A harvested node disappears locally as soon as its act finishes (`goneIn` checks `gone` in the local book) and reappears if `/v1/prof/harvest` rejects the claim."
  - "`GLINT_NEAR_W` (`1e-3`) clips nodes behind the camera in `src/render/nodeGlint.js`; omitting it expands the projected glint rectangle across the entire screen."
tags:
  - gathering
  - nodes
  - fishing
  - motherlodes
  - node-glow
---

World gathering (`src/net/nodeLaw.js`, `src/professions/gatherHost.js`, `src/professions/mineHost.js`, and `src/professions/fishHost.js`) pairs deterministic node placement and minigame acts with server verification (`/v1/prof/harvest` and `/v1/prof/pixels` over `node_harvests` and `world_witness`).

## Node Caps, Witness Rules, and Fishing

General daily harvest, haul, and hide ceilings are removed. Only two account limits remain: `DEEP_UNCONFIRMED_PER_DAY` (4 unvouched dungeon veins, scaled by `DEEP_DELVER_MULT` of 2 where applicable, while unwitnessed exterior pixels cap at `UNCONFIRMED_VEIN_TIER` 3) and `HIGH_HIDES_PER_DAY` (3 rare hides at or above `HIGH_HIDE_TIER` 5, where clean harvests inside the cap qualify as `trophyHunted`). Jungle cells expose `JUNGLE_TREE_SLOTS` (48) timber nodes. Fishing (`fishHost.js`) requires casting `CAST_OVER_WATER_M` (5.5 m) over water; `SCHOOL_HAULS_DAY` (40) bounds only bonus school yields.

## Visual Cues and Motherlodes

`src/render/nodeGlow.js` and `src/render/nodeGlint.js` highlight up to `NODE_GLOW_MAX` (16) nodes within `NODE_GLOW_M` (120 m), clipping near-plane projections at `GLINT_NEAR_W` (`1e-3`). Compass tracking marks up to `NODE_MARK_MAX` (16) nodes, and prospecting scans up to `PROSPECT_REACH` (32) targets within `PROSPECT_M` (500 m, or `PROSPECT_DEEP_M` 200 m underground). Peer harvest cues throttle to `PEER_GATHER_CUE_MS` (75 ms in `src/net/peerGather.js`).

`src/net/motherlodeLaw.js`, `src/net/motherlodeBook.js`, and `server-account/src/motherlodes.js` (`/v1/prof/motherlodes`) schedule `MOTHERLODES_A_DAY` (3) rich veins (`motherlodes`, `motherlode_days`, and `motherlode_strikes`), one per `MOTHERLODE_THIRD_S` (8 h) window. Each opens for `MOTHERLODE_OPEN_S` (2 h) after a `MOTHERLODE_WARN_S` (600 s, or 1,800 s with Sense) warning, requires rank `MOTHERLODE_RANK` (25), admits `MOTHERLODE_STRIKERS` (20) players, and yields `MOTHERLODE_YIELD` (4–6 units of `MOTHERLODE_ORES`: `adamantium`, `ebony`, or `orichalcum`) plus `MOTHERLODE_SILVER` (10 Marks) once daily.
