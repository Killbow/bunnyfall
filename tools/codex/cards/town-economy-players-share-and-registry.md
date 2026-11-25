---
slug: town-economy-players-share-and-registry
title: "Players' Share, Witnessed Acts, and Town Registry"
domain: economy
kind: subcard
parent: town-economy-overview
files:
  - server-account/src/townEcon.js
  - server-account/src/routes/townRoutes.js
  - server-account/src/cron.js
  - server-account/migrations/0132_town_econ.sql
  - src/net/townEconBook.js
  - src/net/townEconLaw.js
  - src/net/accountClient.js
routes:
  - /v1/towns/econ
  - /v1/towns/witness
  - /v1/towns/watch
  - /v1/towns/strike
  - /v1/towns/audit
tables:
  - town_econ_towns
  - town_econ_acts
  - town_econ_days
  - town_econ_seen
  - town_econ_kept
  - town_econ_struck
  - world_witness
replacesBible:
  - "06-Systems/Town-Economy-Arc.md"
related:
  - town-economy-overview
  - seats-witness-registry-and-influence
  - living-world-ii-patrons-and-player-traders
invariants:
  - "Only witnessed acts count, never gold: watch ticks, trader or patron sales, cleansed raids, and sea dealings (`TOWN_ECON_SOURCES`)."
  - "Per-account, per-town, per-UTC-day caps (`TOWN_ECON_CAPS`) are watch 30, trade 10, raid 1, and sea 10, enforced inside the `INSERT ... ON CONFLICT` write."
  - "Activity `A` sums `weight * n * 0.8^age` over `TOWN_ECON_DAYS` (14) days, and `share = 30 * A / (A + 150)`. The service returns only shares of at least `TOWN_ECON_SHARE_LEAST` (1), rounded to one decimal."
  - "A town is confirmed by three agreeing reports from accounts registered at least one week, each with its own signed Watch tick at the town pixel. `townReportOf` requires `townPixelIdOf(map)` to equal `py * 1000 + px`."
traps:
  - "A struck map id (`town_econ_struck`) is never witnessed again. A report blocked because the map, pixel, or place is already held returns `why: 'taken'`, its witness rows are deleted, and the next day's report tries again."
  - "`TOWN_WITNESS_HOUR` caps witness reports at 12 per account per hour, `TOWN_WATCH_CLAIM_MAX` caps claims at 12 receipts, and each tick counts once (`town_econ_seen`)."
dfu: []
tags:
  - players-share
  - witness
  - registry
  - cron
  - watch-receipt
---

# Players' Share, Witnessed Acts, and Town Registry

`server-account/src/townEcon.js` and `server-account/src/routes/townRoutes.js` maintain the town registry (`town_econ_towns`, `world_witness`) and compute the players' share (`0..30`) for `src/net/townEconBook.js` and `src/net/accountClient.js`.

## Witnessed Registry and Strike Commands

- **Confirmation (`/v1/towns/witness`):** Versioned keys (`townWitnessKey(map) = '1:<map>'`) enter `town_econ_towns` once three week-old accounts submit agreeing reports (`townReportOf`, checking `townPixelIdOf(map) == py * 1000 + px`) with a signed Watch tick (`TOWN_WITNESS_HOUR = 12`).
- **Collisions and strikes (`/v1/towns/strike`, `/v1/towns/audit`):** Colliding claims return `why: 'taken'` and clear pending witness rows for retry the next day. Developer chat commands (`/town strike <map id>`, `/town audit`, gated by `isDeveloper`) call the strike and audit routes; `town_econ_struck` ids stay blocked.

## Activity Decay, Caps, and Cron Caching

- **Daily caps and curve (`/v1/towns/watch`, `src/net/townEconLaw.js`):** Only `TOWN_ECON_SOURCES` acts count, weighted by `TOWN_ECON_WEIGHTS` (`watch: 1`, `trade: 4`, `raid: 20`, `sea: 2`) and capped per account, town, and UTC day (`TOWN_ECON_CAPS`: `watch 30`, `trade 10`, `raid 1`, `sea 10`). Watch claims take up to `TOWN_WATCH_CLAIM_MAX` (`12`) receipts (`town_econ_seen`). Activity `A` sums `weight * n * 0.8^age` (`TOWN_ECON_DECAY = 0.8`) over `TOWN_ECON_DAYS` (`14`), yielding `30 * A / (A + 150)` (`TOWN_PLAYERS_MAX = 30`, `TOWN_ECON_HALF = 150`).
- **Cron jobs (`server-account/src/cron.js`):** The minute `'town-shares'` job (`keepTownShares`) writes shares `>= TOWN_ECON_SHARE_LEAST` (`1`) to `town_econ_kept` every `TOWN_ECON_KEPT_S` (`300` s), cached for `TOWN_ECON_ISOLATE_S` (`60` s) on `/v1/towns/econ`. The hourly `'town-econ'` sweep prunes `town_econ_days`, `town_econ_acts`, and `town_econ_seen`.
