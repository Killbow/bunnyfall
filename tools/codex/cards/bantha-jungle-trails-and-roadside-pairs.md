---
slug: bantha-jungle-trails-and-roadside-pairs
title: "Jungle Dirt Trails and Roadside Liana Pairs"
domain: world
kind: subcard
parent: bantha-jungle-overview
files:
  - src/world/jungle/jungleTrails.js
  - src/world/jungle/jungleRoadside.js
  - src/systems/livingWorld/roadsidePairs.js
  - src/world/naturePicture.js
  - src/world/roadBand.js
  - src/world/terrainGen.js
replacesBible:
  - "03-World/Bantha-Jungle.md"
related:
  - bantha-jungle-overview
  - bantha-jungle-area-field-and-layout
  - living-world-roads-trips-and-encounters
invariants:
  - "Dirt trails follow iso-lines of two domain-warped value-noise families (JUNGLE_TRAILS.families with 176-tile and 240-tile cells) rotated by Pythagorean-triple turns so paths never follow grid axes and match across JS engines."
  - "warpStretch stays below 2 so domain warping never folds a trail over itself, and a half-width of 0.75 tiles keeps dirt continuous at any heading."
  - "paintJungleTrails paints dirt in 4x4 tile blocks (block = 4), and trailBlocks skips blocks that neither noise family can reach."
  - "Roadside pairs sink by JUNGLE_ROADSIDE.sink (0.3 meters) below the lowestDrawn ground under either foot and are rejected if either trunk would bury deeper than bury (3 meters)."
  - "Every cell under overhanging lianas maintains at least headroom (2.75 meters) above the highestDrawn road ground (mounted camera height of 2.51 meters plus 0.24 meters of clearance)."
  - "Pair trunks stay at least EDGE_MIN (19 meters) inside pixel edges and clear (9 meters times scale) from other jungle trunks, while both feet must clear roads (roadRoom) and trails (trailOk)."
traps:
  - "Liana headroom is checked per under cell in JUNGLE_PAIR_MEASURES against the highest drawn triangle corner rather than cell centers so graded road slopes cannot clip riders."
  - "keptPairs drops an entire pair whenever either constituent tree fails validation; never place half of a pair."
tags:
  - jungle
  - trails
  - roads
  - roadside
  - lianas
---

# Jungle Dirt Trails and Roadside Liana Pairs

The jungle carves continuous dirt footpaths through the interior (`src/world/jungle/jungleTrails.js`) and arches paired liana trees over main roads (`src/world/jungle/jungleRoadside.js` and `src/systems/livingWorld/roadsidePairs.js`).

## Domain-Warped Dirt Trails

Trails trace the iso-lines of two value-noise families (`JUNGLE_TRAILS.families`, cell sizes `176` and `240` tiles) rotated by rational Pythagorean-triple matrices so paths avoid cardinal axes and produce identical floating-point results across engines. Keeping `warpStretch` below `2` prevents self-folding, and a `0.75`-tile half-width keeps diagonal tracks unbroken. During `src/world/terrainGen.js`, `trailBlocks` prunes unreachable 4x4 tile blocks (`block` = `4`) before `paintJungleTrails` writes dirt records.

## Roadside Liana Pairs

Along `src/world/roadBand.js` corridors, `jungleRoadside.js` samples candidate stations starting at `44` meters, stepping every `40` meters (at least `24` meters from pixel edges, `8` meters jitter, `0.6` chance, scale `0.92-1.08`, salt `600`). `JUNGLE_PAIR_MEASURES` defines three `22.55`-meter pair types: leaning kapok on a mound, strangler fig, and sunken kapok (`-2` m base).

Each pair sinks `JUNGLE_ROADSIDE.sink` (`0.3` m) below `lowestDrawn`, rejects trunks buried over `bury` (`3` m), enforces `EDGE_MIN` (`19` m), trunk `clear` (`9` m times scale), `roadRoom`, and `trailOk`, and checks `headroom` (`2.75` m) above `highestDrawn` across all `under` cells. `keptPairs` drops both halves if either tree fails. `readPair` splits the pair OBJ into two trees, `pairPicture` and `junglePicture` (`src/world/naturePicture.js`) load textures, and `standRoadside` places the meshes.
