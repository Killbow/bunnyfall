---
slug: wild-zone-pvp-death-drops-and-remains
title: "Wild Zone PvP Death: Drop Law, Gold Tenth, Death Hold, and Remains"
domain: multiplayer
kind: subcard
parent: wild-zone-overview
files:
  - src/world/wild/wildDropLaw.js
  - src/player/wildDeath.js
  - src/world/wild/wildCart.js
  - src/world/wild/wildLeaf.js
  - src/net/wildLaw.js
  - src/net/wildReceipt.js
  - src/net/wire.js
  - src/net/accountClient.js
  - src/ui/deathScreen.js
  - server-account/src/wild.js
  - server-account/src/index.js
  - server-account/migrations/0104_referee.sql
  - server-account/migrations/0118_wild_escrow.sql
routes:
  - "/v1/wild/fall"
  - "/v1/wild/collect"
  - "/v1/wild/reclaim"
  - "/v1/wild/escrows"
tables:
  - wild_falls
  - wild_escrow
replacesBible:
  - "11-Multiplayer/Wild-Zone.md"
related:
  - wild-zone-overview
  - integrity-pvp-duel-and-wild-referees
  - legacy-online-death-hold-and-revival
  - eltheric-ocean-open-pvp-zone-and-crossing
invariants:
  - "Only a relay-signed player kill within `WILD_KILL_CREDIT_MS` (`10_000` ms) drops inventory; `/v1/wild/fall` rejects enemy deaths (`'foe'`)."
  - "`keptOnWildDeath` and `wildCanLose` filter droppable items; `takeWildDrop` strips the backpack and any in-zone cart, while `wornOffer` lists up to `WILD_ITEMS_MAX` (`16`) equipped pieces so the killer can claim one via escrow."
  - "Gold loss is `WILD_GOLD_LOSS` (`1 / WILD_GOLD_DIVISOR` with `WILD_GOLD_DIVISOR` = `10`), floored per source, and letters of credit contribute a tenth of their value in gold (`gold.letters`) while staying in the bag."
  - "Remains persist for `WILD_REMAINS_MS` (`12` min), capped at `WILD_REMAINS_ITEMS_MAX` (`96`) items per pile and `WILD_ROOM_REMAINS_MAX` (`24`) piles per room."
  - "The PvP death screen enforces a `WILD_DEATH_HOLD_S` (`120` s) hold minus any seconds already served."
traps:
  - "`WILD_FALL_PACKS` and `WILD_FALL_LETTERS` (`1`) are client opt-in flags on `/v1/wild/fall`; older clients omitting them retain companion pack items and letter-of-credit gold cuts."
  - "`wildCartMayBeAway` (`src/world/wild/wildCart.js`) spares a wagon parked outside the wild zone, so cart drops never run unconditionally."
  - "In the Cromwark reach, `src/player/wildDeath.js` respawns the player outside the zone without recording a PvP fall."
dfu: []
tags:
  - wild-zone
  - pvp
  - death
  - remains
  - escrow
---

When a player falls in an active PvP wild zone, `src/world/wild/wildDropLaw.js`, `src/player/wildDeath.js`, `src/net/wildLaw.js`, and `server-account/src/wild.js` govern inventory drops, two-phase escrow, and remains.

## Drop Law, Worn Escrow, and Gold Tenth

A death counts as a PvP fall only when a player lands a hit within `WILD_KILL_CREDIT_MS` (`10_000` ms) and the relay signs a receipt (`src/net/wildReceipt.js`, `WILD_FALL_GRACE_S` = `30` s). Enemy deaths (`'foe'`) are refused by `POST /v1/wild/fall` and drop nothing. Using `keptOnWildDeath` and `wildCanLose`, `takeWildDrop` strips droppable bag items, companion packs (`WILD_FALL_PACKS` = `1`, up to `WILD_REVENANTS_MAX` = `1` sworn revenant), and cart items unless `wildCartMayBeAway` (`src/world/wild/wildCart.js`) spares a wagon parked outside the zone.

Worn gear stays equipped except for one piece picked by the killer from `wornOffer` (up to `WILD_ITEMS_MAX` = `16`). The account server (`server-account/src/index.js`, `0104_referee.sql`, and `0118_wild_escrow.sql`) records falls in `wild_falls` and settles worn picks in `wild_escrow` via `/v1/wild/fall`, `/v1/wild/collect`, `/v1/wild/reclaim`, and `/v1/wild/escrows` (`src/net/accountClient.js`). Purse gold and letters of credit (`WILD_FALL_LETTERS` = `1`, `gold.letters`) each lose `WILD_GOLD_LOSS` (`1 / WILD_GOLD_DIVISOR`, divisor `10`), floored per source, while letters stay in the bag.

## Death Hold and World Remains

`src/ui/deathScreen.js` holds the victim for `WILD_DEATH_HOLD_S` (`120` seconds) minus time already served. Remains (`src/world/wild/wildLeaf.js` and `src/net/wire.js`) last `WILD_REMAINS_MS` (`12` minutes) with up to `WILD_REMAINS_ITEMS_MAX` (`96`) items and `WILD_ROOM_REMAINS_MAX` (`24`) piles per room; `WILD_MINE_MARK` marks the owner's pile with a red beam (`reach: 80`).
