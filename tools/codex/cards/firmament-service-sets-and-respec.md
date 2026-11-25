---
slug: firmament-service-sets-and-respec
title: "Firmament Service: Whole-Tree Sets, Silver Refunds, and Gold Respec"
domain: server-account
kind: subcard
parent: firmament-overview
files:
  - server-account/src/firmament.js
  - server-account/src/routes/playRoutes.js
  - server-account/src/profHarvest.js
  - server-account/src/profCraft.js
  - server-account/src/alchemy.js
  - server-account/migrations/0114_firmament.sql
  - server-account/migrations/0206_firmament_free_respec.sql
  - server-account/wrangler.toml
  - selfhost/accounts.toml
routes:
  - /v1/firmament/state
  - /v1/firmament/set
  - /v1/firmament/respec
tables:
  - firmament
  - firmament_sets
  - firmament_free_respec
replacesBible:
  - "06-Systems/Firmament.md"
related:
  - firmament-overview
  - professions-marks-and-silver-finds
  - professions-gathering-nodes-and-motherlodes
  - realm-arc-service-transactions-and-escrow
invariants:
  - "`setFirmament` takes the whole packed tree plus `rid` (`FIRM_RID_RE`); a reused rid with a different tree returns `firm-rid`, the same tree returns `repeat`."
  - "The batch writes only while the stored tree still equals the one the change was based on, otherwise `firm-stale`; refund silver is burned into `marks_ledger` in the same batch."
  - "`refundSilver`: free below `REFUND_FREE_BELOW_RENOWN` 10, then `REFUND_SILVER_PER_STAR` 10 per removed star; choosing a first sign costs nothing."
  - "`respecFirmament` clears tree and birthsign for `FIRM_RESPEC_GOLD` 10,000 gold paid from the realm record (`prepareRealmRecord` + `payFromSave`); no record means `realm-needed`."
  - "A row in `firmament_free_respec` makes one respec gold-free; the request must send `free: true` or gets `firm-respec-price`."
  - "`FIRM_OPS_MAX` 120 changes per `FIRM_OPS_WINDOW_S` 3600 s, else `firm-rate`."
traps:
  - "`FIRMAMENT_OPEN` is tri-state (`off`/`dev`/`on`, `firmamentOpenFor`); while shut, `firmStatsFrom` returns `{}` so harvest/craft bonuses stop too."
  - "Craftwork tracks count at `PROF_RANK_MAX` toward Craft points even after resetting to rank 0."
dfu: []
tags:
  - firmament
  - account-service
  - respec
  - marks
  - realm-gold
---

# Firmament Service: Whole-Tree Sets, Silver Refunds, and Gold Respec

`server-account/src/firmament.js` persists whole-tree Firmament states, burns silver Marks on star refunds, processes realm-gold or free respecs, and supplies profession yield and XP bonuses.

- **Idempotent Sets and Silver Refunds:** `/v1/firmament/set` (`setFirmament`) accepts the full packed tree and a request ID (`rid` matching `FIRM_RID_RE`). Reusing a `rid` with the same tree returns `repeat`, while a different tree returns `firm-rid`. The D1 batch verifies the prior stored tree (returning `firm-stale` on mismatch) and burns refund silver into `marks_ledger`. `refundSilver` charges `0` below `REFUND_FREE_BELOW_RENOWN` (`10`) or when picking an initial sign, and `REFUND_SILVER_PER_STAR` (`10`) per removed star at Renown `10` or above.
- **Gold and Free Respecs:** `/v1/firmament/respec` (`respecFirmament`) clears both tree and birthsign for `FIRM_RESPEC_GOLD` (`10,000` gold) deducted from the realm save via `prepareRealmRecord` and `payFromSave` (returning `realm-needed` if missing). If the account has a row in `firmament_free_respec`, one respec costs no gold provided the payload passes `free: true` (otherwise `firm-respec-price`).
- **Rate Limits, Switch, and Profession Scaling:** Mutations cap at `FIRM_OPS_MAX` (`120`) per `FIRM_OPS_WINDOW_S` (`3600` s) before returning `firm-rate`, mapped via `FIRM_STATUS` (`firm-points` `409`, `firm-closed` `403`, and `firm-rate` `429`). `FIRMAMENT_OPEN` (`off`, `dev`, or `on` via `firmamentOpenFor`) gates both routes and `firmStatsFrom` in `profHarvest.js` (`harvestNode` `yieldPct`/`scaleQty` and `xpPct`/`scaleXp`), `profCraft.js`, and `alchemy.js`. Craftworked tracks still contribute `PROF_RANK_MAX` toward Craft points.
