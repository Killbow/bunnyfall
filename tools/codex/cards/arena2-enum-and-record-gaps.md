---
slug: arena2-enum-and-record-gaps
title: ARENA2 Record Quirks and Repairs
domain: formats
kind: overview
files:
  - src/formats/blocksFile.js
  - src/formats/mapsFile.js
  - src/formats/textureFile.js
  - src/formats/sndFile.js
  - src/formats/cifRciFile.js
invariants:
  - "BLOCKS.BSA rejects junk record 669 (FOO) and applies all eight FixRdbData dungeon block repairs."
  - "MAPS.BSA rejects 17 empty regions out of 62 and uses 8-bit truncation for RMB letter2 block-name decoding."
  - "TEXTURE.* rejects UNSUPPORTED_FILENAMES (215, 217, 436) and falls back to uncompressed row reads on wild compression headers."
traps:
  - "WEAPON09.CIF (bow) omits the leading static wield record; MAX_WEAPON_RECORDS (64) guards against zero TotalSize loops."
  - "DAGGER.SND record 5 carries a valid 44-byte WAV header with zero PCM bytes."
dfu:
  - Assets/Scripts/API/BlocksFile.cs
  - Assets/Scripts/API/MapsFile.cs
  - Assets/Scripts/API/TextureFile.cs
  - Assets/Scripts/API/SndFile.cs
  - Assets/Scripts/API/CifRciFile.cs
tags:
  - arena2
  - formats
  - quirks
  - bsa
---

# ARENA2 Record Quirks and Repairs

Binary readers in `src/formats/` preserve original `ARENA2` anomalies and Daggerfall Unity data repairs byte-for-byte so classic assets parse without silent corruption or hangs.

- **`BLOCKS.BSA` (`src/formats/blocksFile.js`):** Record `669` is a junk entry named `FOO` rejected as `BLOCK_TYPES.Unknown`. Dungeon loading applies all eight `FixRdbData` block repairs (`994`, `945`/`946`, `958`, `975`, `1025`, `1034`, and `1036`), while `W0000009` parses non-numeric `"REF_CUBE"` to model slot `0`.
- **`MAPS.BSA` (`src/formats/mapsFile.js`):** Out of 62 regions, 17 empty regions are rejected (leaving 45 populated). RMB block-name decoding requires 8-bit truncation (`((2 * blockCharacter) & 0xff) >> 6`) for `letter2`, clamps two unterminated 32-byte location names, and shifts an Orsinium (`50015`) border block to `Z = -2`.
- **`TEXTURE.*` (`src/formats/textureFile.js`):** Rejects `UNSUPPORTED_FILENAMES` (`TEXTURE.215`, `TEXTURE.217`, and `TEXTURE.436`), while wild compression headers (`0x900`, `0x101`, and `0x100`) fall through to uncompressed row reads.
- **`DAGGER.SND` and `WEAPON09.CIF`:** `DAGGER.SND` (`src/formats/sndFile.js`) ships zero PCM bytes at record `5` behind a valid 44-byte WAV header. `WEAPON09.CIF` (`src/formats/cifRciFile.js`, bow) omits the leading static wield record, and `MAX_WEAPON_RECORDS` (`64`) prevents infinite loops on zero `TotalSize`.
