---
slug: poi-document-and-mesh-law
title: POI Document, Mesh, Texture, and Scene Budgets
domain: poi
kind: subcard
parent: poi-editor-and-approvals-overview
files:
  - src/poi/poiLaw.js
  - src/poi/poiLawV2.js
  - src/poi/poiMesh.js
  - src/poi/poiImage.js
routes: []
tables: []
replacesBible:
  - "06-Systems/POI-Editor-Arc.md"
related:
  - poi-editor-and-approvals-overview
  - poi-revision-store-and-shelf
  - poi-gltf-uv-and-packs
invariants:
  - "`POI_MESH_LIMITS` enforces 262,144 vertices, 3 x 1,048,576 indices, 64 submeshes, a 2048 m extent, and 24 MiB; any mesh exceeding a bound is rejected rather than truncated."
  - "`POI_IMAGE_LIMITS` accepts only PNG, JPEG, or WebP headers sniffed by `poiImageMetaOf`, up to 4096 px per side and 16 MiB."
  - "`POI_BUDGET` caps the entire scene at 1,048,576 triangles and vertices, 64 MiB of distinct asset bytes, 2 x 4096 x 4096 pixels, and a 2048 m reach."
traps:
  - "`POI_LIMITS.docBytes` (`96` KiB) applies only to v1 documents, whereas v2 documents use `POI_V2_LIMITS.docBytes` (`256` KiB); always resolve size limits through `poiDocBytesOf(v)`."
  - "Names, tags, and labels reject C0/C1 control characters, lone surrogates, U+2028/2029, and bidirectional embeds, overrides, or isolates (`UNSAID_RE`); only `about` permits newlines (`PROSE_UNSAID_RE`)."
dfu: []
tags:
  - poi
  - limits
  - mesh
  - texture
  - validation
---

# POI Document, Mesh, Texture, and Scene Budgets

`src/poi/poiLaw.js`, `src/poi/poiLawV2.js`, `src/poi/poiMesh.js`, and `src/poi/poiImage.js` validate POI documents, shelf entries, binary meshes, textures, and aggregate scene budgets across the client and account server.

- **Document versions and structural limits:** `POI_DOC_VERSIONS` supports versions `1` and `2` (`POI_DOC_VERSION = 2`), with serialized byte caps returned by `poiDocBytesOf(v)` (`96` KiB in `POI_LIMITS.docBytes` for v1, `256` KiB in `POI_V2_LIMITS.docBytes` for v2). Document IDs match `POI_ID_RE` (`poi-` plus 12 lowercase hex characters), shelf IDs match `POI_SHELF_ID_RE` (`lib-` plus 12 hex characters), and asset digests match `POI_SHA_RE`. `POI_LIMITS` caps each POI at `128` parts, `32` lights, `32` NPCs, `64` materials per part, `64`-character names, `2000`-character `about` prose, `8` tags, and `500`-character notes. `unknownProblems` rejects unrecognized properties on known objects, while `POI_V2_LIMITS` bounds `conditionDepth` (`4`) and `groupDepth` (`8`).
- **Problem reporters and scene budgets:** `poiDocProblems(raw, { shelf })` and `poiShelfProblems` return stable problem codes, while `poiAssetProblems(doc, metaOf)` checks referenced meshes and textures against `POI_BUDGET` (`1,048,576` triangles and vertices, `64` MiB distinct bytes, `2 x 4096 x 4096` pixels, and a `2048` m reach).
- **Stepped mesh and header checks:** `decodePoiMeshSteps` and `poiMeshErrorSteps` yield every `POI_MESH_STEP` (`1 << 17`) numbers to enforce `POI_MESH_LIMITS` without blocking; `decodePoiMesh` and `poiMeshError` run them to completion. `poiImageMetaOf` sniffs image dimensions and formats against `POI_IMAGE_LIMITS`.
