---
slug: elite-breach-weir-key-and-stakes
title: "Weir Key Balance, Finds, and Stake Lifecycle"
domain: economy
kind: subcard
parent: elite-breach-spire-overview
files:
  - src/systems/eliteGates/weirKey.js
  - src/systems/eliteGates/weirKeyRow.js
  - src/systems/eliteGates/egFind.js
  - server-account/src/eg.js
  - server-account/src/egEconomy.js
  - server-account/src/egHonours.js
  - server-account/src/titles.js
  - server-account/src/cron.js
  - server-account/migrations/0124_elite_breach.sql
  - src/net/eliteGates/egPay.js
routes:
  - /v1/eg/keys
  - /v1/eg/find
  - /v1/eg/open
  - /v1/eg/admit
  - /v1/eg/starts
  - /v1/eg/sink
  - /v1/eg/board
  - /v1/eg/first
  - /v1/broker/settle
tables:
  - players
  - eg_stakes
  - eg_finds
  - eg_sink
  - eg_redoubts
  - eg_reliqs
  - eg_feats
  - eg_champions
  - gate_kills
  - server_post
  - broker_sales
replacesBible:
  - "11-Multiplayer/Elite-Gates.md"
related:
  - elite-breach-spire-overview
  - economy-ledger-and-item-judge
  - breach-receipts-spoils-and-embers
invariants:
  - "The Weir Key uses template 575 (`src/systems/eliteGates/weirKey.js`); the inventory item is a display proxy while `players.eg_keys` holds the authoritative balance."
  - "Gate-kill drop odds are `EG_KEY_ODDS` (1/6), `EG_KEY_ODDS_RITE` (1/4), and `EG_KEY_ODDS_SD` (1/3), with a guaranteed drop after `EG_KEY_PITY` (5) consecutive misses in `players.eg_key_miss`."
  - "Dungeon finds (`/v1/eg/find`) roll `EG_FIND_ODDS` (`super` 1/60, `elite` 1/150, and `regular` 1/400), capped at `EG_FIND_PER_DAY` (6 requests per tier per UTC day) and `EG_FIND_KEYS_PER_WEEK` (2 keys per arena week)."
  - "Stakes still held `EG_STAKE_CLOCK_S` (`EG_VOID_WINDOW_S + EG_RECEIPT_TTL_S`, 14 days) past `until` are consumed by `spendLapsedStakes` (`server-account/src/cron.js`, `SWEEP_ROWS` pages) with one `server_post` notice per batch (`spire-stake-<order id>`)."
traps:
  - "`eg_keys`, `eg_key_miss`, `eg_live_b`, `eg_live_until`, `eg_mercy`, `eg_pity`, `eg_valk_wk`, `eg_annals`, `eg_honours`, and `eg_first` are columns on `players` (`0124_elite_breach.sql`), not separate tables."
  - "A lapsed stake never refunds its Weir Key; first-breach mercy (`players.eg_mercy`) refunds at most once per account."
tags:
  - weir-key
  - economy
  - account
  - stakes
  - cron
---

Weir Keys (`src/systems/eliteGates/weirKey.js`, `src/systems/eliteGates/weirKeyRow.js`, and `server-account/src/egEconomy.js`) gate Elite Breach entry. Template `575` in the pack mirrors the account balance stored in `players.eg_keys` (`/v1/eg/keys`, schema in `server-account/migrations/0124_elite_breach.sql`).

## Key Drops, Dungeon Finds, and Sinks

Gate kills (`gate_kills`) roll `EG_KEY_ODDS` (`1/6`), rising to `EG_KEY_ODDS_RITE` (`1/4`) and `EG_KEY_ODDS_SD` (`1/3`), while `players.eg_key_miss` guarantees a key after `EG_KEY_PITY` (`5`) misses. Within the Spire, Valkynaz chests roll `EG_VALK_KEY_ODDS` (`1/4` in `src/net/eliteGates/egPay.js`) tracked by `players.eg_valk_wk`. Dungeon Boss chests (`src/systems/eliteGates/egFind.js`, `/v1/eg/find` in `eg_finds`) roll `EG_FIND_ODDS` (`super: 1/60`, `elite: 1/150`, and `regular: 1/400`), bounded to `EG_FIND_PER_DAY` (`6` attempts per tier per UTC day) and `EG_FIND_KEYS_PER_WEEK` (`2` keys per arena week).

Extra keys or spoils feed `/v1/eg/sink` (`eg_sink` and `eg_reliqs`) and `/v1/broker/settle` (`broker_sales`).

## Stakes, Mercy, and Leaderboards

`POST /v1/eg/open` (`server-account/src/eg.js`, idempotent on request id `rq` matching `EG_RQ_RE`) debits `players.eg_keys`, creates an `eg_stakes` row, and stamps `players.eg_live_b` and `players.eg_live_until` for `/v1/eg/admit` and `/v1/eg/starts`. One-time first-breach mercy (`players.eg_mercy`) refunds a failed initial run once; otherwise `spendLapsedStakes` (`server-account/src/cron.js`, scanning `SWEEP_ROWS` pages) consumes stakes held `EG_STAKE_CLOCK_S` (`EG_VOID_WINDOW_S + EG_RECEIPT_TTL_S = 14` days) past `until` and mails `spire-stake-<order id>` in `server_post`.

`/v1/eg/board` and `/v1/eg/first` (`server-account/src/egHonours.js`) read `eg_redoubts`, `eg_feats`, `eg_champions`, and `players` columns (`eg_pity`, `eg_annals`, `eg_honours`, and `eg_first`), while `isSpireFirst` (`server-account/src/titles.js`) checks the First of the Spire title.
