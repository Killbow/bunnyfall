---
slug: witches-festival-soul-cake-finds
title: "Soul Cake Finds, Daily Caps, and Pack Faces"
domain: systems
kind: subcard
parent: witches-festival-overview
files:
  - src/net/festivalLaw.js
  - server-account/src/festival.js
  - src/systems/festival/festivalClient.js
  - src/systems/festival/festivalFoes.js
  - src/systems/questlines/qlActs.js
  - src/systems/festival/soulCake.js
  - src/systems/festival/festivalRows.js
  - src/saves/save.js
  - src/items/itemLaw.js
  - src/net/realmTradeLaw.js
  - server-account/migrations/0140_festival.sql
routes:
  - /v1/festival/find
  - /v1/festival/mine
tables:
  - players
  - fest_finds
replacesBible:
  - "06-Systems/Witches-Festival.md"
related:
  - witches-festival-overview
  - elite-breach-weir-key-and-stakes
  - economy-ledger-and-item-judge
invariants:
  - "The account server rolls every find authoritatively (`dice(rand) < FIND_SOURCES[source].p`); the client reports only the `source` key."
  - "Each UTC day (`utcDay`) caps an account at `FIND_ASKS_PER_DAY = 1500` requests and `FIND_CAKES_PER_DAY = 120` Soul Cakes via guarded `UPDATE` statements on `fest_finds`."
  - "`findCount` multiplies the base yield `n` by `FIND_NIGHT_MULT = 2` whenever `deadWalk(dayOfYear, nowMs)` is true (either an in-game festival night or 31 October UTC, never stacking beyond `2x`)."
  - "`players.fest_cakes` is authoritative; the Soul Cake stack in the player pack is a display mirror that `restackSoulCakes` synchronizes on every server response."
  - "Soul Cake (template `2000`) and Hearth Offering (template `2001`) items are bound, stackable, `packOnly`, and listed in `BOUND_TEMPLATES`; `foldStrayFaces` strips copies from wagons, chests, and room decor on save load."
  - "Only player kills qualify: `neverPays` excludes city watch (`KNIGHT_CITY_WATCH`) and `PlayerAlly` kills, and a `WeakSet` ensures each body is queried at most once."
  - "Acts reported in the same turn share a single find request per `ACT_KINDS` group, while `elite-foe-slain` and `wyrd-met` never request a find."
traps:
  - "Find requests run sequentially one at a time; a network failure is neither queued nor retried because no server roll occurred."
  - "When `/v1/festival/find` returns `capped` or `today >= 120`, the client halts requests until the next UTC day and notifies the player once (`sayDayFull`)."
  - "A `worldBoss` corpse never triggers an enemy find; its Soul Cake roll comes from the `endgame` act instead."
dfu: []
tags:
  - witches-festival
  - soul-cake
  - drops
  - caps
  - server-authoritative
---

# Soul Cake Finds, Daily Caps, and Pack Faces

Soul Cake drops, daily limits, and inventory mirrors are governed by `src/net/festivalLaw.js`, `server-account/src/festival.js`, `src/systems/festival/festivalClient.js`, and `src/systems/festival/soulCake.js`, backed by schema definitions in `server-account/migrations/0140_festival.sql`.

## Drop Sources, Multipliers, and Daily Caps

- **Source probabilities (`FIND_SOURCES` in `src/net/festivalLaw.js`):** Each source defines `(p, n)`: `` `foe` `` (`0.25`, `1`), `undead` (`0.5`, `1`), `daedra` (`0.5`, `1`), `elite` (`1`, `2`), `gather` (`0.2`, `1`), `make` (`0.3`, `1`), `loot` (`0.3`, `1`), `tavern` (`1`, `2`), `sea` (`0.5`, `2`), `world` (`1`, `2`), and `endgame` (`1`, `4`).
- **Kill and deed routing (`src/systems/festival/festivalFoes.js`, `src/systems/questlines/qlActs.js`):** `foeFindSource` classifies elite or champion enemies as `'elite'`, undead or summoned enemies (`FESTIVAL_UNDEAD`, `FESTIVAL_SUMMONED`) as `'undead'` or `'daedra'`, and standard enemies as `` `'foe'` ``. `neverPays` skips `KNIGHT_CITY_WATCH`, `PlayerAlly`, and `worldBoss` bodies. Classic quest completions and paid bounties each trigger a `'world'` find, while same-turn deeds collapse by `ACT_KINDS`.
- **Night multiplier and D1 guards (`server-account/src/festival.js`):** Over `/v1/festival/find`, `findCount` doubles `n` (`FIND_NIGHT_MULT = 2`) when `deadWalk(dayOfYear, nowMs)` holds. Guarded updates on `fest_finds` enforce `FIND_ASKS_PER_DAY = 1500` and `FIND_CAKES_PER_DAY = 120` per `utcDay` before incrementing `players.fest_cakes`.

## Pack Mirror Items

`src/systems/festival/festivalRows.js`, `src/items/itemLaw.js` (`ITEM_LAW_VERSION`), and `src/net/realmTradeLaw.js` (`BOUND_TEMPLATES`) register Soul Cake (`2000`) and Hearth Offering (`2001`) as bound, stackable, `packOnly` rows. `restackSoulCakes` rewrites the pack stack from `players.fest_cakes` after `/v1/festival/mine` or `/v1/festival/find`, and `foldStrayFaces` (`src/saves/save.js`) purges stray copies from wagons, chests, and decor on load.
