---
slug: studio-art-texture-tier-and-painted-doors
title: "Studio Art Vendor Tier and Painted Doors"
domain: rendering
kind: subcard
parent: studio-art-overview
files:
  - src/systems/studioArt/studioArt.js
  - src/render/textureReplacement.js
  - src/scenes/dataPipeline.js
  - src/formats/textureFile.js
  - src/formats/color32Order.js
  - src/mods/dfmodTextures.js
  - src/world/galleonArt.js
  - src/world/townPictures.js
  - src/world/wagonArt.js
  - src/travel/horseCartPool.js
  - src/travel/caravanRoom.js
  - src/world/merchantYards/merchantYardsHost.js
  - src/travel/portHost.js
  - src/world/lefayMonumentHost.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Studio-Art.md"
related:
  - studio-art-overview
  - webgl2-renderer-and-textures
  - df-look-overview
invariants:
  - "ASYNC NEVER DROPS: a picture that arrives late through wearPainted applies only to the newest wear of its slot."
  - "A studio picture is worn as drawn; DF-LOOK grain and palette are not applied."
traps:
  - "paintedReplacement defaults to bottom-up color32 order (the wagons); the yards, port and monument must pass { topDown: true }."
dfu: []
tags:
  - studio
  - vendor-tier
  - wearPainted
---

# Studio Art Vendor Tier and Painted Doors

`src/systems/studioArt/studioArt.js`, `src/render/textureReplacement.js`, and `src/scenes/dataPipeline.js` route hand-authored studio textures through either the vendor archive replacement tier or direct procedural painted doors, bypassing `dfLook` palette quantization and grain so studio assets render as drawn.

## Vendor Tier Priority and Preloading

- **Tier registration and hold (`addVendorTextures`, `holdTextureTiers`):** Studio files register via `addVendorTextures` with `studio: true`, ranking above bundle-tier texture packs and `.dfmod` archives while yielding to a player-supplied loose pack (`liveEntry`). Studio textures display even when Replace Game Artwork is disabled or the client runs in Classic mode. On initial archive load, `holdTextureTiers(asked, STUDIO_HOLD_MS = 3000)` waits up to three seconds for the studio listing.
- **Predecode and ground layers (`src/mods/dfmodTextures.js`):** Custom port archives above `LAST_CLASSIC_TEXTURE_ARCHIVE` (`511`) predecode at `PRELOAD_CONCURRENCY` (`16`) at a time, and ground tile sets merge studio records via `dfmodGroundLayers`.

## Painted Doors and Row Orientation

- **Late-arrival guard and row order (`wearPainted`, `paintedReplacement`):** `wearPainted` tracks slot generations (`ASYNC NEVER DROPS`) so a late async decode applies only to the latest wear of its slot. Because `paintedReplacement` defaults to bottom-up `color32` row order (`src/formats/color32Order.js`, `src/formats/textureFile.js`) for wagons (`LOOK_RECORD_STRIDE = 100` in `src/world/wagonArt.js`, `src/travel/horseCartPool.js`, and `src/travel/caravanRoom.js`), top-down callers in `src/world/merchantYards/merchantYardsHost.js`, `src/travel/portHost.js`, and `src/world/lefayMonumentHost.js` must pass `{ topDown: true }`.
