---
slug: quest-sites-and-homed-reseating
title: "Quest Sites Exclude Player Homes: Live Home Orders and Homed-Site Reseating"
domain: quests
kind: subcard
parent: stores-beds-grog-mending-and-wild-escrow-overview
files:
  - src/systems/quest/place.js
  - src/systems/quest/machine.js
  - src/homes/onlineHomes.js
  - src/homes/homesWorld.js
  - src/net/homeLaw.js
  - src/net/accountClient.js
  - src/net/online.js
  - src/net/wire.js
  - src/scenes/world.js
  - server/src/message/frames/home.js
  - server/src/room/reads.js
  - server-account/src/routes/townRoutes.js
  - server-account/src/routeHelpers.js
  - server-account/migrations/0010_homes.sql
  - server-account/migrations/0086_storm_shed_2.sql
routes:
  - /v1/homes/layouts
tables:
  - homes
  - homes_gen
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-14.md"
related:
  - stores-beds-grog-mending-and-wild-escrow-overview
  - homes-camps-guilds-and-territories
  - arena-city-block-and-home-relocation
  - quests-macros-and-main-spine
invariants:
  - "Quest site selection skips any building where `isPlayerHome` is true, in every town of the region, including towns the client has not visited (`hearEveryTown`, `/v1/homes/layouts`)."
  - "When a home is claimed, `reseatHomedSites` (machine.js) calls each unreached site's `repickHomedSite`, which redraws it under the place's declared P2/P3. If nothing is found, a person's home falls back to a house (-1, 1)."
  - "`noteSiteReached` sets `siteDetails.reached` once the player stands inside the site. A reached site is never reseated."
  - "Home orders are pushed live to every hub socket through the WebSocket frame `{ t: 'home', l: [...] }` (`sendHomeOrder`, `onHomeOrders`, `hearHome`). Recent home words are held under `HOME_WORDS_KEY` ('homewords:held'), up to `HOME_WORDS_MAX` (128), for `HOME_WORDS_KEEP_MS` (10 min)."
traps:
  - "If a town has only one building of the requested type, the site cannot be reseated and falls back to the home-access rung."
  - "When an account is cascade-deleted, its homes are removed from the database without a live push, so the client keeps the old home status until its next boot."
dfu:
  - Assets/Scripts/Game/Questing/Place.cs
tags:
  - quests
  - homes
  - relay
  - online
---

# Quest Sites Exclude Player Homes: Live Home Orders and Homed-Site Reseating

Quest site selection excludes buildings claimed as player homes across every town in the region, and active unreached quest sites automatically move when a player claims their building.

- **Region-wide home awareness:** Instead of knowing only visited towns, the client loads all regional home claims through `hearEveryTown` and `/v1/homes/layouts` (`src/homes/onlineHomes.js`, `src/homes/homesWorld.js`, `src/net/accountClient.js`, `server-account/src/routes/townRoutes.js`, and `server-account/src/routeHelpers.js`), backed by `homes` and `homes_gen` (`0010_homes.sql`, `0086_storm_shed_2.sql`). In `src/systems/quest/place.js`, site picking skips any building where `isPlayerHome` is true.
- **Live home order broadcasts:** When a home is claimed, `homeOrdersOf` and `homeMoved` update `homes_gen`, and the relay broadcasts `{ t: 'home', l: [...] }` to connected hub sockets via `sendHomeOrder`, `onHomeOrders`, and `hearHome` (`src/net/homeLaw.js`, `src/net/online.js`, `src/net/wire.js`, `server/src/message/frames/home.js`, and `server/src/room/reads.js`). The relay retains up to `HOME_WORDS_MAX` (128) recent frames under `HOME_WORDS_KEY` (`'homewords:held'`) for `HOME_WORDS_KEEP_MS` (10 minutes); cascade account deletions clear database rows without a live push.
- **Reseating unreached quest sites:** On receiving a home claim, `reseatHomedSites` in `src/systems/quest/machine.js` invokes `repickHomedSite` for each affected active quest site that has not yet been entered (`noteSiteReached` stamps `siteDetails.reached` once the player stands inside). `repickHomedSite` redraws under the declared `P2`/`P3` parameters, falls back to a generic house (`-1, 1`) for a resident site, or drops to the home-access rung if no alternative building of that type exists in town. `questSiteMovedHere` and `world.questSiteMoved` (`src/scenes/world.js`) refresh the map marker and quest dialogue.
