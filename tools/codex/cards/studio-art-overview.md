---
slug: studio-art-overview
title: "Studio Art Folder, Roster, and Slot Catalog"
domain: rendering
kind: overview
parent: null
files:
  - public/art/studio/README.md
  - public/art/studio/artists.json
  - src/systems/studioArt/studioArt.js
  - scripts/studioArtIndex.mjs
  - src/scenes/shared.js
  - vite.config.js
  - tools/studioArt.mjs
  - src/systems/studioArt/studioSlots.js
  - src/tools/studioLab.js
  - studio.html
routes: []
tables: []
replacesBible:
  - "07-Rendering/Studio-Art.md"
related:
  - studio-art-texture-tier-and-painted-doors
  - webgl2-renderer-and-textures
invariants:
  - "installStudioArt never throws; a missing listing gives 0 and a listing that fails to read gives 0 and is retried at the next boot."
  - "The listing art/studio/index.json is produced by the studioArtIndex Vite plugin (dev server and build) and is never committed to the tree."
  - "Slots marked cutout upload as cutouts (a texel under half opaque becomes a hole); every other slot is drawn solid."
traps:
  - "Asked dyes must match the canonical token exactly (askedDye): _Iron yes; _iron and _Unchanged no."
  - "When two files name the same key, the first in sorted path order wins (studioEntries)."
  - "Slot lists are computed at runtime, so never hardcode slot counts in docs."
dfu: []
tags:
  - studio
  - art
  - textures
  - STUDIO1
  - slots
  - templates
---

# Studio Art Folder, Roster, and Slot Catalog

Hand-authored port textures live under `public/art/studio/<artist>/`, where `public/art/studio/artists.json` tracks the roster (`trashBattery`, `Redclaw`, and `maya`). At boot, `ensureAudio` in `src/scenes/shared.js` calls `installStudioArt` (`src/systems/studioArt/studioArt.js`), which never throws: a missing or unreadable listing returns `0` and retries on the next boot.

## Folder Rules, Listing Plugin, and Dyes

- **Index generation and CLI validation (`scripts/studioArtIndex.mjs`, `vite.config.js`, `tools/studioArt.mjs`):** The `studioArtIndex` Vite plugin builds `art/studio/index.json` during dev and production builds, so `index.json` is never committed. `node tools/studioArt.mjs` enforces `STUDIO_MAX_SIDE = 2048`, `STUDIO_MAX_BYTES = 4` MiB, `STUDIO_NAME`, `STUDIO_RESERVED`, and `STUDIO_LITTER`.
- **File naming and resolution (`studioFile`, `askedDye`, `studioEntries`):** Filenames follow Daggerfall Unity conventions (such as `38181_1-0.png`) with an optional `--` suffix (`STUDIO_LABEL`). Canonical dye tokens must match `askedDye` case-sensitively (for example, `_Iron` is valid, while `_iron` and `_Unchanged` are rejected). When two files map to one key, `studioEntries` picks the first in sorted path order.
- **Catalog and lab (`src/systems/studioArt/studioSlots.js`, `src/tools/studioLab.js`, `studio.html`):** `STUDIO_SETS` defines eight runtime slot groups (`wagons`, `galleon`, `carrack`, `largeboat`, `hangings`, `yards`, `port`, and `lefay`), each routed to a `'painted'` or `'vendor'` door, with cutout slots punching alpha holes below 50% opacity. `studio.html` previews active slots and exports named templates.
