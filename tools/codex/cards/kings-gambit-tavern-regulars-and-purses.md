---
slug: kings-gambit-tavern-regulars-and-purses
title: "King's Gambit Tavern Regulars: Tiers, AI Scoring, Stakes, and Night Purses"
domain: multiplayer
kind: subcard
parent: kings-gambit-overview
files:
  - src/cards/gambit/gambitPatrons.js
  - src/cards/gambit/gambitTableSession.js
  - src/cards/gambitTableGame.js
  - src/world/cardRegulars.js
  - src/saves/save.js
  - src/scenes/worldModes.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Kings-Gambit.md"
related:
  - kings-gambit-overview
  - kings-gambit-turns-combat-and-hazards
  - tavern-card-tables-seating-and-physics
  - tavern-cards-holdem-and-iliac-hand
invariants:
  - "`tierFor(seed)` maps `((imul(seed | 0, 73856093) ^ 0x127409F) % 100 + 100) % 100` against `GAMBIT_TIER_BANDS` (`[40, 75, 93]`) to select `GAMBIT_TIERS`: `amateur` (base stake `10`, budget `220`, `2` potions, blunder `0.35`), `seasoned` (`50`, `300`, `3`, `0.15`), `veteran` (`200`, `360`, `3`, `0.05`), or `grandmaster` (`1000`, `450`, `4`, `0`)."
  - "Offline stakes multiply the tier base stake by `GAMBIT_STAKE_MULTS` (`[1, 2, 5]`); a player victory returns `GAMBIT_WIN_PAYS` (`2`) times the stake, while a loss or forfeit leaves the stake with the regular."
  - "Each regular pays out at most `GAMBIT_NIGHT_MULT` (`15`) times the tier base stake in net losses per in-game day, tracked across up to `GAMBIT_PURSES_BOOK_MAX` (`24`) taverns in `gambitPurses`; stakes exceeding the remaining purse are refused, and an exhausted regular plays for zero gold."
traps:
  - "Saving is blocked while an offline stake is on the table (`gambitStaked` in `src/scenes/worldModes.js`), and loading a save abandons any open match without settling gold because the save predates the deal."
  - "Offline matches have no turn timer, so a stalemate (such as two kings remaining) continues until the player wins or forfeits."
  - "AI candidate scores run in float32 with `GAMBIT_JITTER` (`0.1`) times `Random.value`, so changing floating-point precision shifts tie-breaking."
dfu: []
tags:
  - kings-gambit
  - ai
  - regulars
  - economy
  - save
---

Offline King's Gambit tables (`src/cards/gambit/gambitTableSession.js`) pit the player against deterministic tavern regulars (`src/cards/gambit/gambitPatrons.js` and `src/world/cardRegulars.js`) whose daily net losses persist in `src/saves/save.js`.

## Regular Tiers, Stakes, and Night Purses

`tierFor(seed)` hashes the patron seed against `GAMBIT_TIER_BANDS` (`[40, 75, 93]`) to pick one of four `GAMBIT_TIERS`: `amateur` (base stake `10`, budget `220`, `2` potions, blunder `0.35`), `seasoned` (`50`, `300`, `3`, `0.15`), `veteran` (`200`, `360`, `3`, `0.05`), or `grandmaster` (`1000`, `450`, `4`, `0`). In `dealRegular`, the player sits as side `0` (`KG_POINT_BUDGET` `300`, `3` potions, and crown `gambitCrown` from `GAMBIT_CROWNS`, default `daggerfall`), while side `1` rolls `regularArmy` via `autoFill` before generating the board.

Players wager the tier base stake times `GAMBIT_STAKE_MULTS` (`[1, 2, 5]`), winning `GAMBIT_WIN_PAYS` (`2`) times the wager on victory. Daily net payouts per regular cap at `GAMBIT_NIGHT_MULT` (`15`) times the tier base stake (net of gold won back from the player) and persist in `gambitPurses` (`GAMBIT_PURSES_BOOK_MAX` `24` taverns). Once spent, the regular plays only free games. `gambitStaked` (`src/scenes/worldModes.js`) blocks saving while gold is staked.

## AI Action Scoring and Pacing

`regularAction` scores choices in float32 with `GAMBIT_JITTER` (`0.1`):
1. Drink a potion below `GAMBIT_POTION_LINE` (`0.5` of max HP for the king, `0.3` for other units).
2. Roll blunders against the tier blunder rate (`GAMBIT_BLUNDER_STRIKE` `0.5`).
3. Score attacks via `GAMBIT_BLOW_WEIGHTS` (king `40`, lethal `30`).
4. Score moves via `GAMBIT_MOVE_WEIGHTS` and `GAMBIT_HAZARD_PENALTY` (warning `8`, active `40`).

`src/cards/gambitTableGame.js` paces turns with `GAMBIT_TURN_END_MS` (`900` ms), `GAMBIT_REGULAR_PAUSE_MS` (`1200` ms), and `GAMBIT_RESULT_MS` (`1300` ms).
