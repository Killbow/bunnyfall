---
slug: integrity-arc-overview
title: "Integrity Arc: Server Referees for Shared State"
domain: multiplayer
kind: overview
parent: null
files:
  - server-account/src/judge.js
  - server-account/src/verdict.js
  - server-account/src/ledger.js
  - src/net/siegeRef.js
  - src/net/bossBody.js
  - server-account/src/progress.js
  - src/characters/exteriorFoes.js
tables:
  - realm_characters
  - realm_config
replacesBible:
  - "06-Systems/Integrity-Arc.md"
related:
  - integrity-item-law-holds-and-wealth-budget
  - integrity-pvp-duel-and-wild-referees
  - integrity-boss-body-ledger
  - integrity-progression-seats-and-enemy-forge
  - economy-ledger-and-item-judge
  - identity-tokens-and-relay-seam
invariants:
  - "The game world simulates on clients; anything visible, tradeable, or rankable against other players is validated by the account server (checkpoints, ledger, and budgets) or refereed by the relay (PvP and boss fights)."
  - "Validation findings place a hold on a character (blocking trading, gathering, and crafting) without deleting or discarding its cloud save."
  - "Every budget-style threshold (`BUDGET_DEFAULT`, `BODY_DEFAULT`, and `PROGRESS_LINE`) ships with `enforce: false` to measure before enforcement."
traps:
  - "Relay-bundled modules (`src/net/wire.js`, `src/net/siegeRef.js`, and `src/net/bossBody.js`) increment the relay version on edit; never hardcode the version literal."
tags:
  - integrity
  - anti-cheat
  - referee
  - overview
---

The Integrity Arc keeps world simulation on clients while assigning shared, tradeable, or competitive state to account-server validators and relay referees across four lanes plus peer enemy stream caps.

## Integrity Lanes

- **Economy and item validation:** `server-account/src/judge.js` and `server-account/src/verdict.js` inspect checkpoints in `realm_characters` and apply non-destructive holds when findings or wealth outliers occur. `server-account/src/ledger.js` tracks unique item keys, while `server-account/src/budget.js` measures hourly wealth gains against `BUDGET_DEFAULT`.
- **PvP combat referees:** Relay modules (`src/net/siegeRef.js`, `src/net/duelRef.js`, and `src/net/wildRef.js`) track independent referee vitality, clip weapon reach and damage to signed arms bounds, enforce siege cast limits, and manage two-phase wild-zone fall escrow.
- **Boss fight body ledger:** `src/net/bossBody.js` evaluates boss blow landings and player vitality updates on the relay against `BODY_DEFAULT`, while `/v1/mod/realm-bodies` reports kill and damage metrics from `realm_config` and kill tables.
- **Progression and enemy stream caps:** `server-account/src/progress.js` gates `PROGRESS_ROUTES` on a seated, unheld realm character with play-hour buckets (`PROGRESS_LINE`), and `server-account/src/legacy.js` rejects invalid family records with `400 lineage-law`. On clients, `src/characters/exteriorFoes.js` caps peer-streamed enemy puppets per owner.

## Subcards

- `integrity-item-law-holds-and-wealth-budget`: strike escalation, ledger grace windows, piece escrow, and wealth bands.
- `integrity-pvp-duel-and-wild-referees`: referee vitality math, arms reach caps, duel timers, and wild-zone escrow.
- `integrity-boss-body-ledger`: delayed blow checks, vitality word buckets, and measurement reports.
- `integrity-progression-seats-and-enemy-forge`: seat checks, play-hour streams, lineage limits, and peer enemy puppet caps.
