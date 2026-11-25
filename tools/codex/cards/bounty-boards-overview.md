---
slug: bounty-boards-overview
title: "Bounty Boards: Town Hunts, Party Packs, and the Hunt Ledger"
domain: systems
kind: overview
parent: null
files:
  - src/guilds/bountyBoard.js
  - src/guilds/bountyHost.js
  - src/world/bountyHostWorld.js
  - src/world/rmbLayout.js
  - src/net/huntLaw.js
  - server-account/src/hunts.js
  - src/ui/bountyWindow.js
routes:
  - /v1/hunt/state
  - /v1/hunt/clear
tables:
  - hunt_clears
replacesBible:
  - "06-Systems/Bounty-Boards.md"
related:
  - bounty-board-postings-tiers-and-purses
  - bounty-hunt-packs-trails-and-party
  - bounty-hunt-ledger-marks-and-mastery
  - online-time-quest-delays-and-deadlines
  - seats-witness-registry-and-influence
invariants:
  - "Every bounty board in a town posts the same BOUNTIES_PER_DAY (4) hunts each game day. The posting belongs to the town, not to the board."
  - "A player holds at most BOUNTY_ACTIVE_MAX (4) bounties, and each lapses BOUNTY_LIFETIME_MINUTES (one game day) after it was taken."
  - "Progression from hunting is horizontal: ranks, titles, a weekly named mark, trophies, and seat influence. It never raises gear power."
traps:
  - "Source comments cite systems/bounty/ and ui/bounty/ paths that do not exist. The live code is in src/guilds/ and src/ui/."
dfu:
  - "Assets/Scripts/Utility/RMBLayout.cs"
tags:
  - bounty
  - hunt
  - bulletin-board
  - enhanced-plus
  - horizontal-progression
---

# Bounty Boards: Town Hunts, Party Packs, and the Hunt Ledger

Town bulletin boards (`BULLETIN_BOARD_MODEL_ID` = `41739` in `src/world/rmbLayout.js`, matching DFU `RMBLayout.BulletinBoardModelID`) split between rumor boards and bounty boards that post daily enemy pack contracts (`src/guilds/bountyBoard.js`, `src/guilds/bountyHost.js`, and `src/ui/bountyWindow.js`).

## Daily Town Contracts and Lifetimes

- Every bounty board inside a town shares the same `BOUNTIES_PER_DAY` (`4`) daily postings. Postings are keyed to the town and game day rather than individual board props.
- A player can hold at most `BOUNTY_ACTIVE_MAX` (`4`) active bounties at once. Each taken contract expires after `BOUNTY_LIFETIME_MINUTES` (one game day) if not cleared.
- Pure contract rules live in `src/guilds/bountyBoard.js`, client state and pack tracking run in `src/guilds/bountyHost.js`, and scene wiring connects through `src/world/bountyHostWorld.js` and `src/characters/foesWorld.js`.

## Account Hunt Ledger and Horizontal Progression

- Paid contract clears report to the account service via `/v1/hunt/clear` (`server-account/src/hunts.js`) and persist in the `hunt_clears` table, while `/v1/hunt/state` reads current ledger standings.
- Hunting progression (`src/net/huntLaw.js`) is strictly horizontal: clears advance hunt ranks, unlock titles, open a weekly named mark, award wall trophies, and contribute town seat influence without raising equipment power.
