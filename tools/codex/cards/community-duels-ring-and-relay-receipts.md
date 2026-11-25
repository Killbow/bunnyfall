---
slug: community-duels-ring-and-relay-receipts
title: "Duels: Challenge, Ring, Striker Blows, and Relay-Signed Results"
domain: multiplayer
kind: subcard
parent: community-arc-overview
files:
  - src/net/duelSession.js
  - src/net/duelRef.js
  - src/net/duelReceipt.js
  - src/net/duelRecord.js
  - src/ui/duelPrompt.js
  - src/player/motor.js
  - src/render/duelWall.js
  - src/combat/duelCombat.js
  - src/characters/playerEntity.js
  - server/src/message/frames/duel.js
  - server-account/src/routes/playRoutes.js
  - server-account/src/accounts.js
  - server-account/migrations/0008_duels.sql
routes:
  - /v1/duel/claim
  - /v1/duel/loss
  - /v1/duel/record
tables:
  - duel_results
replacesBible:
  - "06-Systems/Community-Arc.md"
related:
  - community-arc-overview
  - integrity-pvp-duel-and-wild-referees
  - arena-colosseum-overview
invariants:
  - "Asking: DUEL_ASK_TTL_MS = 30000, DUEL_REASK_MS = 15000, DUEL_RANGE_M = 10. Then DUEL_START_WAIT_MS = 8000 and DUEL_COUNTDOWN_MS = 3000."
  - "Ring: DUEL_RADIUS_M = 12, enforced by motor._keepInArena through duelSession clampToRing. Leaving the ring: DUEL_OUT_MS = 2000. Bout cap: DUEL_MAX_MS = 5 min. DUEL_HEAL_HOLD_MS = 2000."
  - "The duelWall cylinder extends DUEL_WALL_BELOW_M = 4 m underground. DUEL_CLOCK_PERIOD = 120."
  - "Blows are counted on the striker machine (`duelAttackerOf`, `duelStub` against `duelStandIn`) and clipped by the relay referee (`DUEL_HZ_MAX = 10`)."
  - "A melee claim requires a position within `DUEL_MELEE_POS_SLACK_M = 3` m and a `DUEL_TRAIL_MS = 500` trail; `duelWearDamage` caps weapon wear at `DUEL_WEAR_MULT` (6) times the top weapon roll."
  - "Results are relay-signed receipts claimed at /v1/duel/claim (claimDuel). Each counts once by bout id. A draw records nothing."
  - "Recording needs two registered accounts, at most DUEL_PAIR_DAY_MAX = 10 per pair and DUEL_WINNER_DAY_MAX = 20 per winner per day, checked inside the single INSERT."
traps:
  - "/v1/duel/loss is retired and answers 410 'retired'. Never rely on the loser's own report."
  - "duel_results has no counter columns. Wins and losses are COUNT(*) over winner and loser rows (duelRecordOf)."
  - "The defender-side resolution helpers (duelSpellFromWire, duelBlowPlausible) are dormant. Do not wire them back in."
dfu: []
tags:
  - duel
  - pvp
  - arena-ring
  - receipt
  - integrity
---

# Duels: Challenge, Ring, Striker Blows, and Relay-Signed Results

Peer duels run from the Inspect Challenge button (`src/ui/duelPrompt.js`) through `src/net/duelSession.js`, `src/combat/duelCombat.js`, and the relay referee (`src/net/duelRef.js` and `server/src/message/frames/duel.js`).

## Challenge Timers, Ring Bounds, and Striker Resolution

- **Challenge and ring:** Invitations require `DUEL_RANGE_M = 10` with `DUEL_ASK_TTL_MS = 30000` and `DUEL_REASK_MS = 15000`, followed by `DUEL_START_WAIT_MS = 8000` and `DUEL_COUNTDOWN_MS = 3000`. `motor._keepInArena` (`src/player/motor.js`) calls `clampToRing` at `DUEL_RADIUS_M = 12` (with `DUEL_OUT_MS = 2000`, `DUEL_MAX_MS = 5` minutes, and `DUEL_HEAL_HOLD_MS = 2000`), while `src/render/duelWall.js` sinks its cylinder `DUEL_WALL_BELOW_M = 4` m underground (`DUEL_CLOCK_PERIOD = 120`).
- **Striker-counted blows:** Hits resolve on the striker client (`duelAttackerOf` and `duelStub` against `duelStandIn`) and are clipped by the relay referee at `DUEL_HZ_MAX = 10`; dormant defender helpers (`duelSpellFromWire` and `duelBlowPlausible`) stay unwired. Melee hits require `DUEL_MELEE_POS_SLACK_M = 3` m and a `DUEL_TRAIL_MS = 500` trail, `duelWearDamage` caps wear at `DUEL_WEAR_MULT` (6) times the top weapon roll, and `playerEntity` (`src/characters/playerEntity.js`) spares the loser at a 1 HP floor.

## Relay Receipts and Account Records

`/v1/duel/loss` returns HTTP 410 `'retired'`. Instead, `claimDuel` submits relay-signed receipts (`src/net/duelReceipt.js`) to `/v1/duel/claim`, deduplicated by bout id in `duel_results` (`0008_duels.sql`, extended in `0104_referee.sql`), while draws record nothing. The `INSERT` requires two registered accounts within `DUEL_PAIR_DAY_MAX = 10` and `DUEL_WINNER_DAY_MAX = 20` per day, and `duelRecordOf` (`src/net/duelRecord.js` and `/v1/duel/record`) tallies wins and losses via `COUNT(*)`.
