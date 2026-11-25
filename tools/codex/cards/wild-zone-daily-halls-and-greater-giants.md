---
slug: wild-zone-daily-halls-and-greater-giants
title: "Wild Zone Daily Halls, Lockouts, Crows, and Dormant Greater Giants"
domain: multiplayer
kind: subcard
parent: wild-zone-overview
files:
  - src/world/wildDungeons.js
  - src/world/wildGiants.js
  - src/net/wildLaw.js
  - src/net/wire.js
  - src/scenes/world.js
  - server/src/index.js
routes:
  - "/internal/wdun/reset"
  - "/internal/wdun/kin"
  - "/internal/wdun/gone"
tables: []
replacesBible:
  - "11-Multiplayer/Wild-Zone.md"
related:
  - wild-zone-overview
  - wild-zone-pvp-death-drops-and-remains
  - room-engine-and-hub-sharding
  - elite-breach-clock-and-hall-rhythm
invariants:
  - "`WILD_DUNGEONS_PER_RING` (`[10, 8, 6, 4]`, 28 halls total) places daily elite halls at least `WILD_HALL_SPACING` (`3`) pixels apart via `wildHallPicks(mask, free, day)` identically on every client."
  - "The daily seed advances at `floor((now + hub skew) / WDUN_DAY_MS)` (`24` h) on the relay clock using `WDUN_SALT` (`7`)."
  - "The hub tracks dungeon state under room key `WDUN_KEY` (`'wdun'`), and `wdunLeave` locks an account out of that hall for `WDUN_LOCK_MS` (`60` min)."
  - "`wdunEnter` waives the 60-minute lockout whenever the account's own remains still lie inside that hall (`st.piles`)."
  - "A hall that stays empty for `WDUN_RESET_MS` (`20` min) resets on the next entry and increments its epoch, re-keying every chest inside."
traps:
  - "Exterior crow markers (`st.crows`) circle a hall until its last remains expire or are looted (`wdunGone` via `/internal/wdun/gone`), rather than clearing on a fixed timer from the moment of death."
  - "`wildGiantsAt` (`src/world/wildGiants.js`) returns `[]` while `CROMWARK_ON` is true, leaving the Greater Giant roster and respawn constants dormant."
dfu: []
tags:
  - wild-zone
  - dungeons
  - lockout
  - giants
  - hub
---

Daily mountain halls, hub lockouts, crow markers, and dormant Greater Giant rules live in `src/world/wildDungeons.js`, `src/world/wildGiants.js`, `src/net/wildLaw.js`, and `server/src/index.js`.

## Daily Hall Picks, Lockouts, Resets, and Crows

Each relay day (`floor((now + hub skew) / WDUN_DAY_MS)` over `24` hours with `WDUN_SALT` = `7`), `wildHallPicks(mask, free, day)` selects `WILD_DUNGEONS_PER_RING` (`[10, 8, 6, 4]`, or `28` halls) spaced at least `WILD_HALL_SPACING` (`3` pixels) apart and stocked from `WILD_HALL_FOES`. At hello, `wdunState` (`server/src/index.js`, key `WDUN_KEY` = `'wdun'`) sends `{ t: 'wdun', k: 'st', day, now, locks, crows, giants, fleets }`.

Exiting a hall runs `wdunLeave`, locking the account out for `WDUN_LOCK_MS` (`60` minutes), but `wdunEnter` lifts the lock while the player's own remains lie inside (`st.piles`). A hall empty for `WDUN_RESET_MS` (`20` minutes) triggers `/internal/wdun/reset` (`src/net/wire.js`) on the next entry and increments its epoch to re-key all chests. Room shards also report `/internal/wdun/kin` and `/internal/wdun/gone`, keeping exterior crows (`st.crows`) active until `wdunGone` clears the last remains.

## Dormant Greater Giants

In `src/world/wildGiants.js`, `wildGiantsAt` returns `[]` while `CROMWARK_ON` holds. The dormant constants define `WDUN_GIANTS` (`8`, or `WILD_GIANTS_PER_RING` = `2` per ring), `WILD_GIANT_HEALTH_MULT` (`10`), `WILD_GIANT_DAMAGE_MULT` (`4`), `GREATER_GIANT_CALL` (`10` giants at `GREATER_GIANT_CALL_AT` = `0.5`), `WDUN_GIANT_DOWN_MS` (`30` minutes), `WILD_GIANT_LEG_MS` (`20`-minute legs across `WILD_GIANT_ROAM_PX` = `5` pixels), and `GIANT_RETREAT_M` (`200` meters in `src/scenes/world.js`).
