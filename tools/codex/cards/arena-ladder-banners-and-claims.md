---
slug: arena-ladder-banners-and-claims
title: "Arena Ladder, Banners, Receipts, and Boards"
domain: account
kind: subcard
parent: arena-colosseum-overview
files:
  - src/arena/arenaLadder.js
  - src/arena/arenaLeague.js
  - src/arena/arenaBoard.js
  - src/net/arenaLaw.js
  - src/net/arenaClaims.js
  - src/net/arenaReceipt.js
  - src/net/arenaExhibition.js
  - src/arena/arenaOnline.js
  - src/net/accountClient.js
  - server-account/src/arena.js
  - server-account/src/index.js
  - server-account/migrations/0074_arena.sql
  - server-account/migrations/0082_arena_attempts.sql
  - server-account/migrations/0139_arena_board.sql
routes:
  - /v1/arena/claim
  - /v1/arena/board
  - /v1/arena/team
  - /v1/arena/attempt
tables:
  - arena_pve
  - arena_pvp
  - arena_members
  - arena_renown
  - arena_attempts
  - arena_boards
  - arena_board_ver
  - arena_champions
replacesBible:
  - "11-Multiplayer/Arena.md"
related:
  - arena-colosseum-overview
  - arena-relay-rooms-and-private-sessions
  - economy-ledger-and-item-judge
  - scale-arc-d1-write-diet-and-cron
invariants:
  - "The PvE ladder spans `ARENA_TIERS` (10) tiers of `ARENA_TIER_BOUTS` (3) regular bouts followed by a tier champion (`ARENA_ELITE_HP_MULT = 5`, `ARENA_ELITE_DMG_MULT = 3`)."
  - "Re-clearing an already completed ladder step returns `repeat` in `claimLadder` and awards zero gold purse, team points, or Renown."
  - "Leaving a banner locks `arena_members.left_banner` and `left_season`, preventing the account from defecting to the rival banner until a later season."
  - "Before opening a new online ladder bout, `arenaOnline.js` flushes all pending receipts (`claims.flush`) and waits for account-server confirmation."
traps:
  - "Pre-bout attempt rows in `arena_attempts` expire after `ARENA_ATTEMPT_LIFE_S` (600 s) and enforce a unique index on `room`."
  - "`/v1/arena/board` reads replica-safe snapshots from `arena_boards`, which SQLite triggers synchronize with `arena_board_ver` on writes."
dfu: []
tags:
  - arena
  - ladder
  - banners
  - seasons
  - receipts
  - leaderboard
  - elo
---

# Arena Ladder, Banners, Receipts, and Boards

`src/arena/arenaLadder.js` and `src/net/arenaLaw.js` organize the PvE progression into `ARENA_TIERS` (`10`) tiers defined by `ARENA_LADDER_SPEC`, each containing `ARENA_TIER_BOUTS` (`3`) bouts and an elite champion (`ARENA_ELITE_HP_MULT = 5`, `ARENA_ELITE_DMG_MULT = 3`). Meanwhile, `src/net/arenaExhibition.js` seeds the hourly exhibition line-up via `arenaHash`. Before starting an online ladder fight, `src/arena/arenaOnline.js` flushes any queued receipts (`src/net/arenaClaims.js` and `src/net/arenaReceipt.js`) and registers a `600`-second attempt (`ARENA_ATTEMPT_LIFE_S`) at `/v1/arena/attempt` in `arena_attempts`.

## Seasons, Banner Allegiance, Elo Caps, and Materialized Boards

- **Seasons and banner loyalty (`src/arena/arenaLeague.js`, `server-account/src/arena.js`):** Arena seasons run for `ARENA_SEASON_S` (`8` weeks from `ARENA_SEASON_EPOCH_S`). Players pledge to a banner through `/v1/arena/team`; `arena_members` records `left_banner` and `left_season` so a fighter who drops a banner cannot join the opposing banner during the same season. First-time victories contribute `ARENA_TEAM_POINTS` (`bout: 1`, `champion: 3`, `grand: 10`, `pvp: 2`), while repeat ladder wins (`repeat`) grant no purse, points, or `arena_renown`.
- **PvP Elo and pair caps:** Rated PvP in `arena_pvp` starts at `ARENA_ELO_START` (`1000`, `ARENA_ELO_K = 32`) and caps repeated pairings at `ARENA_PAIR_DAY_MAX` (`5`) per day and `ARENA_PAIR_SEASON_MAX` (`10`) per season. Earning the season PvP entry in `arena_champions` requires `ARENA_CHAMPION_MIN_BOUTS` (`10`) rated bouts against at least `ARENA_CHAMPION_MIN_FOES` (`5`) distinct opponents.
- **Leaderboards (`src/arena/arenaBoard.js`, `server-account/migrations/0139_arena_board.sql`):** `/v1/arena/board` reads pre-aggregated rows from `arena_boards` tracked by `arena_board_ver`.
