---
slug: poi-runtime-and-world-builder
title: POI Runtime and World Builder
domain: poi
kind: overview
files:
  - src/poi/poiLive.js
  - src/poi/poiFeed.js
  - src/poi/poiSettle.js
  - tools/poi-editor/src/liveLink.js
  - server-account/src/poi.js
  - server-account/src/poiTrade.js
  - src/poi/poiDmRuntime.js
  - src/poi/poiTradeLaw.js
routes:
  - /v1/poi/trade
  - /v1/poi/event-claim
tables:
  - poi_docs
  - poi_revs
  - poi_assets
  - poi_trade_claims
  - poi_txn_log
related:
  - realm-saves-and-mod-save-hooks
  - pixel-streaming-and-origin-shift
invariants:
  - Both `server-account/src/poi.js` and `src/poi/poiFeed.js` validate live POI documents with `poiDocProblems` and verify content-addressed assets by SHA-256 hex digest.
  - "`/v1/poi/trade` and `/v1/poi/event-claim` settle against the realm checkpoint under lease and sequence guards with idempotent `txnId` receipts in `poi_txn_log`."
  - "`deviceClaims` copies a legacy `event/<key>` claim row to its recipe-claim name with the larger count and time, never a sum, matching server migration 0209, unless the saved claims already carry the current `names` marker."
  - "`GIVE_MAX` (40 records) and `MATERIALS` copy `GIVE_MAX` in `server-account/src/poiTrade.js` and the armor and weapon material rules of `mintGift` in `staffGive.js`, so offline and online grants must change together."
  - "`readsOnlyKept` mirrors the same-named check in `server-account/src/poiTrade.js`: only `character` and `poi_global` variables count as saved by the service, so an online condition on any other scope is judged by neither side."
  - "When either branch of an event takes items or gold, the claim sends the branch and a hand even if the hand is empty, so the service never chooses a branch or an item on its own."
  - "`poiSettle.js` is shared by `server-account/src/poiTrade.js` and the offline game, so a trade or event requirement must mean the same item in both, and its functions must not change the save's shape."
  - "Everything `poiTradeLaw.js` imports must live under `src/` so the account service can load it, and its item checks must keep matching `mintGift` in `server-account/src/staffGive.js`."
  - "`poiSettleProblems` reports any settled recipe or event whose condition reads a variable the service does not keep, because online the service refuses to judge it and the recipe or event could never run."
  - "`refresh` during an ask already in flight sets `again` and asks once more when it returns, never dropping the request, because the ask in flight may have left before the approval landed."
traps:
  - "`poiFeed.js` caches feeds scoped by service URL and drops stale isolate responses (`body.v < floor`); missing URL scoping mixes feeds across servers."
  - Chosen item trades (`takeChosen`) must match `handRecord` through `recordIsOffered` within `HAND_MAX` (`32`), or players can spend unmatched inventory items.
  - "`handOf` calls `stampItemIds` before `handRecord` copies each record, so the hand sent to the service carries the same item ids that `onlineCheckpoint` stamps; copying first sends ids the checkpoint never sees."
  - "`takeStacks` mutates `save.items` and the remaining records in place, because callers hold live references to both; copying the list would leave those callers with stale data."
tags:
  - poi
  - world-builder
  - live-link
  - settlement
  - assets
---

# POI Runtime and World Builder

Approved Points of Interest stream from the account service without client deploys, while builders preview drafts locally.

- **`/play/?live` preview link:** `createLiveLink` (`tools/poi-editor/src/liveLink.js`) opens `/play/?live&nointro` and broadcasts open drafts on `BroadcastChannel` (`POI_LIVE_CHANNEL = 'bunnyfall-poi-live'`). `createPoiLive` (`src/poi/poiLive.js`) checks `liveDraftOk` and mounts local overlays via `feed.setOverlay` (disabled online).
- **`/v1/poi/live` ETag feed:** `createPoiFeed` (`src/poi/poiFeed.js`) reads cached POIs (`POI_FEED_CACHE_KEY`) scoped to the active service URL, polls `/v1/poi/live` every `POI_FEED_POLL_MS` (`60_000` ms) with `If-None-Match` (`304` when unchanged), validates each document with `poiDocProblems`, and drops stale isolate responses (`body.v < floor`).
- **Content-addressed assets:** Builders upload assets to `server-account/src/poi.js` keyed by SHA-256 hex digest (public for `POI_LIVE_ASSET_MAX_AGE_S = 86400` seconds only while referenced by an approved live POI). `feed.asset` verifies SHA-256 digests on cached and fetched bytes and evicts LRU entries past `POI_ASSET_MEMORY_BYTES` (`64` MiB).
- **Server-settled trades and events:** `/v1/poi/trade` and `/v1/poi/event-claim` (`server-account/src/poiTrade.js`) settle against the saved character checkpoint under lease and sequence guards, applying `takeStacks` or `takeChosen` (`hand` picks verified via `handRecord` and `recordIsOffered` in `src/poi/poiSettle.js`, `HAND_MAX = 32`), enforcing `poi_trade_claims` limits, and recording idempotent `txnId` receipts.
