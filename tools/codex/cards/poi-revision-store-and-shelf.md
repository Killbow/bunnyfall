---
slug: poi-revision-store-and-shelf
title: POI Revision Store, Quotas, and Library Shelf
domain: poi
kind: subcard
parent: poi-editor-and-approvals-overview
files:
  - server-account/src/poi.js
  - server-account/src/service.js
  - server-account/src/index.js
  - server-account/migrations/0116_poi.sql
  - src/poi/poiShelf.js
  - src/ui/poi/poiReviewPanel.js
routes:
  - /v1/poi/:route
tables:
  - poi_docs
  - poi_revs
  - poi_rev_assets
  - poi_assets
  - poi_upload_days
  - poi_feed
  - poi_shelf
replacesBible:
  - "06-Systems/POI-Editor-Arc.md"
related:
  - poi-editor-and-approvals-overview
  - poi-document-and-mesh-law
  - poi-runtime-and-world-builder
invariants:
  - "`poi_revs.state` is restricted to `'draft'`, `'submitted'`, `'approved'`, `'rejected'`, or `'withdrawn'`, while `kind` is `'doc'`, `'retire'`, or `'rollback'`."
  - "Unique partial indexes `poi_revs_one_draft` and `poi_revs_one_retire` allow at most one open `'doc'` draft per author per POI and one pending retirement per POI."
  - "`reviewPoi` refuses to record a decision and returns `poi-changed` whenever the provided `docSha` differs from the stored `doc_sha`."
traps:
  - "Saving a draft after submitting a revision does not fail; `savePoiDraft` leaves the queued submission untouched and inserts a new draft revision alongside it."
  - "`withdrawPoi` returns a submitted `'doc'` revision to `'draft'` only when the author has no other open draft for that POI; otherwise, and always for `'retire'` revisions, the state becomes `'withdrawn'`."
dfu: []
tags:
  - poi
  - revisions
  - approvals
  - quota
  - shelf
  - d1
---

# POI Revision Store, Quotas, and Library Shelf

`server-account/src/poi.js` (backed by `server-account/migrations/0116_poi.sql` and dispatched via `/v1/poi/:route` in `server-account/src/index.js` and `poiPathOf` in `server-account/src/service.js`) manages content-addressed assets, revision workflows, approval queues, and the shared library shelf (`src/poi/poiShelf.js`, `src/ui/poi/poiReviewPanel.js`).

- **Revisions and review routes:** Builders save drafts (`POST /v1/poi/draft`), submit (`POST /v1/poi/submit`), withdraw (`POST /v1/poi/withdraw`), request retirement (`POST /v1/poi/retire`), and inspect revisions (`GET /v1/poi/me`, `GET /v1/poi/list`, `GET /v1/poi/doc/<id>`). Approvers read `GET /v1/poi/queue`, decide submissions (`POST /v1/poi/review`), and restore prior approved revisions (`POST /v1/poi/rollback`). `rollbackPoi` restores an approved `'doc'` revision (even on a retired POI) by inserting an approved revision with `kind = 'rollback'` and `base_rev`. Quotas enforce `POI_OPEN_REVS` (`200` open revisions per builder), `POI_QUEUE_MAX` (`50`), and `POI_LIST_REVS` (`20`).
- **Asset uploads and live visibility:** `putPoiAsset` (`PUT /v1/poi/asset/<sha>`) verifies the SHA-256 digest, decodes the mesh or sniffs the texture header, and reserves bytes against `POI_UPLOAD_DAY_BYTES` (`1` GiB per UTC day in `poi_upload_days`) before the R2 put, refunding on failure. `poi_rev_assets` tracks assets referenced by live revisions and sets `poi_assets.live`, gating anonymous `GET /v1/poi/asset/<sha>` responses (`POI_LIVE_ASSET_MAX_AGE_S = 86400`). `GET /v1/poi/live` caches feed state in `poi_feed` for `POI_FEED_KEEP_MS` (`15,000` ms) with ETag `poiFeedTag`.
- **Library shelf:** `/v1/poi/shelf`, `/v1/poi/shelf/<lib-id>`, and `/v1/poi/unshelve` store reusable parts in `poi_shelf`, capped at `POI_SHELF_MAX` (`2000` active) and `POI_SHELF_EVER` (`5 * POI_SHELF_MAX`).
