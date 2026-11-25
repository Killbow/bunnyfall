---
slug: port-doctrine-approved-art-exceptions
title: "Approved Texture and Sprite Exceptions"
domain: assets
kind: subcard
parent: port-doctrine-scope-and-departures
files:
  - tools/vanillaEnhancedVendor.mjs
  - tools/environmentModsExtract.mjs
  - public/art/vanilla-enhanced
  - public/art/sands-of-the-alikr
  - public/art/snowfall
  - tools/dexExtract.mjs
  - src/formats/derivedTexture.js
  - src/player/layeredArmor.js
  - tools/layered-armor/listing.mjs
  - public/art/daggerfall-enemy-expansion-repainted
  - vendor/layered-armor
  - vendor/class-skins/Textures
routes: []
tables: []
replacesBible:
  - "01-Overview/Port-Doctrine.md"
related:
  - port-doctrine-scope-and-departures
  - arena2-data-gate-and-doctrine
  - webgl2-renderer-and-textures
invariants:
  - "tools/vanillaEnhancedVendor.mjs reads the Vanilla Enhanced repository at pinned VE_COMMIT (manifests 3.4.7) and writes files byte for byte."
  - "public/art/sands-of-the-alikr/ holds exactly the 47 loose TEXTURE.002 records."
  - "public/art/snowfall/ holds the 168 winter records (TEXTURE.103, .303, .403), the snow albedo, and three surface-mask .bytes files."
  - "Only REPAINTED_ARCHIVES in tools/dexExtract.mjs ship (Bounty Hunter 1504, riders 1530-1533, King Lysandus 1609, and others); records identical to the player TEXTURE data are rebuilt at runtime via composeDerivedPicture in src/formats/derivedTexture.js."
  - "every shipped picture is measured by outline; an archive following Daggerfall silhouettes outside REPAINTED_ARCHIVES and SILHOUETTE_ALLOWED is rejected."
  - "tools/layered-armor/listing.mjs records each vendor/layered-armor file sha256."
traps:
  - "Do not hand-edit these directories; regenerate via the extract tools so the generated listings stay authoritative."
  - "src/player/layeredArmor.js imports vendor/layered-armor/manifest.json and cloak/manifest.json; adding strips without updating manifests leaves them unused."
dfu: []
tags:
  - textures
  - vendor
  - exceptions
  - snowfall
  - vanilla-enhanced
  - enemies
  - sprites
  - layered-armor
  - dex
---

# Approved Texture and Sprite Exceptions

Approved redistributable art packs live in dedicated `public/art/` and `vendor/` directories and are populated through deterministic extraction scripts rather than manual edits.

## Environment and Enemy Archives

- **Vanilla Enhanced and environment mods:** `tools/vanillaEnhancedVendor.mjs` exports `VE_COMMIT` (manifests `3.4.7`) and copies files byte for byte into `public/art/vanilla-enhanced/`. `tools/environmentModsExtract.mjs` populates `public/art/sands-of-the-alikr/` with 47 loose `TEXTURE.002` records (omitting mod screenshots) and `public/art/snowfall/` with 168 winter records (`TEXTURE.103`, `.303`, and `.403`), the snow albedo, and three surface-mask `.bytes` files.
- **Enemy Expansion (`tools/dexExtract.mjs`):** Only `REPAINTED_ARCHIVES` ship in `public/art/daggerfall-enemy-expansion-repainted/` (774 entries, including Bounty Hunter `1504`, riders `1530-1533`, and King Lysandus `1609`). Every shipped image is measured by outline so any archive following classic silhouettes outside `REPAINTED_ARCHIVES` and `SILHOUETTE_ALLOWED` is rejected, while records identical to player `TEXTURE` data rebuild at runtime via `composeDerivedPicture` in `src/formats/derivedTexture.js`.

## Layered Armor and Class Skins

`tools/layered-armor/listing.mjs` records the `sha256` of every file under `vendor/layered-armor/`, while `src/player/layeredArmor.js` imports `vendor/layered-armor/manifest.json` and `cloak/manifest.json`. Repainted class skins live in `vendor/class-skins/Textures/`.
