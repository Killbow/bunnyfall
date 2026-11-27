---
slug: tavern-card-tables-seating-and-physics
title: "Tavern Card Table Props, Seating, and Card Physics"
domain: world
kind: subcard
parent: tavern-cards-holdem-and-iliac-hand
files:
  - src/world/placedCardTable.js
  - src/world/cardTableProp.js
  - src/world/cardTables.js
  - src/player/seatPose.js
  - src/world/cardMotion.js
  - src/world/cardScene.js
  - src/world/cardHand.js
  - src/world/cardRegulars.js
  - src/render/cardTableDraw.js
  - src/render/cardFaces.js
  - src/scenes/worldModes.js
  - src/cards/cardTableSession.js
replacesBible:
  - "11-Multiplayer/Tavern-Cards.md#tables"
  - "11-Multiplayer/Tavern-Cards.md#seating"
  - "11-Multiplayer/Tavern-Cards.md#physics"
related:
  - tavern-cards-holdem-and-iliac-hand
  - holdem-relay-tables-and-gold-escrow
  - webgl2-renderer-and-textures
  - characters-paperdoll-and-bodies
invariants:
  - "Each tavern places up to `TAVERN_CARD_TABLES` (`2`) dedicated props (`src/world/placedCardTable.js`): the friendly chips table nearest the entrance by walk distance (index `0`), and the gold stakes table at `HOLDEM_GOLD_TABLE` (index `1`)."
  - "Table geometry measures `CARD_TABLE_W` (`1.5 m`) by `CARD_TABLE_D` (`1.0 m`) at `CARD_TABLE_TOP` (`0.8 m`) with felt `2 mm` above the top, colored green (`FELT_RGB = [31, 90, 55]`) for chips and red (`GOLD_FELT_RGB = [118, 26, 34]`, `'feltgold'`) for gold."
  - "Seated camera height drops to `SEATED_EYE_HEIGHT = 1.22 m` (`EYE_HEIGHT 1.7 - SEAT_HIP_DROP 0.48`), with stools placed `SEAT_OUT` (`0.35 m`) from the rotated local table box at `SEAT_SPACING` (`0.75 m`) for `2` to `6` valid seats."
  - "Card and chip animations (`dealMotion`, `flipMotion`, and `pushAt`) evaluate closed-form time curves seeded by `hashSeed(hand, card, table)` without calling `Math.random`."
  - "`settleMs` builds the session's wait from `DEAL_STAGGER`, `THROW_LAND_S`, and `FLIP_S` in `src/world/cardMotion.js`, so changing those motion constants also changes the session clock."
traps:
  - "Table placement scans a `PLACE_CELL` (`0.5 m`) grid shifted by `PLACE_GRID_OFF` from the `1/40 m` lattice and skips any candidate that blocks walk connectivity; taverns with no clear footprint get zero tables."
  - "Direct attack hits and reaching `0` HP force a seated player to leave the seat, whereas damage-over-time ticks (`tickInFlight`) do not (`src/scenes/worldModes.js`)."
  - "Only 3D Morrowind bodies animate a seated posture in `src/player/seatPose.js`; 2D sprite walkers and paperdolls remain upright facing the table."
tags:
  - world
  - props
  - seating
  - card-physics
  - rendering
  - tavern
---

Classic Daggerfall tavern tables remain static furniture while `src/world/placedCardTable.js` places up to two interactive card tables (`src/world/cardTableProp.js`) with procedural `texelNoise` felt and `STOOL_TOP` (`0.48 m`) stools around `seatSpots`. Seat positions derive from the table's local oriented bounding box rather than its world AABB (`src/world/cardTables.js`); spots yielding fewer than 2 unblocked seats are discarded.

## Seating and Regulars

When a player sits, camera elevation lowers by `SEAT_HIP_DROP` (`0.48 m`) to `SEATED_EYE_HEIGHT` (`1.22 m`). In `leavesSeat` (`src/world/cardTables.js`), movement input, jumping, or controller stick deflection past `SEAT_STICK_LEAVE` (`0.3`) vacates the stool. Direct hit damage or fatal damage also forces the player up, while ongoing `tickInFlight` damage-over-time ticks leave the player seated.

Offline AI regulars (`src/world/cardRegulars.js`) render at stools using the `st` (`seatTopByte`) network pose byte, generating deterministic clothing and faces from a `mulberry32` stream keyed by patron seed.

## Deterministic Motion and Rendering

In `src/world/cardMotion.js`, cards measure `CARD_W` (`0.063 m`) by `CARD_L` (`0.088 m`) and animate over fixed durations (`DEAL_STAGGER = 0.11 s`, `THROW_LAND_S = 0.7 s`, `FLIP_S = 0.32 s`, `RIFFLE_S = 0.8 s`, and `GATHER_S = 0.8 s`), while pots break into `CHIP_VALUES` (`[500, 100, 25, 5, 1]`). `src/render/cardFaces.js` procedurally draws the Iliac Bay deck into a texture atlas managed by `src/render/cardTableDraw.js`, allocating the atlas when a table opens and freeing it on close.
