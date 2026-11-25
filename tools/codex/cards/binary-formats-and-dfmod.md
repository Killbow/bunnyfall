---
slug: binary-formats-and-dfmod
title: Binary Format Readers and DFMod Import
domain: formats
kind: overview
files:
  - src/formats/bsaFile.js
  - src/formats/textureFile.js
  - src/formats/imgFile.js
  - src/formats/cifRciFile.js
  - src/formats/arch3dFile.js
  - src/formats/blocksFile.js
  - src/formats/mapsFile.js
  - src/formats/woodsFile.js
  - src/formats/skyFile.js
  - src/formats/mwBsaFile.js
  - src/formats/unityBundle.js
  - tools/importDfmod.mjs
invariants:
  - "Binary parsers in src/formats/ read immutable Uint8Array views or range-sliced byte sources with zero DOM dependencies."
  - "arch3dFile.js applies the 905 per-record byte fixes from arch3dPatch.js onto private copies rather than mutating shared BSA buffers."
  - "src/formats/unityBundle.js reads UnityFS 7 LZ4 and LZ4HC bundles from embedded type trees while rejecting LZMA archives."
traps:
  - "Cloning multi-hundred-megabyte Morrowind BSA or multi-gigabyte .dfmod archives into memory hits browser limits; slice by Blob byte range instead."
  - "Asset-only .dfmod packages unpack via tools/importDfmod.mjs, whereas bundled .dll behavior must be ported manually into src/."
dfu:
  - Assets/Scripts/API/BsaFile.cs
  - Assets/Scripts/API/Arch3dFile.cs
tags:
  - formats
  - bsa
  - dfmod
  - unityfs
  - morrowind
---

# Binary Format Readers and DFMod Import

All binary parsers live in `src/formats/` and read immutable `Uint8Array` views with zero DOM dependencies so browser scenes, Web Workers, and Node tools share identical decoders.

- **Classic readers:** `bsaFile.js` (structural directory closure), `dfPalette.js`, `textureFile.js`, `imgFile.js`, `cifRciFile.js`, `arch3dFile.js` (applying 905 per-record byte fixes from `arch3dPatch.js` onto private copies), `blocksFile.js`, `mapsFile.js`, `woodsFile.js`, `skyFile.js`, and `sndFile.js`.
- **Morrowind and Unity bundles:** Optional Morrowind support (`src/formats/morrowind/`: `mwBsaFile.js`, `mwEsmFile.js`, and `mwNifFile.js`) slices 0x100 archives by `Blob` byte range rather than cloning multi-hundred-megabyte buffers. `src/formats/unityBundle.js` reads UnityFS 7 LZ4/LZ4HC bundles from embedded type trees, decoding `TextAsset` and `Texture2D` formats (including DXT1, DXT5, Crunch, and BC7) while refusing LZMA archives.
- **`.dfmod` unpacking (`tools/importDfmod.mjs`):** Unpacks a Daggerfall Unity `.dfmod` into `vendor/<slug>/` with `<slug>.dfmod.json`, text/settings files, decoded `Textures/*.png`, remuxed `Sound/*.ogg` (using `vendor/vorbis-fsb-setups/`), `inventory.json`, and `README.md`.
- **Manual C# porting:** Asset-only mods work once wired; bundled `.dll` logic is ported by hand into `src/` and credited in `src/ui/credits.js`.
