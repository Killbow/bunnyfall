---
slug: "ledger-law-pose-freshness-and-room-caps-overview"
title: "Ledger Law Migration, Boss Pose Freshness, and Shared Dungeon Caps"
domain: "integrity"
kind: "overview"
parent: null
files:
  - "server-account/src/service.js"
  - "src/net/wire.js"
  - "server-account/migrations/0178_rpt1026_ledgerlaw.sql"
  - "src/net/online.js"
  - "server-account/src/ledger.js"
  - "src/homes/decorGrants.js"
  - "src/net/sdRemnant.js"
  - "server/src/world/sdFight.js"
  - "src/scenes/dungeonContext.js"
  - "src/audio/audio.js"
  - "src/worldEvents/eventGround.js"
  - "src/platform/frameCap.js"
routes: []
tables:
  - "products"
  - "realm_characters"
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-26r.md"
related:
  - "online-line-stall-act-waits-and-block-stamps"
  - "ledger-law-craft-hand-overs-and-excuse-values"
  - "shared-chest-gold-pile-and-hold-keep"
  - "economy-ledger-and-item-judge"
  - "decor-grants-wait-and-shared-chest-open"
  - "vendor-lost-client-settle-and-arrivals"
  - "private-reports-overview"
invariants:
  - "Migration `0178_rpt1026_ledgerlaw.sql` adds `products.handed_to` and `realm_characters.law_v` (`server-account/src/service.js` and `server-account/src/ledger.js`), deploying independently of relay protocol bumps (`src/net/wire.js`)."
  - "Relay blows in Hour and Ketch boss fights drop whenever the striker pose is older than `SD_POSE_FRESH_MS` (`25` s in `src/net/sdRemnant.js`) or `KT_POSE_FRESH_MS` (`25` s in `src/net/ketch/ketchBrain.js`), enforced in `server/src/world/sdFight.js` and `server/src/world/ketch.js`."
  - "Shared dungeon enemy bodies cap at `SHARED_FOES_MAX = 32` with `XF_STANDING = 2` (`src/scenes/dungeonContext.js`) so late joiners retain standing bodies."
  - "One-shot audio voices cap at `REAL_VOICES = 32` (`src/audio/audio.js`), and Portal Stones and peer wagons are refused within `EVENT_GROUND_M = 40` m of active breaches, arches, and fallen stars (`src/worldEvents/eventGround.js`)."
traps:
  - "Always read `ACCOUNT_VERSION` (`server-account/src/service.js`) and `RELAY_VERSION` (`src/net/wire.js`) live rather than hardcoding historical version tags."
  - "Absent boss-fight contributors retire after `ABSENT_RETIRE_MS = 30` s (`src/net/gateBrain.js`) and restore at current boss HP share upon landing a fresh blow."
dfu: []
tags:
  - "ledger-law"
  - "boss-fights"
  - "private-reports"
  - "integrity"
---

# Ledger Law Migration, Boss Pose Freshness, and Shared Dungeon Caps

Migration `0178_rpt1026_ledgerlaw.sql` (`server-account/migrations/0178_rpt1026_ledgerlaw.sql`) adds `products.handed_to` and `realm_characters.law_v` in `server-account/src/service.js` and `server-account/src/ledger.js` independently of relay protocol bumps in `src/net/wire.js`. Callers always read `ACCOUNT_VERSION` and `RELAY_VERSION` live rather than hardcoding historical tags across `src/net/online.js`, `src/homes/decorGrants.js`, and `src/platform/frameCap.js`.

- **Boss pose freshness:** Relay blows in Hour and Ketch fights drop in `server/src/world/sdFight.js` and `server/src/world/ketch.js` when the striker pose exceeds `SD_POSE_FRESH_MS` (`25` s in `src/net/sdRemnant.js`) or `KT_POSE_FRESH_MS` (`25` s in `src/net/ketch/ketchBrain.js`). Absent contributors retire after `ABSENT_RETIRE_MS = 30` s (`src/net/gateBrain.js`) and restore at the current boss HP share upon landing a fresh blow.
- **Room, audio, and event caps:** Shared dungeon enemy bodies cap at `SHARED_FOES_MAX = 32` with `XF_STANDING = 2` (`src/scenes/dungeonContext.js`). Audio caps one-shot voices at `REAL_VOICES = 32` (`src/audio/audio.js`), and `src/worldEvents/eventGround.js` blocks Portal Stones and peer wagons within `EVENT_GROUND_M = 40` m of active breaches, arches, and fallen stars.
- **Timers and layout constants:** `ROOM_CLAIM_TIMEOUT_MS = 4000` (`src/items/roomLoot.js`), `ONLINE_CHECKPOINT_MS = 300000` (`src/saves/onlineCheckpoint.js`), `ARRIVALS_FIRST_MS = 15000` (`src/net/marketArrivals.js`), `TOUCH_ENTRY_Z = 39` (`src/ui/touch.js`), `BANNER_WALL_BEHIND_M = 1.2` and `BANNER_WALL_PAD_M = 0.05` (`src/guilds/hallBanners.js`), and `EOTB_RECORD_SCALE` (`80/110` for set `10` spell sheets in `src/player/eotbSprite.js`).
