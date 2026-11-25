---
slug: integrity-progression-seats-and-enemy-forge
title: "Progression Seats, Play-Hour Lines, Lineage Law, and Enemy Forge Caps"
domain: multiplayer
kind: subcard
parent: integrity-arc-overview
files:
  - server-account/src/progress.js
  - server-account/src/index.js
  - server-account/src/door.js
  - server-account/src/legacy.js
  - src/systems/legacy/legacyLaw.js
  - src/characters/exteriorFoes.js
  - src/net/wire.js
routes:
  - /v1/renown/xp
  - /v1/raid/claim
  - /v1/seats/bounty
  - /v1/seats/orc-camp
  - /v1/seats/watch
  - /v1/towns/watch
  - /v1/marks/find
  - /v1/prof/harvest
  - /v1/prof/smelt
  - /v1/prof/craft
  - /v1/prof/brew
  - /v1/prof/disenchant
  - /v1/prof/temper
  - /v1/writs/deliver
  - /v1/realm/lineage
  - /v1/mod/realm-progress
tables:
  - progress_play
  - progress_hours
  - realm_characters
  - realm_config
replacesBible:
  - "06-Systems/Integrity-Arc.md"
related:
  - integrity-arc-overview
  - market-vendors-and-professions
  - feud-online-wire-and-revenant-ui
invariants:
  - "Every `PROGRESS_ROUTES` claim requires a seated, unheld realm character; `seatRefusalOf` failures return HTTP `403`."
  - "When `PROGRESS_LINE.enforce` is enabled, an exhausted stream bucket returns `429 progress-play`, and buckets refill per hour of server-measured play."
  - "Lineage submissions violating family rules return `400 lineage-law`, while records exceeding the people cap return `413 lineage-too-large`."
  - "Receiving clients spawn at most `PEER_PUPPETS_TOTAL_MAX` (`CELL_FRAME_RECORDS_MAX`, `64`) enemies per owner, capped at `PEER_ELITE_PUPPETS_MAX` (`8`) elites, `PEER_REVENANT_PUPPETS_MAX` (`9`) revenants, and `PEER_CHAMPION_PUPPETS_MAX` (`17`) champions; excess special ranks downgrade to plain enemies."
traps:
  - "Enemies transferred via peer handover still count toward their original owner's puppet totals."
  - "Under enforcement, `/v1/renown/xp` claims are clamped to the remaining bucket capacity rather than rejected with `429`."
tags:
  - integrity
  - progression
  - lineage
  - enemy-forge
  - puppets
---

Progression integrity pairs account-server seat and play-hour gates (`server-account/src/progress.js`, `server-account/src/door.js`, and `server-account/src/index.js`) with lineage validation (`server-account/src/legacy.js`) and client-side enemy puppet limits (`src/characters/exteriorFoes.js`).

## Seated Progression and Play-Hour Buckets

Every endpoint in `PROGRESS_ROUTES` checks `seatRefusalOf` against `realm_characters` and returns `403` if the character lacks an active seat or carries a hold. `PROGRESS_LINE` (`enforce: false` by default in `realm_config`, inspected via `/v1/mod/realm-progress`) tracks eight streams in `progress_play` and `progress_hours`: `renown`, `raid`, `bounty`, `camp`, `watch`, `find`, `gather`, and `prof` (where `prof` refills at `rate: 10000` up to `cap: 20000` per play hour). When enforcement is active, empty buckets return `429 progress-play`, except `/v1/renown/xp` trims the award to the available room.

## Lineage Validation and Peer Enemy Caps

`POST /v1/realm/lineage` (`server-account/src/legacy.js`) enforces `LINEAGE_PEOPLE_MAX = 400` (returning `413 lineage-too-large` when exceeded) and validates family rules from `src/systems/legacy/legacyLaw.js` (`BLOOD_MAX = 3`, `HEARTH_MAX = 3`, `ESTATE_SHARE = 0.25`, `ESTATE_MAX = 9900`, `REMAINS_GOLD_SHARE = 0.1`, and `REMAINS_GOLD_MAX = 2500`), rejecting invalid trees with `400 lineage-law`.

On receiving clients, `src/characters/exteriorFoes.js` bounds peer-streamed enemies per original owner (even after handover) to `PEER_PUPPETS_TOTAL_MAX` (`CELL_FRAME_RECORDS_MAX = 64` in `src/net/wire.js`). Within that total, special promotions cap at `PEER_ELITE_PUPPETS_MAX = 8`, `PEER_REVENANT_PUPPETS_MAX = 9`, `PEER_CHAMPION_PUPPETS_MAX = 17`, and one Greater Giant per zone index (`gg`), downgrading any overflow to standard enemies.
