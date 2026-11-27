---
slug: bazaar-betwixt-sanctum-and-portal
title: "Bazaar Betwixt Sanctum, Spatial Seam, and Aurbic Sky"
domain: world
kind: overview
parent: null
files:
  - src/systems/bazaarBetwixt.js
  - src/world/bazaarBetwixtModel.js
  - src/render/bazaarBetwixtArt.js
  - src/render/bazaarSkyPass.js
  - src/render/bazaarPortalPass.js
  - src/audio/bazaarAudio.js
  - src/scenes/bazaarBetwixtRoom.js
  - src/world/eliteGates/pseudoArchives.js
  - src/scenes/worldModes.js
  - src/scenes/frame/indoorsFrame.js
  - src/scenes/frame/motorFrame.js
  - src/scenes/frame/sceneFrame.js
  - src/world/outsideViewWorld.js
  - src/mods/contentOff.js
  - src/net/onlineWorld.js
  - src/characters/exteriorFoes.js
routes: []
tables: []
replacesBible: []
related:
  - psijic-seals-and-character-respec
  - df-look-overview
invariants:
  - "Warm both the indoor context (prebuildBazaarPortal / parkCtx) and Stoneroom reverb (audio.holdReverb('bazaarBetwixt') at wet gain 0) when the Gothway Garden portal opens, ramp gain on crossing, and call audio.releaseReverb('bazaarBetwixt') on every exit."
  - "While inBazaarBetwixt() is true, worldModes.js keeps the exterior town batch (keepExterior: true) and indoorsFrame.js skips worldAddons.run('indoorFrame') (streetRigs.js) while stopping outdoor ambience so the return seam renders Gothway Garden live."
  - "Resolve custom NPC PNGs under public/art/bunnyfall-npcs/ against APP_ROOT so subpath /play/ deployments fetch ./art/bunnyfall-npcs/celarus.png and ./art/bunnyfall-npcs/valenis.png instead of root-anchored /art/ paths."
traps:
  - "In bazaarSkyPass.js, compute fwidth star anti-aliasing on the continuous normalized ray direction d rather than cube-face coordinates gp, or 1-px bright seams appear along skybox face boundaries."
  - "Shared relay room identity BAZAAR_ROOM (mapId 4000000009, buildingKey 77000002) strips and restores sharedOrigin = bazaarOrigin on poses, while pseudo-archives 38351..38352 and negative model IDs -38350..-38351 stay unique in pseudoArchives.js."
dfu: []
tags:
  - bazaar-betwixt
  - psijic
  - portal
  - rendering
---

# Bazaar Betwixt Sanctum, Spatial Seam, and Aurbic Sky

Gated behind `contentOn('bazaarBetwixt')`, Envoy Valenis watches beside the Mages Guild in Gothway Garden (`regionIndex = 17`, `mapId = 206728581`, pixel `(109, 159)`) and parts a 60-second spatial seam (`BAZAAR_PORTAL_TOTAL_MS = 60_000`) into a shared Artaeum pocket sanctum (`interior:m4000000009.77000002`).

- **Spatial & Wire Rules (`src/systems/bazaarBetwixt.js`):** Defines deterministic Gothway placement, planar crossing hysteresis (`bazaarStepAcross`), dynamic dome, crag, and waterfall helpers, and wire validation (`validBazaarPortalWord`) for optional multiplayer pose field `bz: { i, r }` within `BAZAAR_PORTAL_PEER_REACH = 48` meters.
- **Meshes, Art, & Shaders (`bazaarBetwixtModel.js`, `bazaarBetwixtArt.js`, `bazaarSkyPass.js`, `bazaarPortalPass.js`):** Builds procedural Ceporah stonework, Artaeum ruins, and the off-center Ceporah Citadel (`-38350`, `-38351`); snaps materials (`BAZAAR_ROOM_ARCHIVE = 38352`) and hooded sprites Valenis and Master Celarus (`BAZAAR_NPC_ARCHIVE = 38351`, `177_4` fallback) through `dfLook` (`releaseBazaarArt`); renders the early-Z Aurbic sky (`lod` and `reducedMotion` aware), dual `960x600` portal FBOs, Hard-Light Causeway, waterfalls, Scrying Pool, and 36-strand cosmic silk Loom (`disposeBazaarPortalGpu`).
- **Audio & Room Lifecycle (`bazaarAudio.js`, `bazaarBetwixtRoom.js`):** Registers the 42 BPM 24-bar `BAZAAR.HMI` score, 3D vault and chancel resonance, waterfalls, and Psijic footstep chimes; handles `ChoiceWindow` dialogues (`bazaarbetwixt.*`), indoor save/Recall restoration (`matchesSave`, `restoreSaved`), non-portal teardown (`forceLeave`), and `unloadGothwayResources`.
