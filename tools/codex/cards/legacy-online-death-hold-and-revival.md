---
slug: legacy-online-death-hold-and-revival
title: "Online Tombstones, Resurrection Hold, Revival, and House Inheritance"
domain: legacy
kind: subcard
parent: legacy-arc-overview
files:
  - server-account/src/legacy.js
  - server-account/src/cron.js
  - server-account/src/homes.js
  - server-account/migrations/0122_rez_hold.sql
  - src/systems/legacy/revived.js
  - src/ui/deathScreen.js
  - src/net/accountClient.js
routes:
  - /v1/realm/die
  - /v1/realm/raise
  - /v1/homes/inherit
  - /v1/homes/mine
  - /v1/realm/:id/data
tables:
  - realm_characters
  - homes
replacesBible:
  - "06-Systems/Legacy-Arc.md"
related:
  - legacy-arc-overview
  - realm-saves-and-mod-save-hooks
  - homes-camps-guilds-and-territories
invariants:
  - "`realmDie` sets `dead_at` and `dead_why`; `isTombstone` (`TOMB_WHERE`) rejects later join, checkpoint, and trade."
  - "A held death waits `REZ_HOLD_S` (`150` s; `REZ_HOLD_MS` client-side) for `realmRaise` matching `diedAt`."
  - "`settleHolds` in cron entombs expired holds, at most `REZ_SETTLE_MAX` (`25`) per pass."
  - "Revival stamps `revived` on the person; `dropRevived` clears the remains and succession from that death on every copy."
  - "`inheritHome` moves the house of a dead member to the carrier of the line atomically; homes stay one per region."
traps:
  - "A session that dies mid-hold is finalized only by cron; never leave a hold open client-side."
  - "An heir created before revival stays a living member; revival must not delete them."
dfu: []
tags:
  - death
  - resurrection
  - revival
  - tombstone
  - homes
---

# Online Tombstones, Resurrection Hold, Revival, and House Inheritance

Online realm deaths combine a timed resurrection hold window with cron finalization, cross-tab revival cleanup, and atomic house transfer (`server-account/src/legacy.js`, `server-account/src/cron.js`, `server-account/src/homes.js`, and `src/systems/legacy/revived.js`).

- **Tombstones and resurrection holds (`legacy.js`, `0122_rez_hold.sql`, `cron.js`):** Reporting a death to `/v1/realm/die` (`realmDie`) records `dead_at` (indexed by `realm_characters_rez_hold`) and `dead_why` on `realm_characters`. Once entombed, `isTombstone` (`TOMB_WHERE`) blocks subsequent join, checkpoint, and trade requests. When a death enters a resurrection hold, the server waits `REZ_HOLD_S` (`150` seconds, mirrored by `REZ_HOLD_MS` in `src/ui/deathScreen.js`) for `/v1/realm/raise` (`realmRaise`) with a matching `diedAt` timestamp. If the hold expires or the client disconnects mid-hold, `settleHolds` in `server-account/src/cron.js` calls `entombLineDead` on up to `REZ_SETTLE_MAX` (`25`) expired records per pass.
- **Revival reconciliation (`revived.js`):** When `realmRaise` succeeds, the person entry receives a `revived` stamp. On every client copy, `dropRevived` clears the remains and pending succession created by that death while preserving any heir character already minted before the revival.
- **House inheritance (`homes.js`, `accountClient.js`):** `/v1/homes/inherit` (`inheritHome`) atomically transfers a deceased member's house in `homes` to the active lineage carrier while preserving the one-home-per-region limit reported by `/v1/homes/mine`.
