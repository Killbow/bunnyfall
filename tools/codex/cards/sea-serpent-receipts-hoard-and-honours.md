---
slug: sea-serpent-receipts-hoard-and-honours
title: "Serpent Receipts, Hoard, Embers, Coilscale, and Honours"
domain: multiplayer
kind: subcard
parent: sea-serpent-world-boss
files:
  - src/net/serpentReceipt.js
  - src/net/serpentClaims.js
  - src/net/serpentHoardLaw.js
  - src/worldEvents/serpentSpoils.js
  - src/items/aetheric.js
  - src/items/gilded.js
  - src/net/renown.js
  - src/net/marksLaw.js
  - src/net/accountClient.js
  - src/ui/playerBadge.js
  - src/render/auraRing.js
  - server-account/src/serpents.js
  - server-account/src/marks.js
  - server-account/src/index.js
  - server-account/migrations/0081_serpent_kills.sql
  - server-account/migrations/0083_serpent_embers.sql
  - server-account/migrations/0119_serpent_honours.sql
routes:
  - /v1/serpent/claim
tables:
  - serpent_kills
  - serpent_spoils
  - players
replacesBible:
  - "11-Multiplayer/Sea-Serpent.md"
related:
  - sea-serpent-world-boss
  - world-events-and-signed-receipts
  - breach-receipts-spoils-and-embers
  - integrity-boss-body-ledger
  - professions-marks-and-silver-finds
invariants:
  - "Serpent receipts use version `SERPENT_RECEIPT_V` (`l1`), Ed25519 signatures under `GATE_SIGNING_KEY`, a `SERPENT_RECEIPT_TTL_S` (`7` days) TTL, a `SERPENT_RECEIPT_MAX` (`512` chars) length cap, and an `earned` tier in `SERPENT_EARNED` (`dealt` or `stood`)."
  - "Earning `dealt` requires `SERPENT_RECEIPT_SHARE` (`0.06`) of the health share for that ship (or `SERPENT_HAND_SHARE` for a hand), while `stood` requires `SERPENT_STOOD_SHARE` (`0.25`) of fight time within `SERPENT_STAND_R` (`600` m)."
  - "`serpent_kills` and `serpent_spoils` are keyed by `(day, account)`, and `/v1/serpent/claim` inserts the row before crediting in a single D1 batch so duplicate submissions credit at most once."
  - "Claims award `RENOWN_SERPENT_QUESTS` (`6` quests of Renown, halved by `SERPENT_STOOD_RENOWN` for `stood`), `40` silver (`0.5` for `stood`) under `MARKS_COMBAT` (`perDay: 150`), and `SERPENT_EMBERS` (`1`) Deadlands Ember per hoard."
  - "`serpentHonoursRoll` (`SERPENT_HONOURS_SALT`) rolls server-side on the first write of a `(day, account)` kill row only for registered accounts with `earned === 'dealt'`, drawing Coilbreaker (`SERPENT_TITLE_CHANCE = 1/20`) and The Maelstrom (`SERPENT_AURA_CHANCE = 1/50`) into `players.serpent_honours`."
traps:
  - "Clients roll hoard items locally from the receipt seed, but only grant them when `/v1/serpent/claim` returns `spoils: true` with a `serpent_spoils.cid` matching the claiming device."
  - "Honour rolls never use the client-visible receipt seed; they draw exclusively on the account server."
dfu: []
tags:
  - receipts
  - spoils
  - embers
  - gilded
  - titles
  - auras
  - claims
---

# Serpent Receipts, Hoard, Embers, Coilscale, and Honours

When Sethrakul falls, the relay mints `l1` receipts (`src/net/serpentReceipt.js`) that clients queue in `src/net/serpentClaims.js` (up to `SERPENT_CLAIMS_MAX = 24`) and redeem via `POST /v1/serpent/claim` (`src/net/accountClient.js`, `server-account/src/serpents.js`).

- **Participation tiers and server batch:** Fighters dealing at least `SERPENT_RECEIPT_SHARE` (`0.06`) of the health share for their hull (or `SERPENT_HAND_SHARE` as a hand) receive `earned: 'dealt'`; crews spending `SERPENT_STOOD_SHARE` (`0.25`) of the fight within `SERPENT_STAND_R` (`600` m) receive `earned: 'stood'`. The account server inserts `(day, account)` into `serpent_kills` (`0081_serpent_kills.sql`) and `serpent_spoils` in one batch, granting `RENOWN_SERPENT_QUESTS` (`6` quests, halved via `SERPENT_STOOD_RENOWN` for `stood` in `src/net/renown.js`) and `40` silver (`20` for `stood`) under `MARKS_COMBAT` (`perDay: 150` in `src/net/marksLaw.js` and `server-account/src/marks.js`).
- **Hoard loot and Embers:** When the server confirms `spoils: true` for the device `cid`, `src/worldEvents/serpentSpoils.js` and `src/net/serpentHoardLaw.js` award `SERPENT_EMBERS` (`1` Deadlands Ember, `0083_serpent_embers.sql`), `SERPENT_SPOILS_GOLD_PER_LEVEL` (`160` gold per level, scaled by `STOOD_GOLD = 0.6` for `stood`), and gear from `SERPENT_SPOILS_SOURCE` (`tier: 18`, `luck: 50`, `SERPENT_SPOILS_LEGENDARY = 0.15`). A `dealt` receipt also rolls a Sethrakul Coilscale piece at `SERPENT_SET_CHANCE` (`1/4` in `src/items/aetheric.js`) and The Sunken Sovereign (Ebony Saber) at `SERPENT_GILDED_CHANCE` (`1/250` in `src/items/gilded.js`).
- **Honours (`0119_serpent_honours.sql`):** On the first `dealt` kill row of the day for a registered account, `serpentHonoursRoll` (`SERPENT_HONOURS_SALT`) rolls `SERPENT_HONOUR_KEYS` (`coilbreaker` at `1/20`, `maelstrom` at `1/50`) into `players.serpent_honours`, rendered by `src/ui/playerBadge.js` and `src/render/auraRing.js`.
