---
slug: captain-log-crown-standing-and-marque
title: "Captain's Log, Crown Standing Ranks, Perks, and Letters of Marque"
domain: world
kind: subcard
parent: captains-sea-overview
files:
  - src/systems/naval/captainLedger.js
  - src/systems/naval/navalLaw.js
  - src/systems/naval/harbourBoard.js
  - src/systems/naval/navalDirector.js
  - src/systems/naval/navalHost.js
  - src/systems/naval/harbourOffice.js
  - src/ui/captainPage.js
routes: []
tables: []
replacesBible:
  - "03-World/Captains-Sea.md"
related:
  - captains-sea-overview
  - captain-tree-and-ore-refits
  - harbour-board-ports-exchange-and-charts
invariants:
  - "Crown standing clamps to `[CROWN_STANDING_MIN, CROWN_STANDING_MAX]` (`[-99, 999]`); `crownRankOf` recomputes rank directly from standing, so piracy penalties can demote the captain."
  - "`CROWN_RANKS` thresholds are Unsworn (`0`), Sworn Captain (`15`), Privateer (`50`), Commodore (`120`), and Admiral (`250`)."
  - "`perksOf(rank, notoriety)` returns `RANK_PERKS[0]` (zero perks) whenever notoriety is at least `PERKS_REFUSED_AT` (`25`)."
  - "`sailed(m)` records distance in the captain's log only when `0 < m < 1e5` meters (`100` km), rejecting teleport jumps."
  - "In `chargePlayer`, a vessel already credited with `'repel'` that is later sunk or boarded grants no second law reward or crown standing change, though the log still records the outcome."
  - "Attacking a ship flying the active marque's crown invokes `tearMarque` immediately."
traps:
  - "A letter of marque expires on the captain's personal clock (`playerTicker.ownMinutes`), not world time: `setMarque(crown, now + MARQUE_DAYS * MINUTES_PER_DAY)`."
  - "A repelled boarding grants only `PIRATE_REWARD.repelled` repute and `DEED_STANDING.repelled` standing; it awards no gold."
dfu: []
tags:
  - captain-log
  - crown-standing
  - marque
  - piracy
  - perks
---

# Captain's Log, Crown Standing Ranks, Perks, and Letters of Marque

`createCaptainLedger` (`src/systems/naval/captainLedger.js`) and `chargePlayer` (`src/systems/naval/navalLaw.js`) track voyage statistics, crown standing across regional navies, rank perks, and privateering commissions.

- **Standing and deeds (`captainLedger.js`, `navalLaw.js`):** Standing clamps between `CROWN_STANDING_MIN` (`-99`) and `CROWN_STANDING_MAX` (`999`). Lawful deeds award `DEED_STANDING` (`sunk: 2`, `taken: 3`, `repelled: 2`) scaled by hull size, legendary kills grant `LEGEND_STANDING` (`10`), and piracy deducts `PIRACY_STANDING` (`fire: -5`, `sink: -8`, `board: -10`). Once `chargePlayer` marks a target with `'repel'`, later sinking or boarding that same vessel logs the event without paying extra gold, repute, or standing. At high notoriety (`NAVY_HUNTS = 50` in `src/systems/naval/navalAI.js`), naval patrols hunt the player.
- **Ranks and perks (`captainLedger.js`, `harbourBoard.js`):** `crownRankOf` maps standing to `CROWN_RANKS`: Unsworn (`0`), Sworn Captain (`15`), Privateer (`50`), Commodore (`120`), and Admiral (`250`). `perksOf(rank, notoriety)` drops to `RANK_PERKS[0]` whenever notoriety reaches `PERKS_REFUSED_AT` (`25`). Active `RANK_PERKS` unlock shipyard discounts, bonus contract pay and board slots, letters of marque at Privateer, Seasoned hires and the Admiralty Carrack (`ADMIRALTY_OFF = 0.2`) at Commodore, and guaranteed navy relief (`reliefSure`) at Admiral.
- **Marque and captain's log (`captainLedger.js`, `harbourOffice.js`, `captainPage.js`):** Purchasing a letter of marque (`MARQUE_PRICE = 1500`) runs `setMarque` for `MARQUE_DAYS` (`7` days on `playerTicker.ownMinutes`), granting `MARQUE_STANDING` (`sink: 2`, `board: 3`) against rival crowns while calling `tearMarque` if the player attacks the issuing crown. The log tracks `LOG_TRADES` (`pirate`, `merchant`, `navy`, `ether`, `legend`), `LOG_CONTRACTS` (`HARBOUR_CONTRACT_KINDS`), and distance via `sailed(m)` (`0 < m < 1e5` meters).
