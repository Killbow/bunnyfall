---
slug: homes-camps-guilds-and-territories
title: Homes, Camps, Guilds, and Company Territories
domain: account
kind: overview
files:
  - server-account/src/index.js
  - server-account/src/homes.js
  - server-account/src/decor.js
  - server-account/src/camps.js
  - server-account/src/territory.js
  - server-account/src/charters.js
  - server-account/src/blight.js
  - server-account/src/garrisons.js
  - server-account/src/farms.js
  - src/net/bunnyGuildLaw.js
routes:
  - /v1/homes/yards
  - /v1/homes/town
  - /v1/camps/pitch
  - /v1/territories
  - /v1/charters/found
  - /v1/farms
  - /v1/garrisons
  - /v1/blight/push
tables:
  - homes
  - camps
  - camp_pieces
  - company_territory
  - city_charters
  - company_farms
  - garrisons
  - rodney_blight
related:
  - account-routes-and-gate-wall
  - market-vendors-and-professions
invariants:
  - Each building in `homes` has a single owner, locks its town `layout`, and bounds `HOME_CAP` and deletion to the buying `char_id`.
  - Town yard placement rejects writes that exceed `DECOR_YARDS_TOWN_MAX` (`6,500` pieces) across a town.
  - Linked accounts own up to `CAMPS_MAX` (`3`) camps spaced by `CAMP_GAP` with at most `CAMP_CAP` (`100`) pieces per camp.
traps:
  - Home access uses `heldByAccount` and `OWNS` across characters on an account, so changing cap or deletion checks to account-wide breaks per-character deed limits.
  - "`/v1/homes/yards` (`yardsKept`) runs without a session and caches town yard counts in isolate memory; mutations must invalidate that cache."
tags:
  - account
  - homes
  - camps
  - guilds
  - territories
---

# Homes, Camps, Guilds, and Company Territories

Town housing, camps, online guilds, and Company territories persist in D1 and route through `server-account/src/index.js`.

- **Homes and yards (`homes.js`, `decor.js`):** Each building in `homes` has one owner and locks its town `layout`. Every character on the owning account can enter, decorate, rent out, stock traders, or sell the home (`heldByAccount`, `OWNS`), while `HOME_CAP` and deletion stay tied to the buying `char_id` (Knightly Order deeds remain knight-only). Sessionless `POST /v1/homes/yards` (`yardsKept`) reads town yards capped at `6,500` pieces (`DECOR_YARDS_TOWN_MAX`, `yard-town-full`).
- **Camps (`camps.js`):** Linked accounts pitch up to `CAMPS_MAX` camps spaced by `CAMP_GAP`, placing up to `CAMP_CAP` free `camp_pieces` queried across `3x3` pixel squares (`campsNear`).
- **Online guilds (`src/net/bunnyGuildLaw.js`):** `BUNNY_GUILD_LAW` defines factions `2001` to `2007` (Adventurers Guild, Bards' College, Cartographers' Society, Merchants' League, Hunters' Lodge, Apothecaries' Guild, and Artisans' Guild); Adventurers rank cuts Company rename costs by `5%` per rank.
- **Territories (`territory.js`, `charters.js`, `farms.js`, `garrisons.js`, `blight.js`):** Hall Companies project Renown-weighted `company_territory` circles, unite in `city_charters`, harvest `company_farms` (`farmInReach`), and field `garrisons` pushing back Rodney's blight (`rodney_blight`, also pushed via `/v1/blight/push`).
