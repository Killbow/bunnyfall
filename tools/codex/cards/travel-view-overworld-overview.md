---
slug: travel-view-overworld-overview
title: "Travel View (Overworld) Overview"
domain: world
kind: overview
parent: null
files:
  - src/travel/travelView.js
  - src/scenes/world.js
  - src/player/travelCamera.js
  - src/travel/travelOptions.js
  - src/ui/travelViewHud.js
  - src/travel/travelHorizon.js
replacesBible:
  - "06-Systems/Travel-View.md"
related:
  - travel-view-camera-and-ground-pick
  - travel-view-routing-and-load-governor
  - travel-view-traveller-marks-and-hud
  - travel-view-roaming-bands-and-threat
  - pixel-streaming-and-origin-shift
  - sky-weather-and-lighting
  - naval-and-come-sail-away
  - four-hosts-and-modal-frame
invariants:
  - "Player-facing text labels the view `Overworld` (`TRAVEL_VIEW_BUTTON`), while code modules use `travelView`."
  - "`createTravelView` drives the four-state lifecycle `off` -> `rising` (`TV_RISE_S = 1.2` s) -> `up` -> `falling` (`TV_FALL_S = 0.8` s)."
  - "`travelViewAllowed` requires Enhanced mode, walk mode, a spawned living player, exterior mode, unsubmerged state, and Farming Mode off."
  - "A `TV_HEARTBEAT_MS` (`600` ms) watchdog re-arms every rendered frame; the first missed period grants one grace window, and the second lowers the camera."
  - "Linear haze ends at `TV_HAZE_END = RING_RIM_END` (`(48 - 12) * 819.2 * 0.95 = 28016.64` m)."
traps:
  - "Always read the haze boundary from `RING_RIM_END` (`src/render/farRing.js`) rather than hardcoding the distance."
  - "Classic mode refuses Overworld activation with `TRAVEL_VIEW_TEXT.enhancedOnly`."
tags:
  - travel-view
  - overworld
  - camera
  - travel-options
  - architecture
---

Travel View, labeled Overworld in the player interface (`TRAVEL_VIEW_BUTTON`), raises the camera over the live streamed world and the live player body rather than opening a separate 2D map.

## Lifecycle and Entry Rules

`createTravelView` (`src/travel/travelView.js`) steps through `off`, `rising` (`TV_RISE_S = 1.2` s), `up`, and `falling` (`TV_FALL_S = 0.8` s). Before raising the camera, `travelViewAllowed` (`src/scenes/world.js`) confirms Enhanced mode (`TRAVEL_VIEW_TEXT.enhancedOnly` rejects Classic mode), walk mode, an active living player in the exterior world, unsubmerged position, and Farming Mode disabled. During active view, a `TV_HEARTBEAT_MS` (`600` ms) watchdog re-arms each rendered frame; missing one window grants a single grace period, and missing a second lowers the camera back to first-person play.

## World Rendering and Navigation

While elevated, clicking a discovered settlement or dungeon routes along the road network (`beginTravelAlongRoute`), while clicking open terrain walks directly to that point (`beginTravelToPoint`). To cover the high-altitude view frustum, shadow cascades center on the camera focus and expand by `SHADOW_VIEW_SCALE` (`4`) in `src/render/shadowPass.js`, linear horizon haze extends to `TV_HAZE_END = RING_RIM_END` (`28016.64` m from `src/render/farRing.js`), and background terrain generation widens its frame budget to `BUILD_SLICE_OVERWORLD_MS` (`20` ms, targeting 30 fps in `src/platform/buildBreather.js`).

## Subcards

- `travel-view-camera-and-ground-pick`: altitude bounds, tilt easing, billboard lean, and ground raycasting.
- `travel-view-routing-and-load-governor`: road and sea A* pathing, town walks, and streaming speed caps.
- `travel-view-traveller-marks-and-hud`: region channel broadcasts, crowd badges, and screen-edge markers.
- `travel-view-roaming-bands-and-threat`: procedural enemy bands, stealth rolls, threat pacing, and dungeon models.
