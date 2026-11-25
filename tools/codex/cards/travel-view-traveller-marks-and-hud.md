---
slug: travel-view-traveller-marks-and-hud
title: "Region Traveller Marks, Badges, and Edge Markers"
domain: multiplayer
kind: subcard
parent: travel-view-overworld-overview
files:
  - src/travel/travellerMarks.js
  - src/net/wire.js
  - src/net/online.js
  - src/ui/travelViewHud.js
  - src/travel/travelViewMarks.js
replacesBible:
  - "06-Systems/Travel-View.md"
related:
  - travel-view-overworld-overview
  - wire-protocol-and-frame-dispatch
  - identity-tokens-and-relay-seam
  - room-engine-and-hub-sharding
invariants:
  - "A traveller mark contains exactly `{px, py, fx, fy, h, m, tv}` (`TRAV_KEYS`), validated by `validTravellerMark`; player names come from the relay's verified identity token rather than the payload."
  - "Marks publish on the region WebSocket channel (`chat:region.N`, `CHAT_REGION_PREFIX`) at most once per `TRAV_SEND_MIN_MS` (`10` s), refresh every `TRAV_KEEPALIVE_MS` (`120` s) while stationary, and expire after `TRAV_STALE_MS` (`300` s)."
  - "Clients alone in a region or inside interiors and dungeons transmit zero traveller marks."
  - "`TRAV_MODES` encodes `foot`, `horse`, `cart`, and `ship`, with sub-pixel coordinates quantized in 256ths of a map pixel (`TRAV_FRACTION`)."
traps:
  - "Region chase payloads (`bd`, `sr`) travel alongside the mark object and validate through `validTravWords`; adding extra keys inside the mark object itself causes older clients to reject the mark."
  - "On-screen name badges stack with `NAME_STACK_GAP` (`2` px) vertical spacing after merging crowds within `TV_CROWD_PX` (`36` px)."
tags:
  - relay
  - region-channel
  - badges
  - edge-markers
  - hud
---

Region traveller marks let players in the same Daggerfall region see each other across the Overworld before entering near-field peer-to-peer room range.

## Wire Contract and Broadcast Cadence

`src/travel/travellerMarks.js` and `src/net/wire.js` publish compact mark payloads over the region WebSocket topic (`chat:region.N`, `CHAT_REGION_PREFIX`). `validTravellerMark` enforces the exact key set `TRAV_KEYS` (`{px, py, fx, fy, h, m, tv}`), where sub-pixel offsets `fx` and `fy` are quantized to `TRAV_FRACTION` (`1/256` of a map pixel) and `m` indexes `TRAV_MODES` (`foot`, `horse`, `cart`, `ship`). The relay attaches the sender's verified display name from the session token. Moving clients broadcast at most once every `TRAV_SEND_MIN_MS` (`10` s), idle exterior clients send a keepalive every `TRAV_KEEPALIVE_MS` (`120` s), and receivers drop marks older than `TRAV_STALE_MS` (`300` s). Clients that are indoors or alone in their region send nothing. Optional region-chase words (`bd`, `sr`) sit beside the mark in the outer frame and validate via `validTravWords`.

## HUD Decluttering and Edge Pinning

`src/ui/travelViewHud.js` and `src/travel/travelViewMarks.js` project active marks onto the Overworld HUD. `declutterTravellers` merges nearby players within `TV_CROWD_PX` (`36` px on screen, or `TV_CROWD_EDGE_PX = 56` px along the screen perimeter), renders up to `TV_BADGES_MAX` (`6`) nearest badges with `NAME_STACK_GAP` (`2` px) vertical spacing, and throttles DOM/canvas creation to `BADGE_BUILDS_PER_FRAME` (`16`). Off-screen travellers clamp inside `TV_EDGE_MARGIN` (`28` px) via `edgeHold`, dodging active HUD panels measured by `measureFurniture`.
