---
slug: realm-saves-and-mod-save-hooks
title: Realm Saves, Checkpoints, and Mod Save Hooks
domain: saves
kind: overview
files:
  - src/saves/save.js
  - src/saves/modSaveData.js
  - src/saves/realmSaves.js
  - src/saves/realmCustoms.js
  - src/saves/onlineCheckpoint.js
  - src/net/realmSaveCodec.js
  - src/characters/renownLayer.js
  - server-account/src/realm.js
  - server-account/src/routes/storageRoutes.js
routes:
  - /v1/realm
  - /v1/realm/customs
tables:
  - realm_characters
related:
  - account-routes-and-gate-wall
  - poi-runtime-and-world-builder
invariants:
  - Living online realm characters (`realm_characters`, up to `6` per account) store authoritative saves in R2, gated by a 32-hex `lease` and `seq + 1` on `PUT /v1/realm/<id>/data`.
  - "`offlineVitals` strips online `renownHp`, `renownMp`, and fold magicka via `keepFraction` so online vitals never write into saved stats."
  - "`restoreModSaveRecords` wraps each mod restore in `try`/`catch` and `newGameModSaveRecords` resets mod state on new games."
traps:
  - "Checkpoint payloads gzip-compress up to `REALM_TEXT_MAX_BYTES` (`16 MiB`) uncompressed; byte-length checks alone allow gzip bombs or reject valid packed saves."
  - Settled online actions must trigger `createSaveSoon` immediately instead of waiting for `ONLINE_CHECKPOINT_MS` (`300_000` ms), or crashes revert client inventory after D1 already settled.
  - "Every realm answer that grants a lease (create, customs, and join) carries `gzip: true`, and the client packs checkpoints only after it receives that flag, so a new client against an older service sends plain text."
tags:
  - saves
  - realm
  - checkpoints
  - mods
  - customs
---

# Realm Saves, Checkpoints, and Mod Save Hooks

`snapshotPlayer` and `restorePlayer` in `src/saves/save.js` serialize player, world, and mod state. Online realm characters (`server-account/src/realm.js`, up to `6` living characters per account) store authoritative saves in R2 and metadata in D1 (`realm_characters`).

- **Mod save isolation (`src/saves/modSaveData.js`):** `registerModSaveData` keys each mod by vendor in `snap.modData`. `restoreModSaveRecords` wraps each restore in `try`/`catch` so broken mod data cannot abort loading, and `newGameModSaveRecords` resets mods on new game so static state never leaks across characters.
- **Leases, sequences, and gzip (`src/saves/realmSaves.js`, `src/net/realmSaveCodec.js`):** Joining mints a 32-hex `lease`. `PUT /v1/realm/<id>/data` requires `x-realm-lease` and `seq + 1`, writing a fresh R2 object while retaining `prev`. `gzipText` and `saveTextOf` compress payloads (`0x1f 0x8b`) up to `REALM_TEXT_MAX_BYTES` (`16 MiB`).
- **Checkpoints (`src/saves/onlineCheckpoint.js`):** Saves run every `ONLINE_CHECKPOINT_MS` (`300_000` ms) and immediately after settled actions via `createSaveSoon`, caching unanswered writes under `REALM_UNSENT_PREFIX`.
- **Customs and offline vitals (`src/saves/realmCustoms.js`, `src/characters/renownLayer.js`):** `applyCustoms` migrates an offline copy once (`POST /v1/realm/customs`), settling loans, capping liquid gold, and flagging deeds non-refundable. `offlineVitals` strips online `renownHp`, `renownMp`, and fold magicka via `keepFraction`.
