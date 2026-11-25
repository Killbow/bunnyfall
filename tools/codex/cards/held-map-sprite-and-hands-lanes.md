---
slug: held-map-sprite-and-hands-lanes
title: "Held Map Sprite Lane and Morrowind Hands Lane"
domain: ui
kind: subcard
parent: held-map-overview
files:
  - src/ui/heldMap.js
  - src/ui/quadMap.js
  - src/combat/heldPose.js
  - src/combat/fpArm.js
  - src/combat/weaponRig.js
  - src/player/mwView.js
  - tools/heldMapProbe.mjs
  - tools/heldMapArtProbe.mjs
  - tools/mwArmProbe.mjs
routes: []
tables: []
replacesBible:
  - "10-UI/Held-Map-Arc.md"
related:
  - held-map-overview
  - two-hands-morrowind-mirror-rig-and-spread
  - morrowind-npc-bodies-overview
invariants:
  - "Sprite lane: the painting stands HELD_MAP_HEIGHT = 0.92 of the viewport, with its foot (SPRITE_ART_FOOT = 0.872) placed HELD_MAP_BITE = 0.11 past the bottom edge. extendCuffs extends the cuffs below CUFF_BAND = 0.827 so there is never a gap at the screen foot."
  - "Thumbs are keyed back over the ink by chroma, not luma: keyThumbPixels seeds where red minus blue < HAND_CHROMA = 75 inside THUMB_ZONES, then closes gaps with THUMB_GROW = 4."
  - "Hands lane: the ink canvas is placed by quadPlacement's CSS matrix3d (src/ui/quadMap.js). _paperPoint inverts the pointer, and any point off the sheet returns OFF_SHEET = [-1e9, -1e9]."
  - "quadPlacement returns null when |area|/2 <= 0.02 * longest edge squared (near edge-on), or when a point lies beyond the paper's vanishing line."
  - "sheetHolderOf(rig) gives available = armsAvailable() (true even while sheathed), hold = holdPaper and release = releasePaper. Corners count only from a frame the arm drew (armsDrawn)."
  - "While sheetWindowUp(), weaponRig suppresses classic weapon, shield and hand sprites, below the arm branch."
traps:
  - "If the hands lane gets no corners for more than HANDS_LOST_TICKS = 45 ticks in phase 'map', it falls back to the sprite for the rest of that open."
  - "The sprite lane retries the arm only while 0 < _handsTries < 30 and never during closing. Taking the arm mid-close snaps the lowering sheet back."
dfu: []
tags:
  - held-map
  - morrowind-arm
  - homography
  - sprite
  - first-person
---

# Held Map Sprite Lane and Morrowind Hands Lane

`HeldMapWindow` renders the parchment sheet either inside the 2D painted sprite (`PAPER = { x0: 0.226, x1: 0.775, y0: 0.196, y1: 0.704 }`) or warped via projective homography between the 3D Morrowind first-person hands.

- **Sprite Lane Framing, Cuffs, and Chroma Thumbs (`src/ui/heldMap.js`):** In `'sprite'` lane, the painting stands `HELD_MAP_HEIGHT = 0.92` of the viewport with its foot (`SPRITE_ART_FOOT = 0.872`) placed `HELD_MAP_BITE = 0.11` past the bottom edge, and `extendCuffs` stretches cuff pixels below `CUFF_BAND = 0.827`. `keyThumbPixels` keys thumbs over the ink by chroma rather than luma, seeding where red minus blue is below `HAND_CHROMA = 75` inside `THUMB_ZONES` and dilating by `THUMB_GROW = 4`.
- **Morrowind Hands Rig and Homography (`src/ui/quadMap.js`, `src/combat/heldPose.js`, `src/combat/fpArm.js`, `src/combat/weaponRig.js`):** `heldPose.js` exports `HELD_POSE_DEFAULT`, `HELD_BONE_ALIASES`, `heldSampler`, `paperCornersRig`, `paperPiece`, `projectPaperCorners`, and `normaliseHeldPose`; `fpArm.js` provides `packFpArm`, `holdPaper(spec, { aspect = 1.6 })`, and `heldPose()`. `sheetHolderOf(rig)` exposes `available = armsAvailable()`, `hold = holdPaper`, and `release = releasePaper`, counting corners only when `armsDrawn` holds. While `sheetWindowUp()` is true, `weaponRig.js` suppresses classic weapon, shield, and hand sprites. `quadPlacement` computes the CSS `matrix3d` and inverse `_paperPoint` mapping (`OFF_SHEET = [-1e9, -1e9]` off sheet, or `null` when `|area| / 2 <= 0.02 * longestEdge^2` or beyond the vanishing line).
- **Lane Retries and Fallback (`src/ui/heldMap.js`):** The sprite lane retries `_tryHands` while `0 < _handsTries < 30` and never during `'closing'`. Losing corners for over `HANDS_LOST_TICKS = 45` ticks in phase `'map'` falls back to the sprite lane.
