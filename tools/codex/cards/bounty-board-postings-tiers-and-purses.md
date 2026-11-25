---
slug: bounty-board-postings-tiers-and-purses
title: "Board Selection, Monster Tiers, Targets, and Purses"
domain: systems
kind: subcard
parent: bounty-boards-overview
files:
  - src/guilds/bountyBoard.js
  - src/guilds/bountyReward.js
  - src/world/rmbLayout.js
  - src/characters/foesWorld.js
  - src/ui/inkMap.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Bounty-Boards.md"
related:
  - bounty-boards-overview
  - bounty-hunt-packs-trails-and-party
  - questlines-rewards-tiers-and-gear-offers
invariants:
  - "`questBoardIndices` groups boards that stand together into places and gives a place of two one bounty board. Standalone boards take every other one by (x, z, y) order, floor(n/2) of them, so a town with a single board keeps it for rumors."
  - "Postings are deterministic from game day, town pixel, and slot (`BOUNTY_ID_RE` = day.px.py.slot.level), so every client agrees."
  - "Targets lie BOUNTY_MIN_PX (4) to BOUNTY_MAX_PX (10) map pixels out, measured as Chebyshev distance. At most BOUNTY_DUNGEON_SLOTS_MAX (2) slots go into real dungeons."
traps:
  - "Werebeasts are left out of BOUNTY_TIERS on purpose. Beasts that need silver stay in because the server does not enforce silver."
  - "The 15+ tier purse follows its own formula (150 to 200), not the BOUNTY_FULL_PURSE array."
dfu:
  - "Assets/Scripts/Utility/RMBLayout.cs"
tags:
  - bounty
  - tiers
  - rewards
  - map-marker
---

# Board Selection, Monster Tiers, Targets, and Purses

`src/guilds/bountyBoard.js` and `src/guilds/bountyReward.js` deterministically assign which town bulletin boards offer bounties, select target locations and enemy tiers, and compute gold purses.

## Board Selection and Deterministic Postings

- `questBoardIndices` (`src/guilds/bountyBoard.js`, using board props from `src/world/rmbLayout.js`) groups adjacent boards into places and assigns one bounty board to each two-board place. Remaining standalone boards sort by `(x, z, y)` and take every other board up to `floor(n / 2)`, leaving any single-board town with its rumor board.
- Postings derive deterministically from the game day, town pixel, and slot (`BOUNTY_ID_RE` = `day.px.py.slot.level`) so all clients see identical contracts.
- Target sites lie between `BOUNTY_MIN_PX` (`4`) and `BOUNTY_MAX_PX` (`10`) map pixels from town in Chebyshev distance. At most `BOUNTY_DUNGEON_SLOTS_MAX` (`2`) daily slots target real dungeons, where lairs pick quest spawn markers `25` to `90` m away (`src/characters/foesWorld.js`). Held bounties render as black rings via `paintBountyRing` (`BOUNTY_MAP_LINE` in `src/ui/inkMap.js`).

## Enemy Tiers, Pack Sizes, and Gold Purses

- `BOUNTY_TIERS` splits player levels into five bands (`1-3`, `4-5`, `6-10`, `11-14`, and `15+`), ordering `ENEMY_BASICS` ids from weakest to strongest while omitting werebeasts.
- Open-ground packs roll `BOUNTY_PACK_MIN` to `BOUNTY_PACK_MAX` (`4-8`) enemies, while dungeon packs roll `BOUNTY_DUNGEON_PACK_MIN` to `BOUNTY_DUNGEON_PACK_MAX` (`2-4`).
- In tiers 1 through 4, `BOUNTY_FULL_PURSE` (`[50, 75, 90, 100]`) sets the 8-enemy payout, subtracting one-tenth per enemy below eight. The `15+` tier uses its own `150` to `200` gold formula.
