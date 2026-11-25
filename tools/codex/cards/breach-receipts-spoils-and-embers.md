---
slug: breach-receipts-spoils-and-embers
title: "Breach Receipts, Spoils, Embers, and Insignia"
domain: multiplayer
kind: subcard
parent: dagons-breach-world-boss
files:
  - src/net/gateReceipt.js
  - src/net/gateClaims.js
  - src/net/insignia.js
  - src/worldEvents/gateSpoils.js
  - src/items/gilded.js
  - src/worldEvents/spoilsPool.js
  - src/world/gateSpew.js
  - src/worldEvents/breachBook.js
  - src/items/portBooks.js
  - server-account/src/index.js
routes:
  - "/v1/gate/claim"
  - "/v1/account"
  - "/v1/account/insignia"
  - "/v1/account/aura"
tables:
  - gate_kills
  - players
replacesBible:
  - "11-Multiplayer/World-Bosses.md#receipts"
  - "11-Multiplayer/World-Bosses.md#spoils"
  - "11-Multiplayer/World-Bosses.md#insignia"
related:
  - dagons-breach-world-boss
  - breach-boss-brain-and-courts
  - breach-rite-broker-and-multi-court
invariants:
  - "Fighters qualify for a kill receipt by dealing at least `RECEIPT_SHARE` (0.02) of their own HP share or surviving for `STOOD_SHARE` (0.5) of their live court time."
  - "`gate_kills` (`day, account, boss, earned, at, region, stones, body`) stores at most one row per `(day, account)` primary key."
  - "Deadlands Ember balances and cosmetics live on the `players` table (`insignia`, `insignia_spent`, and `aura`), never on a separate `accounts` table."
traps:
  - "Claims that fail with mendable status codes (`signature`, `verify-threw`, `future`, or `clock` in `GATE_CLAIM_MENDABLE`) remain in local storage for automatic retry."
  - "`spoilsLevel` (`src/worldEvents/spoilsPool.js`) scales rewards using the lower of the player's current level and the receipt level."
tags:
  - receipts
  - spoils
  - embers
  - insignia
  - claims
---

When Valkynaz Ruhn falls or a player finishes the exterior rite, the relay issues a signed `RECEIPT_V` (`r1`) receipt (`src/net/gateReceipt.js`) with a 7-day TTL (`RECEIPT_TTL_S`) and an `earned` tag in `RECEIPT_EARNED` (`dealt`, `stood`, or `rite`). Room storage retains receipts under `gaterc:` and sweeps expired entries via `sweep:gaterc`.

## Claims, Spoils, and Gilded Rolls

The client submits pending receipts (`src/net/gateClaims.js`) to `POST /v1/gate/claim` (`server-account/src/index.js`), which verifies the signature against the deployment's `GATE_PUBLIC_KEY` binding and inserts into `gate_kills` once per `(day, account)`.

Opening the spoils pool (`src/worldEvents/spoilsPool.js`, `src/worldEvents/gateSpoils.js`) spews loot across a `SPEW_SPREAD` (1.6-radian) arc (`src/world/gateSpew.js`) and resends spent notifications every `SPOILS_SPENT_RESEND_MS` (5 seconds). Spoils award `SPOILS_GOLD_PER_LEVEL` (250) gold per `spoilsLevel`, one guaranteed Rare-or-better item (`SPOILS_LEGENDARY` = 10% Legendary chance), two additional items laddered by source chance at `SPOILS_SOURCE` (tier 21, luck 50), and a 1/250 (`GATE_GILDED_CHANCE`) roll for the Gilded weapon Dragonfire Oath (`src/items/gilded.js`).

## Deadlands Embers, Book Courier, and Insignia

Claimed receipts grant Deadlands Embers (`insignia` on `players`, read via `GET /v1/account`). Earning a character's first Deadlands Ember schedules a courier delivery of book ID `BURNING_DOORS_ID` (417, *On the Burning Doors*, `src/items/portBooks.js` and `src/worldEvents/breachBook.js`). Players spend Embers via `POST /v1/account/insignia` and toggle their aura at `POST /v1/account/aura` (`src/net/insignia.js`): the `Gatebreaker` title costs 30 Embers, and the `Dagon's Fire` aura costs 50 Embers.
