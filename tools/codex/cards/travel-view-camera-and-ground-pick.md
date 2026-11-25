---
slug: travel-view-camera-and-ground-pick
title: "Travel View Camera Laws and Ground Picking"
domain: rendering
kind: subcard
parent: travel-view-overworld-overview
files:
  - src/player/travelCamera.js
  - src/player/travelPick.js
  - src/player/tapRay.js
  - src/travel/travelView.js
  - src/travel/travelHorizon.js
replacesBible:
  - "06-Systems/Travel-View.md"
related:
  - travel-view-overworld-overview
  - travel-view-routing-and-load-governor
invariants:
  - "Camera height clamps between `TV_HEIGHT_MIN` (`150` m) and `TV_HEIGHT_MAX` (`450` m, default `260` m), stays at least `TV_CLOUD_MARGIN` (`60` m) below the cloud base, and never drops below `TV_HEIGHT_FLOOR` (`40` m)."
  - "Pitch tilt clamps to `15`–`75` degrees (default `52`), while `TV_GROUND_CLEAR` keeps `25` m of terrain clearance across `TV_CLEAR_SPAN`."
  - "Camera focus eases at `TV_FOCUS_RATE` (`10`) and snaps immediately when lag exceeds `TV_FOCUS_SNAP` (`60` m)."
  - "Billboards pitch back by `TV_BILLBOARD_LEAN` (`0.5`) of the camera tilt, and movement keys steer the player at `TV_TURN_RATE` (`6` rad/s)."
  - "Pointer presses moving less than `TV_CLICK_SLOP` (`6` px) trigger a world pick, while larger drags orbit the camera."
traps:
  - "Ground picking marches built terrain only out to `TV_PICK_MAX` (`6000` m); clicking unbuilt tiles or water fails with a player notice."
  - "The player sprite scale (`tvOwnGrow`) expands by `1 + d / TV_OWN_GROW_M` (`32`), capped at `TV_OWN_GROW_MAX` (`12`)."
tags:
  - camera
  - tilt
  - picking
  - raycast
  - billboards
---

`src/player/travelCamera.js` and `src/travel/travelHorizon.js` control the elevated camera rig, horizon projection, billboard compensation, and ground raycasting during Overworld travel.

## Altitude, Tilt, and Focus Tracking

Camera altitude stays between `TV_HEIGHT_MIN` (`150` m) and `TV_HEIGHT_MAX` (`450` m, default `260` m). Low cloud decks push the ceiling down to at least `TV_CLOUD_MARGIN` (`60` m) below the cloud base, floored at `TV_HEIGHT_FLOOR` (`40` m). Pitch tilt clamps between `15` and `75` degrees (default `52` degrees), and `TV_GROUND_CLEAR` enforces a `25` m minimum terrain clearance along `TV_CLEAR_SPAN`. The focus target tracks the player with exponential easing at `TV_FOCUS_RATE` (`10`) and snaps whenever distance exceeds `TV_FOCUS_SNAP` (`60` m). `horizonFog` and `horizonProj` (`src/travel/travelHorizon.js`) widen the projection frustum from `TV_LENS_NEAR` (`2` m) to `TV_LENS_FAR` (`12000` m).

## Billboard Lean and Ground Picking

To keep flat sprites readable from steep angles, billboards lean back by `TV_BILLBOARD_LEAN` (`0.5`) of the camera tilt, and the player's own billboard grows with camera distance (`tvOwnGrow = 1 + d / TV_OWN_GROW_M` where `TV_OWN_GROW_M = 32`, up to `TV_OWN_GROW_MAX = 12`). Movement keys turn the character at `TV_TURN_RATE` (`6` rad/s).

Pointer input splits on `TV_CLICK_SLOP` (`6` px): drags beyond `6` px orbit the rig, while clean clicks call `rayDirFromScreen` (`src/player/tapRay.js`), `groundHit`, and `classifyPick` (`src/player/travelPick.js`). Rays march built terrain out to `TV_PICK_MAX` (`6000` m) and reject water or unbuilt ground with a notice.
