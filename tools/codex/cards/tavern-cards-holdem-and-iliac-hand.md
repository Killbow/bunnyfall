---
slug: tavern-cards-holdem-and-iliac-hand
title: "Tavern Cards Overview: Hold'em, Iliac Hand, and the Shared Law"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/cardLaw.js
  - src/net/dice.js
  - src/net/holdemTable.js
  - src/net/iliacHand.js
  - src/net/iliacTable.js
  - src/cards/cardTableSession.js
  - src/cards/cardPatrons.js
  - src/world/cardTables.js
  - src/world/placedCardTable.js
  - src/scenes/worldModes.js
replacesBible:
  - "11-Multiplayer/Tavern-Cards.md"
related:
  - tavern-card-tables-seating-and-physics
  - holdem-relay-tables-and-gold-escrow
  - iliac-hand-rules-relay-and-ladder
  - iliac-card-items-sources-and-customs
  - identity-tokens-and-relay-seam
  - wire-protocol-and-frame-dispatch
invariants:
  - "Standard playing cards are integers `0..51` where rank is `c % 13` (`0` = deuce through `12` = ace) and suit is `floor(c / 13)` in clubs, diamonds, hearts, and spades order."
  - "`shuffleDeck` runs Fisher-Yates over `drawBelow`, which rejection-samples any value at or above the largest multiple of `m` below `2^32`."
  - "`src/net/cardLaw.js` is immutable: `newHand`, `act`, and `foldSeat` return a new state or `null` without mutating inputs or throwing on invalid actions."
  - "`viewFor` strips the deck and burn pile, revealing other seats' hole cards only at showdown for non-folded hands."
traps:
  - "Hold'em and Iliac Hand share the room table index space; a table hosts only one game at a time and rejects seats for the other game with `SIT_OTHER_GAME` (`src/cards/cardRemoteTable.js`)."
  - "Offline tables run locally in `cardTableSession.js` against AI patrons (`cardPatrons.js`), whereas online tables run on the relay (`holdemTable.js` or `iliacTable.js`) using `crypto.getRandomValues`."
tags:
  - multiplayer
  - cards
  - holdem
  - iliac-hand
  - tavern
  - architecture
---

Tavern card tables support two shared-law card games, Hold'em (`src/net/cardLaw.js`) and the collectible Iliac Hand (`src/net/iliacHand.js`), alongside a third table game, King's Gambit (`gambit` WebSocket frame, `/v1/gambit/claim`, and `/v1/gambit/board`, reusing `card_stakes` via `GAMBIT_STAKE_BB` at the gold table).

## Hold'em Rules and Offline Patrons

Hold'em seats 2 to 6 players (`HOLDEM_SEATS_MIN` / `HOLDEM_SEATS_MAX`) with zero rake. Heads-up, the button posts the small blind. Minimum raises match the previous full raise, short all-ins reopen action only when cumulative raises reach a full raise, and odd chips split left of the button. `timeoutAction` checks when legal and folds otherwise, while `foldSeat` folds disconnected or standing players out of turn without refunding committed pot chips.

In offline play (`src/cards/cardTableSession.js`), `TABLE_STAKES` sets the big blind by tavern quality (`<= 7`: `2`, `<= 13`: `10`, `<= 20`: `50`) with `20–100` bb buy-ins (`BUY_IN_MIN_BB` / `BUY_IN_MAX_BB`). AI patrons (`src/cards/cardPatrons.js`) carry `30–120` bb purses, pick from `PATRON_TEMPERS` (`tight`, `loose`, and `bluffer`), evaluate preflop via the Chen formula (`/ 20`), and estimate postflop equity across `EQUITY_SAMPLES = 200` Monte Carlo runs. Busted regulars sit out until the next in-game day via `REGULARS_BOOK_MAX` (`24`).

## Subcards

- `tavern-card-tables-seating-and-physics`: table placement, felt colors, seat poses, and deterministic card motion.
- `holdem-relay-tables-and-gold-escrow`: relay Hold'em tables, `card_stakes` escrow, and `c1` cash-out receipts.
- `iliac-hand-rules-relay-and-ladder`: 30-card decks, 6-turn simultaneous holdings play, `i1` receipts, and the season ladder.
- `iliac-card-items-sources-and-customs`: templates `581–583`, drop rates, binder UI, and offline import allowances.
