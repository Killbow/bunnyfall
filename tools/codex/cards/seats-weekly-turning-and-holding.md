---
slug: seats-weekly-turning-and-holding
title: "Weekly Turning, Upkeep, Standing, Edicts, and Fealty"
domain: multiplayer
kind: subcard
parent: seats-arc-overview
files:
  - server-account/src/seatTurning.js
  - server-account/src/seatHolding.js
  - server-account/src/seatPolitics.js
  - src/net/townSeatLaw.js
  - src/ui/seatTab.js
  - server-account/migrations/0050_seat_turning.sql
  - server-account/migrations/0056_fealty_pacts.sql
routes:
  - /v1/seats/tithe
  - /v1/seats/edict
  - /v1/seats/bounty
  - /v1/seats/relinquish
  - /v1/seats/fealty
  - /v1/seats/fealty/accept
  - /v1/seats/fealty/break
  - /v1/seats/pact
  - /v1/seats/pact/break
tables:
  - town_seat_weeks
  - town_seat_settling
  - town_seat_holds
  - town_seat_rights
  - town_seat_edicts
  - town_seat_levies
  - guild_fealty
  - guild_pacts
replacesBible:
  - "11-Multiplayer/Seats-Arc.md"
related:
  - seats-arc-overview
  - seats-witness-registry-and-influence
  - seats-siege-referee-and-battlefield
invariants:
  - "`turningPlan` computes a pure settlement plan that `settleWeek` applies idempotently when `settleDueOnce` triggers on the first request after the weekly boundary."
  - "Concurrent settlements coordinate through a `SETTLE_LEASE_S` (`60` s) lease in `town_seat_settling`, and a single pass settles at most `SETTLE_WEEKS_MAX` (`8`) weeks."
  - "A seat that changed hands at the previous Turning enters a one-week truce (`holder.truceWeek`) and cannot be challenged during that week."
  - "Seat Standing begins at `STANDING_START` (`50`), caps at `STANDING_MAX` (`100`), and triggers a revolt (`revoltDue`) whenever it drops to `0`."
  - "`edictMayFollow` forbids repeating the same Edict in consecutive weeks except for Market Day (`repeat: true`), while Conscription and Royal Tourney apply only to crown seats."
  - "`OVERREACH` adds `OVERREACH.upkeep` (`0.25`) upkeep and subtracts `OVERREACH.defence` (`0.05`) defense for each extra point of `SEAT_WEIGHT` (`1` per palace, `3` per crown)."
traps:
  - "When the top two challengers for an unheld seat finish within `CONTESTED_MARGIN` (`0.1`), the seat becomes Contested and issues a Tourney Right rather than an immediate award."
  - "A guild listed in `town_seat_holds` or holding a pending Right in `town_seat_rights` cannot disband until both clear."
dfu: []
tags:
  - seats
  - turning
  - standing
  - edicts
  - fealty
  - pacts
---

# Weekly Turning, Upkeep, Standing, Edicts, and Fealty

Every `SEAT_WEEK_MS` cycle ends at the Sunday `18:00` UTC Turning after a 2-day Reckoning window (`SEAT_RECKONING_MS`), managed by `server-account/src/seatTurning.js`, `server-account/src/seatHolding.js`, `server-account/src/seatPolitics.js`, and `src/ui/seatTab.js`.

- **Idempotent Turning settlement (`0050_seat_turning.sql`):** `settleDueOnce` acquires a `SETTLE_LEASE_S` (`60` s) lock in `town_seat_settling` and runs `settleWeek` across up to `SETTLE_WEEKS_MAX` (`8`) elapsed weeks in `town_seat_weeks`. `turningPlan` evaluates `town_seat_holds`, deducts upkeep (scaled by `OVERREACH.upkeep = 0.25` and `OVERREACH.defence = 0.05` per extra `SEAT_WEIGHT`, where palaces weigh `1` and crowns weigh `3`), respects `holder.truceWeek`, and issues Siege or Tourney Rights in `town_seat_rights` (whenever top challengers sit within `CONTESTED_MARGIN = 0.1`).
- **Standing, tithes, edicts, and bounties:** Holders start at `STANDING_START` (`50`, max `STANDING_MAX = 100`) and face a revolt (`revoltDue`) at `0`. Through `/v1/seats/tithe`, `/v1/seats/edict`, `/v1/seats/bounty`, and `/v1/seats/relinquish`, rulers set tithes in `town_seat_levies` up to `TITHE_CAP` (`10` palace, `15` crown) and issue `town_seat_edicts` checked by `edictMayFollow` (only Market Day has `repeat: true`; Conscription and Royal Tourney require a crown seat).
- **Fealty and pacts (`0056_fealty_pacts.sql`):** Palace holders swear or break fealty to a crown seat via `/v1/seats/fealty`, `/v1/seats/fealty/accept`, and `/v1/seats/fealty/break` (`guild_fealty`), routing `FEALTY.tribute` (`0.05`) upward. Guilds form or dissolve non-aggression pacts in `guild_pacts` via `/v1/seats/pact` and `/v1/seats/pact/break`, lasting until `pactUntil` at the end of the Season.
