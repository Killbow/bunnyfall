---
slug: "legacy-lineage-merge-and-payload-bounds"
title: "Lineage Payload Bounds, Identity Merge, and Cadet Surnames"
domain: "legacy"
kind: "subcard"
parent: "legacy-arc-overview"
files:
  - "src/systems/legacy/store.js"
  - "src/systems/legacy/realmLine.js"
  - "src/systems/legacy/legacyHost.js"
  - "src/net/accountClient.js"
  - "src/net/houseLaw.js"
  - "server-account/src/legacy.js"
  - "server-account/src/index.js"
  - "src/world/worldSaveLoad.js"
routes:
  - "/v1/realm/lineage"
  - "/v1/realm/lineages"
tables:
  - "lineages"
replacesBible:
  - "01-Overview/audits/Audit-Legacy-III.md"
related:
  - "legacy-arc-overview"
  - "legacy-family-records-and-heir-birth"
  - "legacy-tombstone-door-token-and-wedding-binding"
invariants:
  - "House names cap at `HOUSE_NAME_MAX = 24` (`src/net/houseLaw.js`), and cadet branches inherit the parent line surname through `lineSurnameOf`."
  - "Payloads exceeding `LINEAGE_BODY_MAX` (`LINEAGE_MAX_BYTES + 1024`) on `/v1/realm/lineage` return `413 lineage-too-large`."
  - "When a newer realm revision exists, `putLineage` merges facts via `mergeFamily` rather than overwriting: `samePerson` matches kind, census ID or union, birth minute, and parents, `rekeyClashes` rewrites colliding IDs, and realm IDs win in `mergeLines`."
  - "`leanRecord` releases dead-member standing once no living heir can inherit it, and Living World hub rows release only after town and dungeon indices finish building (`releaseHubRows`)."
traps:
  - "Never judge lineage staleness with a page-local counter; read the stored revision via `noteSeen` and `seenRevOf`."
  - "A refused lineage write is reflected in `unwrittenOf` and must not retry in a tight loop."
dfu: []
tags:
  - "legacy"
  - "lineage"
  - "merge"
  - "limits"
---

# Lineage Payload Bounds, Identity Merge, and Cadet Surnames

Lineage synchronization bounds payload size, house naming, revision tracking, and cross-client person merging across `lineages` (`src/systems/legacy/store.js`, `src/systems/legacy/realmLine.js`, and `server-account/src/legacy.js`).

## Payload Ceilings, House Names, and Revision Tracking

House names cap at `HOUSE_NAME_MAX` (`24` in `src/net/houseLaw.js`), and cadet branches inherit the parent line surname through `lineSurnameOf`. On `/v1/realm/lineage` and `/v1/realm/lineages` (`server-account/src/index.js`, `src/net/accountClient.js`), requests exceeding `LINEAGE_BODY_MAX` (`LINEAGE_MAX_BYTES` plus `1024`) return `413` (`lineage-too-large`). Clients read stored revisions via `noteSeen` and `seenRevOf` (never a page-local counter), and refused writes surface in `unwrittenOf` without tight-loop retries.

## Identity Merging and Record Trimming

- **Merging (`src/systems/legacy/realmLine.js`):** On newer realm revisions, `putLineage` reconciles via `mergeFamily`: `samePerson` matches kind, census ID or union, birth minute, and parents, `rekeyClashes` rewrites colliding IDs, and realm IDs win inside `mergeLines`.
- **Trimming and news (`src/systems/legacy/legacyHost.js`, `src/world/worldSaveLoad.js`):** `leanRecord` releases dead-member standing without a living heir, `releaseHubRows` frees Living World hub rows after town and dungeon indices finish building, `hearNews` stamps offline family news at hearing time, and spouse portraits render through `facePose` against `CommonFaces`.
