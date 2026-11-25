---
slug: eltheric-ocean-ship-pvp-wrecks-bounties-and-season
title: "Eltheric Ship PvP: Broadsides, Wrecks, Prizes, Bounties, and Season Boards"
domain: multiplayer
kind: subcard
parent: eltheric-ocean-overview
files:
  - src/net/sea/seaRef.js
  - src/systems/naval/seaBroadsides.js
  - src/systems/naval/navalPvp.js
  - src/systems/naval/seaWreckHost.js
  - src/systems/naval/seaHoldGuard.js
  - src/net/sea/seaPrizeLaw.js
  - src/net/wildReceipt.js
  - src/net/sea/seaBountyLaw.js
  - src/net/sea/seaSeasonLaw.js
  - src/systems/naval/seaBountyHost.js
  - src/systems/naval/seaSeasonHost.js
  - src/net/accountClient.js
  - server-account/src/index.js
  - server-account/src/seaBounty.js
  - server-account/src/seaWreck.js
  - server-account/src/seaSeason.js
  - server-account/migrations/0146_sea_bounty.sql
  - server-account/migrations/0147_sea_season.sql
  - server-account/migrations/0148_sea_wreck.sql
routes:
  - /v1/sea/bounty/board
  - /v1/sea/bounty/post
  - /v1/sea/bounty/collect
  - /v1/sea/season/board
  - /v1/sea/wreck
  - /v1/sea/prize/collect
  - /v1/sea/prize/reclaim
tables:
  - sea_bounties
  - sea_kills
  - sea_bounty_owed
  - sea_season
  - sea_wrecks
  - sea_prizes
replacesBible:
  - "03-World/Eltheric-Ocean.md"
related:
  - eltheric-ocean-overview
  - eltheric-ocean-open-pvp-zone-and-crossing
  - integrity-pvp-duel-and-wild-referees
  - naval-ramming-and-grapple-boarding
  - economy-ledger-and-item-judge
invariants:
  - "`SEA_REF` referees ship hulls (`SEA_SHIP_HP = [96, 240, 672, 832, 896]`); broadside packets fire at most every `SEA_SHOT_MS` (`250`) ms under `SEA_SHOT_HZ = SEA_REF.hz - 2`."
  - "A victor within `SEA_BOARD_NEAR_M` (`30`) meters claims up to `SEA_PRIZE_SHARE` (`1/3`) of eligible hold value in at most `SEA_PRIZE_PIECES_MAX` (`8`) items (`tradeableRecord`)."
  - "A crippled ship's hold locks for `SEA_HOLD_SHUT_MS` (`240_000` ms), and the wrecked captain has `SEA_WRECK_GRACE_S` (`300` s) to submit the wreck receipt before the killer can."
  - "Bounties range from `SEA_BOUNTY_MIN` (`100`) to `SEA_BOUNTY_MAX` (`50_000`) with presets `SEA_BOUNTY_POSTS = [500, 2000, 10_000]`, refunding unclaimed gold after `SEA_REFUND_AFTER_S` (2 hours)."
traps:
  - "Character deletion is rejected (`sea-held`) whenever bounties, wreck prizes, or hold goods await collection at a freeport."
  - "Bounty payouts never mint or burn gold; every coin added to `sea_bounty_owed` comes directly from a player post in `sea_bounties`."
dfu: []
tags:
  - eltheric-ocean
  - ship-pvp
  - wreck
  - bounty
  - season
---

Multiplayer naval combat combines client broadside refereeing (`src/net/sea/seaRef.js`, `src/systems/naval/seaBroadsides.js`, and `src/systems/naval/navalPvp.js`) with account-server persistence for wrecks, prizes, bounties, and seasonal leaderboards (`server-account/src/seaWreck.js`, `server-account/src/seaBounty.js`, and `server-account/src/seaSeason.js`).

## Refereeing, Wrecks, and Prize Law

`SEA_REF` tracks hull points across `SEA_SHIP_HP` (`[96, 240, 672, 832, 896]`), capping toughness wire values at `SEA_TOUGH_WIRE_MAX` (`240`), checking proximity within `SEA_CAPTAIN_NEAR_M` (`700` m), and attributing sink credit within `SINK_CREDIT_S` (`20` s). Broadside messages step every `SEA_SHOT_MS` (`250` ms) beneath `SEA_SHOT_HZ`.

When a ship is crippled, `src/systems/naval/seaHoldGuard.js` locks its hold for `SEA_HOLD_SHUT_MS` (`240_000` ms). Under `src/net/sea/seaPrizeLaw.js` and `src/net/wildReceipt.js` (`WILD_RECEIPT_MAX = 512`), the defeated captain has `SEA_WRECK_GRACE_S` (`300` s) to POST `/v1/sea/wreck` before the killer may submit the receipt. A victor within `SEA_BOARD_NEAR_M` (`30` m) claims up to `SEA_PRIZE_SHARE` (`1/3`) of `tradeableRecord` hold value across at most `SEA_PRIZE_PIECES_MAX` (`8`) pieces. `sea_wrecks` and `sea_prizes` hold items for `SEA_PRIZE_HOLD_S` (3 days) for `/v1/sea/prize/collect` and `/v1/sea/prize/reclaim`.

## Bounties and Season Boards

Players post bounties (`SEA_BOUNTY_MIN = 100` to `SEA_BOUNTY_MAX = 50_000`, presets `SEA_BOUNTY_POSTS = [500, 2000, 10_000]`) via `/v1/sea/bounty/post` into `sea_bounties`, `sea_kills`, and `sea_bounty_owed`. Wanted status spans `SEA_WANTED_DAYS` (`14` days), the board (`/v1/sea/bounty/board`) lists `SEA_BOARD_MAX` (`12`) entries cached for `SEA_BOARD_FRESH_MS` (`30_000` ms), unclaimed posts refund after `SEA_REFUND_AFTER_S` (2 hours) via `/v1/sea/bounty/collect`, and ended rows persist for `SEA_ENDED_KEEP_S` (30 days). `/v1/sea/season/board` queries `sea_season` (`arenaSeasonOf`), returning `SEA_SEASON_ROWS` (`10`), `SEA_SEASON_LAST_ROWS` (`3`), and `SEA_DEEPEST_MAX` (`1365`).
