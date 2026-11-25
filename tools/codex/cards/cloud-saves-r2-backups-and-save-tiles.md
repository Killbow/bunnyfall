---
slug: cloud-saves-r2-backups-and-save-tiles
title: "Cloud Saves, R2 Backups, and Save Tiles"
domain: account
kind: subcard
parent: accounts-and-cloud-saves-overview
files:
  - server-account/src/saves.js
  - server-account/src/service.js
  - server-account/src/routes/storageRoutes.js
  - server-account/migrations/0003_saves.sql
  - src/saves/cloudSaves.js
  - src/saves/saveTransfer.js
  - src/ui/saveTile.js
  - src/ui/enhancedMenu.js
routes:
  - /v1/saves
tables:
  - saves
replacesBible:
  - "06-Systems/Accounts-And-Cloud-Saves-Arc.md"
related:
  - accounts-and-cloud-saves-overview
  - realm-saves-and-mod-save-hooks
  - realm-arc-rescue-saves-and-stranded-copies
invariants:
  - "Cloud saves are for linked accounts only; guests get `not-registered`."
  - "`saves` rows key on (`player_id`, `character_id`, `save_name`); blobs live in R2 at `saveKey` with `data` and `shot` parts."
  - "Bounds: `SAVE_MAX_BYTES` 4 MiB, `SHOT_MAX_BYTES` 256 KiB, `SAVES_MAX` 60, `SAVE_NAME_MAX` 64 (`server-account/src/service.js`)."
  - "Restore goes through `importSlots` and never overwrites another slot; `pullSlot` with `replaces` deletes the old local copy only after a successful import."
traps:
  - "Save names are player-typed; every R2 key and URL segment must use `encodeURIComponent` or names like `danger#1` truncate."
  - "`newerBackup` in `src/ui/saveTile.js` must flag a newer cloud copy so an older local slot does not show 'Backed up'; restore or replace takes a two-press confirm."
dfu: []
tags:
  - cloud-saves
  - saves
  - r2
  - account
---

# Cloud Saves, R2 Backups, and Save Tiles

Cloud save indexing (`server-account/src/saves.js`, `server-account/migrations/0003_saves.sql`) and R2 blob storage (`server-account/src/routes/storageRoutes.js`) provide manual slot backup and transfer for linked accounts (`not-registered` for guests).

- **Routes, keys, and bounds:** `/v1/saves` lists account backups, while `savePathOf` (`server-account/src/service.js`) matches parameterized `/v1/saves/<characterId>/<saveName>[/data|/shot]` paths with `CHAR_ID_RE` (`/^[A-Za-z0-9_-]{4,64}$/`). D1 `saves` rows key on (`player_id`, `character_id`, `save_name`), and R2 stores payload and screenshot blobs under `saveKey` (`data` and `shot` parts). Every URL segment and R2 key applies `encodeURIComponent` so player-typed names containing `#` or spaces never truncate. Limits in `server-account/src/service.js` enforce `SAVE_MAX_BYTES` (4 MiB), `SHOT_MAX_BYTES` (256 KiB), `SAVES_MAX` (60 slots), and `SAVE_NAME_MAX` (64 characters).
- **Client transfer discipline:** `src/saves/cloudSaves.js` exposes `pushSlot`, `pullSlot`, and `removeCloudSlot`. Restores pass through `importSlots` (`src/saves/saveTransfer.js`) and never overwrite an unrelated local slot; calling `pullSlot` with `replaces` deletes the old local save only after the import succeeds.
- **Save tile states:** `src/ui/saveTile.js` and `src/ui/enhancedMenu.js` render eight cloud states: `off`, `wait`, `none`, `backed`, `newer`, `busy`, `error`, and `only`. `newerBackup` detects when the cloud timestamp exceeds the local slot so stale local saves show `newer` instead of `Backed up`, and restoring or replacing requires a two-press confirmation.
