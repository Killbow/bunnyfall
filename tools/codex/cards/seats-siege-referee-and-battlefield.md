---
slug: seats-siege-referee-and-battlefield
title: "Siege Scheduling, Relay Referee, and Throne Capture"
domain: multiplayer
kind: subcard
parent: seats-arc-overview
files:
  - src/net/siegeRef.js
  - src/net/siegeReceipt.js
  - src/worldEvents/siegeField.js
  - server-account/src/seatBattles.js
  - server-account/src/seatSiege.js
  - server-account/src/seatRoyal.js
  - server/src/index.js
  - src/net/gateBrain.js
routes:
  - /v1/seats/window
  - /v1/seats/siege/sign
  - /v1/seats/siege/unsign
  - /v1/seats/siege/hire
  - /v1/seats/siege/withdraw
  - /v1/seats/siege/pass
  - /v1/seats/siege/claim
  - /v1/seats/siege/void
  - /v1/seats/royal/pass
  - /v1/seats/royal/claim
  - /v1/seats/sieges/live
tables:
  - town_seat_windows
  - town_seat_battles
  - town_seat_rosters
  - town_seat_hires
  - town_seat_results
  - town_seat_royal
replacesBible:
  - "11-Multiplayer/Seats-Arc.md"
related:
  - seats-arc-overview
  - seats-fortifications-and-seasons
  - integrity-pvp-duel-and-wild-referees
  - room-engine-and-hub-sharding
invariants:
  - "Dedicated relay rooms exist only for keys matching `SIEGE_ROOM` (`siege:<seat>:<week>`) or `ROYAL_ROOM` (`royal:<crown>:<week>`); all other room keys return HTTP `404`."
  - "The relay referee (`src/net/siegeRef.js`) enforces movement at `SIEGE_SPEED` (`18` m/s plus `0.5` m tolerance), melee cadence at `SIEGE_BLOWS_HZ` (`4` Hz), and spell limits via `SIEGE_CASTS` (`3` casts per `5000` ms, `damageMax: 60`)."
  - "`SIEGE_THRONE` capture requires holding `2` banners and a `120` s throne channel for a palace seat, or `3` banners and a `180` s channel for a crown seat."
  - "Team rosters cap at `SIEGE_SIDE_MAX` and `SIEGE_PLACES` (`10` palace, `20` crown) with up to `SIEGE_SPECTATORS_MAX` (`60`) spectators, reserving a disconnected fighter slot for `SIEGE_PLACE_KEPT_MS` (`5` minutes)."
  - "Attackers with zero presence for `SIEGE_FORFEIT_MS` (`10` minutes) after start forfeit automatically, and the room checkpoints state every `CHECKPOINT_MS` (`2000` ms, shared from `src/net/gateBrain.js`)."
  - "Palace holders pick battle windows between Wednesday and Saturday at `16:00` to `02:00` UTC (`SIEGE_WINDOW_DAYS`, `SIEGE_WINDOW_HOURS`), whereas crown sieges use fixed Saturday slots (`CROWN_SIEGE_SLOT` at `20:00`, `21:00`, and `22:00` UTC)."
traps:
  - "Receipt tags `k1`, `s1`, and `t1` identify signed Watch, Siege (`SIEGE_RECEIPT_V`), and Royal (`ROYAL_RECEIPT_V`) receipts rather than WebSocket frame types; live traffic uses `{t: 'siege', k: ...}` frames."
  - "`battleStep` steps the authoritative simulation every `SIEGE_TICK_MS`; never trust client-reported hit damage or positions."
dfu: []
tags:
  - siege
  - pvp
  - referee
  - relay
  - throne
---

# Siege Scheduling, Relay Referee, and Throne Capture

Seat battles pair D1 scheduling and roster routes (`server-account/src/seatBattles.js`, `server-account/src/seatSiege.js`, and `server-account/src/seatRoyal.js`) with an authoritative relay simulation in `src/net/siegeRef.js` and `server/src/index.js`.

- **Windows, rosters, and passes:** Palace holders set `town_seat_windows` via `/v1/seats/window` within `SIEGE_WINDOW_DAYS` and `SIEGE_WINDOW_HOURS` (Wednesday to Saturday, `16:00` to `02:00` UTC), while crown battles follow `CROWN_SIEGE_SLOT` (Saturday `20:00`, `21:00`, and `22:00` UTC) in `town_seat_battles` (listed by `/v1/seats/sieges/live`). Guilds manage `town_seat_rosters` and `town_seat_hires` (`SELLSWORDS_MAX`: `2` palace, `4` crown) through `/v1/seats/siege/sign`, `/v1/seats/siege/unsign`, `/v1/seats/siege/hire`, and `/v1/seats/siege/withdraw`, then fetch entry tokens from `/v1/seats/siege/pass` or `/v1/seats/royal/pass`.
- **Battlefield layout and referee bounds:** `siegeFieldOf` and `castleEntranceOf` (`src/worldEvents/siegeField.js`) place camps, banners, and the throne from the town layout. Inside `SIEGE_ROOM` (`siege:<seat>:<week>`) or `ROYAL_ROOM` (`royal:<crown>:<week>`), `battleStep` ticks every `SIEGE_TICK_MS` across `BATTLE_LENGTH_MS` (`30` min palace, `45` min crown, `20` min tourney, `2` h revolt) and checkpoints every `CHECKPOINT_MS` (`2000` ms). The referee caps sides at `SIEGE_SIDE_MAX` (`10` palace, `20` crown), spectators at `SIEGE_SPECTATORS_MAX` (`60`), speed at `SIEGE_SPEED`, melee at `SIEGE_BLOWS_HZ` (`4`), and spells at `SIEGE_CASTS`.
- **Throne capture and receipts:** Attackers must meet `SIEGE_THRONE` (`2` banners and `120` s hold for palace; `3` banners and `180` s for crown) or forfeit after `SIEGE_FORFEIT_MS` (`10` min) absent. Completion mints `s1` or `t1` receipts (`src/net/siegeReceipt.js`) settled at `/v1/seats/siege/claim`, `/v1/seats/royal/claim`, or `/v1/seats/siege/void` into `town_seat_results` and `town_seat_royal`.
