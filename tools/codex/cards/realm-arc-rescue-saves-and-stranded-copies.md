---
slug: realm-arc-rescue-saves-and-stranded-copies
title: "Rescue Saves, Page-Hide Checkpoints, and Stranded Copies"
domain: saves
kind: subcard
parent: realm-arc-overview
files:
  - src/saves/realmSaves.js
  - src/saves/onlineCheckpoint.js
  - src/saves/realmUnsavedNotice.js
  - src/net/realmSaveCodec.js
  - src/items/heldOut.js
  - server-account/src/realm.js
  - server-account/src/service.js
routes: []
tables:
  - realm_characters
replacesBible:
  - "06-Systems/Realm-Arc.md"
related:
  - realm-arc-overview
  - realm-saves-and-mod-save-hooks
invariants:
  - "A checkpoint the service did not answer is kept on-device by `keepUnsent` (keyed by character id, seq, and lease) and re-offered via `readUnsent` and `claimUnsent`; `forgetUnsent` clears it once acknowledged."
  - "`sweepUnsent` discards a device copy when the service row sequence has advanced past it; a copy that lost to newer play is set aside as stranded (`readStranded`, `realmStrandedText`) and announced, never silently dropped."
  - "Copies over `REALM_UNSENT_PACK_OVER` (512 KiB of text) are stored as gzip plus base64 under the `REALM_UNSENT_PACKED` ('gzip64:') prefix via `packUnsent` and `unpackUnsent`."
  - "Items staged out of the pack on a trade counter are recorded by `holdOut` and `heldOutOf` so every snapshot still carries them."
traps:
  - "`REALM_MAX_BYTES` (`SAVE_MAX_BYTES`, 4 MiB) bounds the request; `REALM_TEXT_MAX_BYTES` (16 MiB) bounds the unpacked text. `gunzipText` and `saveTextOf` must enforce the 16 MiB cap to stop gzip bombs."
  - "Checkpoints run every `ONLINE_CHECKPOINT_MS` (300,000 ms), at `whenPageHides`, and via `createSaveSoon`; do not assume a shorter periodic timer covers crashes."
dfu: []
tags:
  - saves
  - rescue
  - gzip
  - checkpoints
  - stranded
---

# Rescue Saves, Page-Hide Checkpoints, and Stranded Copies

Online checkpoint scheduling (`src/saves/onlineCheckpoint.js`) pairs with on-device rescue storage (`src/saves/realmSaves.js`) and bounded gzip transport (`src/net/realmSaveCodec.js`) so unacknowledged saves survive tab closes without letting stale device state overwrite newer cloud progress.

## Checkpoint Triggers and Staged Items

- **Timers and page-hide flushes (`src/saves/onlineCheckpoint.js`, `src/saves/realmSaves.js`):** `checkpointWhenDue` gates the periodic `ONLINE_CHECKPOINT_MS` (`300,000` ms) timer, while `whenPageHides` and `createSaveSoon` trigger immediate flushes on visibility changes or settled transactions.
- **Counter-staged items (`src/items/heldOut.js`):** While items sit on a trade counter outside the pack, `holdOut` and `heldOutOf` attach them to outgoing snapshots so an interrupted session never loses staged goods.

## On-Device Rescue, Compression, and Stranded Copies

- **Unsent cache (`src/saves/realmSaves.js`, `src/saves/realmUnsavedNotice.js`):** If a checkpoint goes unanswered past `REALM_UNSENT_GRACE_MS` (`1,500` ms, or immediately when hidden), `keepUnsent` caches the payload by character id, sequence, and lease. `readUnsent` and `claimUnsent` re-offer it on reconnect, `forgetUnsent` clears it once acknowledged, and `watchRealmUnsaved` surfaces repeated failures.
- **Stranded fallback and gzip bounds (`src/net/realmSaveCodec.js`, `server-account/src/realm.js`, `server-account/src/service.js`):** Payloads above `REALM_UNSENT_PACK_OVER` (`512` KiB) pack under `REALM_UNSENT_PACKED` (`'gzip64:'`) via `packUnsent` and `unpackUnsent`. Transport accepts requests up to `REALM_MAX_BYTES` (`4` MiB), while `isGzip` (`0x1f 0x8b`), `gunzipText`, `saveTextOf`, and `realmSaveTextOf` enforce `REALM_TEXT_MAX_BYTES` (`16` MiB). When `sweepUnsent` sees a newer service sequence in `realm_characters`, losing copies move to stranded storage (`readStranded`, `realmStrandedText`).
