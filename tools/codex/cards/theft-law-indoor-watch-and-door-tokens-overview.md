---
slug: theft-law-indoor-watch-and-door-tokens-overview
title: "Theft Law, Indoor Watch, Door Tokens, and Mend Overrides"
domain: gameplay
kind: overview
parent: null
files:
  - src/ui/profPages.js
  - src/justice/court.js
  - src/ui/shipyardWindow.js
  - src/magic/enchantments.js
  - src/ui/holdingsPages.js
  - src/revenants/revenantFate.js
  - src/characters/exteriorFoes.js
  - src/world/townStandIns.js
  - src/homes/decorPlacer.js
  - server-account/migrations/0121_yard_reseat.sql
  - server-account/migrations/0122_rez_hold.sql
  - src/characters/searchPartyHost.js
  - src/net/overworldLaw.js
  - server/src/world/overworld.js
routes:
  - /v1/realm/die
  - /v1/realm/raise
tables:
  - home_decor
  - realm_characters
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-16b.md"
related:
  - stolen-goods-mark-fencing-and-confiscation
  - indoor-watch-interior-navmesh-and-no-route
  - door-token-ahead-mint-and-arena-online-wait
  - legacy-online-death-hold-and-revival
  - revenant-fate-execution-trophy-and-voice
  - market-vendors-and-professions
  - horse-care-keep-stables-and-yards
invariants:
  - "`repairsObjectsMend` mends max(`CONDITION_AMOUNT`, round(maxCondition / `MEND_SHARE_OF`)) per tick for wear; a `magic` or `artifact` piece's uses mend `CONDITION_AMOUNT` (1)."
  - "`ownersWholeKill(whole, { fromPlayer, peer })` is true only for a whole blow from the local owner, never from a peer; any other lethal blow goes to last stand (rank >= `LAST_STAND_RANK`, 3) or kneel."
  - "Migration 0121 re-seats yard (`yard = 1`) decor in `home_decor.place`, stamps `reseat: \"STALL-SHAPE\"`, and never moves a stamped place again; scale is clamped to 0.25..4 and position to +-48 m."
  - "Fines and penance restore regional People standing via `raisePeopleForAnswer` and `peoplesHalfOwed` (the difference between the halved debt before and after) and never raise it above zero."
  - "An overworld grave search is a `gr` row on the relay's `ow` frame, kept `OW_GRAVE_KEEP_MIN` (5 game hours), capped at `OW_GRAVE_ACCT_ROWS_MAX` (32) rows per searcher and `OW_CELL_GRAVES_MAX` (128) per cell."
traps:
  - "Do not restore the DFU Repairs Objects point for wear, or the DFU whole kill for revenants; both are owner decisions to depart from DFU."
  - "Do not treat charges as wear: at a fiftieth per tick, one 8-hour rest refilled 100 casts."
dfu:
  - Assets/Scripts/Game/MagicAndEffects/Effects/Enchanting/RepairsObjects.cs
tags:
  - repairs-objects
  - revenant
  - stall-shape
  - grave-party
  - professions
  - justice
---

# Theft Law, Indoor Watch, Door Tokens, and Mend Overrides

This overview groups the gameplay, justice, UI, and overworld rules covering stolen goods, indoor watch pathfinding, door token minting, equipment mending, revenant survival, yard reseating, and grave search parties.

- **Mending and revenant rules:** In `src/magic/enchantments.js`, `repairsObjectsMend` mends wear by `max(CONDITION_AMOUNT, round(maxCondition / MEND_SHARE_OF))` per tick, while `magic` and `artifact` charges mend by `CONDITION_AMOUNT` (1). In `src/revenants/revenantFate.js`, `ownersWholeKill(whole, { fromPlayer, peer })` allows a whole kill only from the local owner; peer blows and other lethal hits go to last stand (`rank >= LAST_STAND_RANK`, 3) or kneel.
- **Court standing and professions UI:** In `src/justice/court.js`, `settleChallenge` and `doPenance` restore People and kingdom standing via `raisePeopleForAnswer` and `peoplesHalfOwed`, capped at zero. In `src/ui/profPages.js`, `chooseSpec` and `drawProfessionsPage` scope a pending respec gate to its own rank so first picks and free respecs stay selectable.
- **Shipyard, stables, and yard decor:** `SHIPYARD_CSS` (`src/ui/shipyardWindow.js`) wraps action buttons under vessel details and caps the swap picker at `12em`. In `src/ui/holdingsPages.js`, `drawStablePage`, `rideButton`, and `steedLines` show `Ride this one` for every owned horse. Migration `0121_yard_reseat.sql` re-seats yard (`yard = 1`) decor in `home_decor.place`, stamps `reseat: "STALL-SHAPE"` once, and clamps scale (`0.25..4`) and position (`+-48` m).
- **Overworld grave search and realm revival:** Search parties (`src/characters/searchPartyHost.js`, `src/net/overworldLaw.js`, `server/src/world/overworld.js`) send `gr` rows on the relay `ow` frame, kept `OW_GRAVE_KEEP_MIN` (5 game hours) and capped at `OW_GRAVE_ACCT_ROWS_MAX` (32) and `OW_CELL_GRAVES_MAX` (128). Online death holds (`/v1/realm/die`, `/v1/realm/raise`, `0122_rez_hold.sql` on `realm_characters`) pair with `legacy-online-death-hold-and-revival`.
