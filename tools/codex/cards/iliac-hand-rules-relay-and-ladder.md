---
slug: iliac-hand-rules-relay-and-ladder
title: "Iliac Hand Rules, Relay Table, and Season Ladder"
domain: multiplayer
kind: subcard
parent: tavern-cards-holdem-and-iliac-hand
files:
  - src/net/iliacHand.js
  - src/net/iliacTable.js
  - src/net/iliacReceipt.js
  - src/net/iliacClaims.js
  - src/net/iliacCards.js
  - src/cards/iliacPatrons.js
  - src/cards/iliacTableSession.js
  - src/cards/iliacRemoteTable.js
  - src/cards/iliacTableGame.js
  - src/ui/iliacTableHud.js
  - src/render/iliacTableDraw.js
  - src/render/iliacCardFaces.js
  - server/src/index.js
  - server-account/src/iliac.js
routes:
  - /v1/cards/deck
  - /v1/iliac/claim
  - /v1/iliac/board
tables:
  - iliac_games
  - iliac_champions
replacesBible:
  - "11-Multiplayer/Tavern-Cards.md#iliac-hand"
  - "11-Multiplayer/Tavern-Cards.md#ladder"
related:
  - tavern-cards-holdem-and-iliac-hand
  - iliac-card-items-sources-and-customs
  - holdem-relay-tables-and-gold-escrow
  - world-events-and-signed-receipts
invariants:
  - "`deckValid` enforces exactly `ILIAC_DECK_SIZE` (`30`) known playable cards, with at most `ILIAC_COPIES_MAX` (`2`) copies of any card and `ILIAC_LEGENDARY_COPIES_MAX` (`1`) of any legendary-or-higher tier."
  - "Matches run `ILIAC_TURNS` (`6`) simultaneous turns across `ILIAC_HOLDINGS` (`3`) holdings (`ILIAC_ROOM = 4` cards per side each), with magicka climbing by `1` per turn up to `ILIAC_MAGICKA_MAX` (`10`) and hand size starting at `4` (max `7`)."
  - "All randomness (deck shuffles, 3 holdings from 11 `ILIAC_LOCATIONS`, and initial `coin`) is drawn in `newGame`; winning 2 of 3 holdings wins the match, breaking ties by total power across all holdings before declaring a draw."
traps:
  - "Equal board power ties only affect turn reveal order (`(state.coin + turn - 1) % 2`), whereas leading total board power reveals first."
  - "Ranked play has no matchmaking queue; a table game becomes ranked when two distinct accounts both sit with 60-second signed `'deck'` orders from `/v1/cards/deck` (`verifyOrder` kind `'deck'`)."
  - "Passing on the clock for `ILIAC_IDLE_TURNS` (`3`) consecutive turns stands the player up and concedes; disconnected ranked players are held for `ILIAC_GONE_MS` (`15 s`)."
tags:
  - iliac-hand
  - ccg
  - relay
  - ranked
  - ladder
  - receipts
---

Iliac Hand (`src/net/iliacHand.js`) runs offline against AI patrons (`src/cards/iliacPatrons.js`, `iliacTableSession.js`) or online over the `iliac` WebSocket frame (`ILIAC_FRAME_MAX = 2400`) in `src/net/iliacTable.js`. Online turns allow `ILIAC_TURN_MS` (`45 s`, passing on timeout), with `ILIAC_FIRST_MS` (`3 s`) before turn 1, `ILIAC_GAP_MS` (`8 s`) between games, and up to `ILIAC_RESULTS_MAX` (`32`) cached results.

## Deck Orders and `i1` Receipts

To play ranked, a registered player calls `/v1/cards/deck` (`server-account/src/iliac.js`), where `deckOrderOf` verifies via `deckShortOf` that the realm save owns every card before calling `mintDeckOrder` (`60 s` TTL). When a ranked game finishes (`ILIAC_HOW`: `'holdings'`, `'power'`, `'draw'`, or `'left'`), the relay signs an `i1` receipt (`ILIAC_RECEIPT_TTL_S = 7 days` in `src/net/iliacReceipt.js`). The client stores up to 32 pending claims (`src/net/iliacClaims.js`) and retries `/v1/iliac/claim` every `ILIAC_CLAIM_RETRY_MS` (`5 min`).

## Season Ladder and Champions

`/v1/iliac/claim` inserts into `iliac_games` and updates Elo (`eloAfter` and `arenaSeasonOf`, guarded by `RATING_NOW_SQL` over `ILIAC_RATE_TRIES = 4` retries) when both accounts are registered and within arena pair caps (`ARENA_PAIR_DAY_MAX`, `ARENA_PAIR_SEASON_MAX`). `/v1/iliac/board` returns the top `ILIAC_BOARD_TOP` (`10`) players plus the caller. At season end, `iliac_champions` awards the `iliacchampion` title to the top-rated player with at least `ILIAC_CHAMPION_MIN_GAMES` (`10`) games against `ILIAC_CHAMPION_MIN_FOES` (`5`) distinct opponents.
