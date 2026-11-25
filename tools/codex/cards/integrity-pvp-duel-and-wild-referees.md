---
slug: integrity-pvp-duel-and-wild-referees
title: "PvP Referees: Arms Bounds, Duels, and Wild Zone Falls"
domain: multiplayer
kind: subcard
parent: integrity-arc-overview
files:
  - src/net/siegeRef.js
  - src/net/duelRef.js
  - src/net/duelSession.js
  - src/net/wildRef.js
  - src/net/wildLaw.js
  - src/net/wildReceipt.js
  - server-account/src/wild.js
  - src/net/online.js
  - server/src/index.js
routes:
  - /v1/duel/claim
  - /v1/duel/loss
  - /v1/wild/fall
  - /v1/wild/collect
  - /v1/wild/reclaim
tables:
  - duel_results
  - wild_falls
  - wild_escrow
replacesBible:
  - "06-Systems/Integrity-Arc.md"
related:
  - integrity-arc-overview
  - identity-tokens-and-relay-seam
  - room-engine-and-hub-sharding
invariants:
  - "Referee vitality equals `300 + 2 * renownLevel` from the signed relay token and never alters persistent character health."
  - "Incoming blows are clipped to signed weapon bounds, capped by `ARMS_TOP_MAX` (`32`, pinned to `TOKEN_ARMS_TOP_MAX`)."
  - "`SIEGE_CASTS` permits at most `3` casts per `5000` ms window, with `damageMax = 60` and `healMax = 40`."
  - "Guildmates count as kin in the wild zone and cannot damage each other."
  - "Wild falls settle through two-phase escrow so the victim loses the selected worn item only when the killer collects it."
traps:
  - "A wild-zone death caused by an enemy rather than a player drops nothing."
  - "Player kills in the wild zone drop bag and cart items plus a tenth of the purse (`FOE-KEEPS`), while worn gear stays on the victim except for the single worn piece the killer picks."
tags:
  - integrity
  - pvp
  - duel
  - wild-zone
  - escrow
---

Relay referees in `server/src/index.js` and `src/net/online.js` validate player-versus-player combat across sieges, duels, and wild zones so clients cannot forge health, weapon reach, or loot drops.

## Referee Vitality, Arms Bounds, and Duels

In `src/net/siegeRef.js`, each fighter receives referee vitality of `300 + 2 * renownLevel` from the signed token, leaving saved character health untouched. Weapon blows are clipped to token-signed reach and damage bounds up to `ARMS_TOP_MAX = 32` (pinned to `TOKEN_ARMS_TOP_MAX`). `SIEGE_CASTS` limits spell casts to 3 per 5,000 ms window (`damageMax: 60`, `healMax: 40`).

Duels (`src/net/duelRef.js` and `src/net/duelSession.js`) enforce `DUEL_REF` timers (`startWaitMs: 8000` and `outMs: 2000`) and `ROYAL_RING` bounds (`radiusM: 12`, `countdownMs: 3000`, and `boutMs: 300000`). Completed bouts record outcomes in `duel_results` through `/v1/duel/claim` and `/v1/duel/loss`.

## Wild Zone Combat and Two-Phase Escrow

`src/net/wildRef.js` tracks up to `fightersMax: 200` and `fallsMax: 64` with `mendMs: 30000`, `pickMs: 60000`, `truceMs: 600000`, `WILD_ZONE_KEEP_MS = 15000`, and `WDUN_KIN_SILENT_MS = 5000`. Guildmates are treated as kin and cannot attack one another.

When a player falls to another player, `src/net/wildLaw.js`, `src/net/wildReceipt.js`, and `server-account/src/wild.js` settle spoils through `wild_falls` and `wild_escrow` (`/v1/wild/fall`, `/v1/wild/collect`, and `/v1/wild/reclaim`) under `WILD_FALL_GRACE_S = 30`, `WILD_FALLS_KEEP_S = 7200`, and `WILD_RECORD_BYTES_MAX = 4096`. Enemy kills drop nothing. Player kills drop bag and cart items plus 10% of purse gold, and the victim loses at most one worn piece only after the killer collects it from escrow.
