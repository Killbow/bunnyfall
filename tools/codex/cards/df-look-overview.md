---
slug: df-look-overview
title: "Painted Port Art in the Daggerfall Palette"
domain: render
kind: overview
parent: null
files:
  - src/world/dfLook.js
  - src/scenes/dataPipeline.js
  - src/world/galleonArt.js
  - src/world/carrackArt.js
  - src/world/largeBoatArt.js
  - src/world/townPictures.js
  - src/world/wagonModels.js
  - src/travel/horseCartPool.js
  - src/travel/caravanRoomHost.js
  - src/travel/portHost.js
  - src/world/merchantYards/merchantYardsHost.js
  - src/world/lefayMonumentHost.js
  - src/systems/studioArt/studioArt.js
  - src/systems/studioArt/studioSlots.js
routes: []
tables: []
replacesBible:
  - "01-Overview/DF-Art.md"
related:
  - df-look-palette-and-grain
  - df-look-ship-and-caravan-windows
  - wagons-caravan-room-paint-and-visits
  - ship-livery-flags-and-plaques
  - shipyards-crew-halls-and-lighthouses-overview
invariants:
  - "Painted pictures are passed through `dfLook(pic, lookSeed(archive, record))` at upload/stand-in build; with no palette set `dfLook` returns the picture unchanged."
  - "Studio art (`public/art/studio/`) replaces painted art and bypasses `dfLook`; `wearPainted` checks studio art first, wagon icons use `paintedReplacement`."
traps:
  - "The old DF-ART modules `src/world/classicArt.js` and `src/world/wagonWheelArt.js` are gone; wagon wheels live in `src/world/wagonArt.js`. Do not reintroduce ARENA2 record swaps for the own models of the port."
  - "Glow masks and beacon fire light stay painted and are uploaded without `dfLook`."
dfu: []
tags:
  - dflook
  - art
  - palette
  - studio-art
---

# Painted Port Art in the Daggerfall Palette

Rather than swapping custom port models to unrelated `ARENA2` textures (the removed `src/world/classicArt.js` and `src/world/wagonWheelArt.js` modules), `src/world/dfLook.js` and `src/scenes/dataPipeline.js` quantize procedural port textures into the classic 256-color Daggerfall palette with deterministic grain at upload or stand-in build time.

- **Palette pass and seeds (`dfLook` and `lookSeed`):** Each painted picture runs through `dfLook(pic, lookSeed(archive, record))`; with no palette set via `setDfLookPalette`, `dfLook` returns it unchanged. Recolored wagon paints reuse the seed of their built record, and ship night-window twin records reuse the seed of their daytime record so grain aligns across states. Glow masks and beacon fire light upload without `dfLook`.
- **Archive coverage:** Ship hulls and decks (`38131`, `38141`, and `38171`) pass through `shipStandIns` in `src/world/galleonArt.js`, `src/world/carrackArt.js`, and `src/world/largeBoatArt.js`. Town hangings and rugs (`38202`) use `townPictureEntries` in `src/world/townPictures.js`. Wagons and caravan interiors (`38181`) quantize through `uploadWagonPicture` (`src/travel/horseCartPool.js`, `src/travel/caravanRoomHost.js`), `paintCaravanRoom`, and `wagonIconSource` (`src/world/wagonModels.js`). Merchant yards (`38221`, `src/world/merchantYards/merchantYardsHost.js`), shipyards and lighthouses (`38231`, `paintArt` in `src/travel/portHost.js`), and the LeFay monument (`38211`, `ensureMesh` in `src/world/lefayMonumentHost.js`) follow the same path.
- **Studio art bypass:** Hand-authored replacements under `public/art/studio/` (`src/systems/studioArt/studioArt.js`, `src/systems/studioArt/studioSlots.js`) bypass `dfLook` via `wearPainted` and `paintedReplacement`.
