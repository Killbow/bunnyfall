---
slug: poi-editor-and-approvals-overview
title: POI Editor, Store, and Approvals
domain: poi
kind: overview
parent: null
files:
  - src/poi/poiLaw.js
  - src/poi/poiMesh.js
  - src/poi/poiEdit.js
  - src/poi/poiEditorMount.js
  - src/poi/poiHost.js
  - server-account/src/poi.js
  - server-account/src/service.js
routes:
  - /v1/poi/:route
tables:
  - poi_docs
  - poi_revs
  - poi_assets
replacesBible:
  - "06-Systems/POI-Editor-Arc.md"
related:
  - poi-runtime-and-world-builder
  - poi-document-and-mesh-law
  - poi-revision-store-and-shelf
  - poi-standing-and-in-game-editor
  - poi-gltf-uv-and-packs
invariants:
  - "Every POI document references meshes and textures only by content SHA-256 (`POI_SHA_RE`), and `poiDocProblems` runs identical validation rules in the editor, the account server, and the client feed."
  - "No revision reaches players until an approver approves a submitted revision; only `poi_docs.live_rev` streams through `/v1/poi/live`."
traps:
  - "Both the in-game editor (`?editor`) and the live preview (`?live`) appear in `ONLINE_REFUSED_FLAGS` (`src/platform/onlineLane.js`), so builders edit and preview offline."
dfu: []
tags:
  - poi
  - editor
  - approvals
  - content-addressed
  - overview
---

# POI Editor, Store, and Approvals

Points of Interest (POIs) combine a shared document and asset schema (`src/poi/poiLaw.js`, `src/poi/poiMesh.js`), a D1 and R2 revision store (`server-account/src/poi.js`), a world placement host (`createPoiHost` in `src/poi/poiHost.js`), and an editing core (`createPoiEdit` in `src/poi/poiEdit.js`) shared by the in-game `?editor` mode (`startPoiEditor` in `src/poi/poiEditorMount.js`) and the standalone World Builder (`tools/poi-editor`).

- **Roles and dynamic routing:** `poiRolesOf(player, env)` derives `{ builder, approver }` permissions from `APPROVER_HANDLES`, `BUILDER_HANDLES`, and `developerHandles(env)` (`server-account/src/titles.js`), where approvers also hold builder access. `server-account/src/index.js` dispatches `/v1/poi/:route` through `poiPathOf` (`server-account/src/service.js`). `GET /v1/poi/live` and `GET /v1/poi/asset/<sha>` run without a session, whereas `/v1/poi/me`, `/v1/poi/draft`, `/v1/poi/submit`, `/v1/poi/withdraw`, `/v1/poi/retire`, `/v1/poi/review`, `/v1/poi/rollback`, `/v1/poi/list`, `/v1/poi/doc/<id>`, `/v1/poi/queue`, `PUT /v1/poi/asset/<sha>`, `/v1/poi/shelf`, `/v1/poi/shelf/<lib-id>`, and `/v1/poi/unshelve` require an authenticated session.
- **Validation and asset pipeline:** Builders import glTF scenes, unwrap UVs, manage a shared library shelf, and upload content-addressed meshes and textures to `poi_assets`. `poiDocProblems` enforces identical validation across the editor, `server-account/src/poi.js`, and the client feed.
- **Approval gate and runtime boundary:** Draft and submitted revisions remain in `poi_revs` until an approver approves a submission or records a retirement or rollback, advancing `poi_docs.live_rev`. See `poi-runtime-and-world-builder` for `/v1/poi/live` polling, `/play/?live` local previews, and trade or event settlement.
