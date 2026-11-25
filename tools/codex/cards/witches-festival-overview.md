---
slug: witches-festival-overview
title: "Witches' Festival: Calendar, Switches, and Hosts"
domain: systems
kind: overview
parent: null
files:
  - src/net/festivalLaw.js
  - src/mods/contentOff.js
  - server-account/src/festival.js
  - src/systems/festival/festivalClient.js
  - src/homes/witchesHost.js
  - src/scenes/world.js
  - src/net/starfall/starfallLaw.js
  - src/world/holidayTables.js
  - server-account/wrangler.toml
  - selfhost/accounts.toml
routes:
  - /v1/festival/mine
tables:
  - players
replacesBible:
  - "06-Systems/Witches-Festival.md"
related:
  - witches-festival-soul-cake-finds
  - witches-festival-wyrd-sister-sales
  - witches-festival-hearth-offerings
  - witches-festival-town-dressing
  - starfall-overview
  - economy-ledger-and-item-judge
invariants:
  - "`src/net/festivalLaw.js` defines the shared festival rules and numeric caps imported by both the client and `server-account/src/festival.js`."
  - "`festivalAt(nowMs)` returns `null` unless `contentOn('witchesFestival')` is true and `nowMs` falls within a `FESTIVALS` row (`fromMs` inclusive, `toMs` exclusive)."
  - "Server mutations pass through `gate` first, returning `guest` (`403`) for guests, `closed` (`409`) when the switch or date window is shut, and `rate` (`429`) when the isolate rate limit (`FEST_OPS_MAX = 900` per `FEST_OPS_WINDOW_S = 3600` seconds) is spent."
  - "`festivalOpenFor` returns true when `FESTIVAL_OPEN` is `'on'`, or `'dev'` for accounts matching `isDeveloper(player, env)`; any other value disables the service."
  - "Client `festivalShut()` returns `'offline'` (unbound or no relay), `'guest'`, `'closed'`, or `null` when the festival is active."
  - "Client festival state begins as `UNHEARD` with every count set to `null` (unknown, never zero) and is scoped to the signed-in account (`_stateOf`)."
traps:
  - "`CONTENT.witchesFestival` in `src/mods/contentOff.js` is currently `false`, which overrides `FESTIVAL_OPEN = \"on\"` and keeps both the Witches' Festival and Starfall closed."
  - "`FESTIVALS` defines only the `'witches-2026'` window; running the event in a later year requires adding a new `FESTIVALS` entry alongside enabling the content flag."
  - "`src/scenes/exterior.js` (`?exterior`) and `src/scenes/dungeonContext.js` do not mount a festival host because they have no account service or town streets."
dfu:
  - Assets/Scripts/Game/PlayerEnterExit.cs
tags:
  - witches-festival
  - live-event
  - seasonal
  - calendar
  - content-off
---

# Witches' Festival: Calendar, Switches, and Hosts

The Witches' Festival is a seasonal online event coordinated across `src/net/festivalLaw.js`, `src/mods/contentOff.js`, `server-account/src/festival.js`, `src/systems/festival/festivalClient.js`, and `src/homes/witchesHost.js`. In Daggerfall lore (`src/world/holidayTables.js`, `PlayerEnterExit.ShowHolidayText`), the festival corresponds to holiday `43` on 13 Frostfall (`TEXT.RSC` `8392`), while Tales and Tallows (holiday `38`) also counts as an in-game festival night.

## Calendar Window, Switches, and Scene Hosts

- **Schedule (`src/net/festivalLaw.js`, `src/net/starfall/starfallLaw.js`):** `FESTIVALS[0]` (`id: 'witches-2026'`) runs from `Date.UTC(2026, 9, 20)` (`fromMs`, inclusive) to `Date.UTC(2026, 10, 8)` (`toMs`, exclusive), with the real-world eve window spanning `Date.UTC(2026, 9, 31)` to `Date.UTC(2026, 10, 1)`. `festivalAt(nowMs)` checks `contentOn('witchesFestival')` before scanning `FESTIVALS`, and `starfallRuns(nowMs)` aliases `festivalOpen(nowMs)`.
- **Service gate (`server-account/src/festival.js`, `server-account/wrangler.toml`, `selfhost/accounts.toml`):** `festivalSwitchOf` reads `FESTIVAL_OPEN` (`'on'`, `'dev'`, or off). Every mutation checks `gate` for guest status, switch and calendar availability, and a per-isolate rate limit (`FEST_OPS_MAX = 900` operations per `FEST_OPS_WINDOW_S = 3600` seconds under key `fest:<id>`), mapping refusals via `FEST_STATUS` (`guest: 403`, `closed: 409`, `rate: 429`, `capped: 429`).
- **Client state and hosts (`src/systems/festival/festivalClient.js`, `src/homes/witchesHost.js`, `src/scenes/world.js`):** `world.js` and `worldModes.js` mount `createWitchesHost`, whereas `exterior.js` and `dungeonContext.js` mount no festival host. Calling `refreshFestival()` queries `/v1/festival/mine` for `{ cakes, bowls, wares, given, taken, today, open, offerings }` and resumes any pending purchase.
