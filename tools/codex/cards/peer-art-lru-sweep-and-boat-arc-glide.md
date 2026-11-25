---
slug: "peer-art-lru-sweep-and-boat-arc-glide"
title: "Peer Outfit Sprite LRU Bounds and Turn-Arc Peer Boat Leading"
domain: "multiplayer"
kind: "subcard"
parent: "gifted-shield-merge-and-cast-level-cap-overview"
files:
  - "src/net/peerRiders.js"
  - "src/player/eotbBody.js"
  - "src/player/layeredArmor.js"
  - "src/systems/naval/comeSailAwayPeers.js"
  - "src/systems/naval/navalHost.js"
  - "src/net/online.js"
  - "src/net/wire.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-22d.md"
related:
  - "gifted-shield-merge-and-cast-level-cap-overview"
  - "come-sail-away-online-peer-boats-and-aboard"
  - "online-coop-peer-presence-and-crowd-fans"
  - "naval-traffic-captain-ai-and-online-sea"
invariants:
  - "`createEotbArt` retains at most `RIDER_PIXELS_KEPT = 64` decoded sprites by LRU, and `releaseOutfits` (`src/player/eotbBody.js`) frees prior worn-armor outfit strips once replacement textures upload."
  - "Composite looks (`spriteLookOf`) evict only during the end-of-frame `sweep` past `RIDER_LOOKS_KEPT = 12` when undrawn for `RIDER_LOOK_IDLE_MS = 2000` ms across two sweeps, and both peer and local stores verify `renderer.textures.has`."
  - "Moving peer boats (`src/systems/naval/comeSailAwayPeers.js`) extrapolate along their turn arc (`wayOver`) for up to `CSA_PEER_LEAD_MAX = (2 * FOES_FULL_MS) / 1000` s, gliding via `CSA_PEER_CATCH_MPS = 0.3` and `CSA_PEER_CATCH_SHARE = 0.25` until within `CSA_PEER_LED_SETTLE_M = 1` m."
traps:
  - "Never evict composite looks mid-draw: after a frame hitch, mid-draw eviction purges live crowd outfits on screen."
  - "Peer boats use `CSA_PEER_CATCH_*` (`0.25` share), distinct from AI naval `PUPPET_CATCH_*` (`0.1` share in `src/systems/naval/navalHost.js`)."
dfu: []
tags:
  - "memory"
  - "sprites"
  - "boats"
  - "peers"
---

# Peer Outfit Sprite LRU Bounds and Turn-Arc Peer Boat Leading

Peer outfit texture stores enforce frame-safe LRU eviction across `src/net/peerRiders.js`, `src/player/eotbBody.js`, and `src/player/layeredArmor.js`, while remote boats dead-reckon along curved turn arcs in `src/systems/naval/comeSailAwayPeers.js`.

- **Decoded sprite and composite look LRU (`src/net/peerRiders.js`, `src/player/eotbBody.js`, `src/player/layeredArmor.js`):** `createEotbArt` retains at most `RIDER_PIXELS_KEPT = 64` decoded sprites by LRU, and `releaseOutfits` frees prior worn-armor outfit strips once replacement textures upload. Composite looks keyed by `spriteLookOf` (`LA:<body>:<combo>:<code>` or the horse look) never evict mid-draw, preventing frame hitches from purging live crowd outfits on screen. Instead, the end-of-frame `sweep` evicts entries past `RIDER_LOOKS_KEPT = 12` only after they sit undrawn for `RIDER_LOOK_IDLE_MS = 2000` ms across two sweeps, and both peer and local stores check `renderer.textures.has` before reuse.
- **Turn-arc peer boat extrapolation (`src/systems/naval/comeSailAwayPeers.js`, `src/systems/naval/navalHost.js`, `src/net/online.js`, `src/net/wire.js`):** Moving peer boats extrapolate along their turn arc (`wayOver`) for up to `CSA_PEER_LEAD_MAX = (2 * FOES_FULL_MS) / 1000` s and ease heading toward the led arc at exponential slerp rate `12`. Hulls glide via `CSA_PEER_CATCH = 1`, `CSA_PEER_CATCH_MPS = 0.3`, and `CSA_PEER_CATCH_SHARE = 0.25` (distinct from AI naval `PUPPET_CATCH_SHARE = 0.1`) until settling within `CSA_PEER_LED_SETTLE_M = 1` m.
