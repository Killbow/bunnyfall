---
slug: naval-plunder-prize-deeds-and-raid-gate
title: "Naval Plunder, Prize Deeds, Salvage, and Warm Ashes Raid Gate"
domain: world
kind: subcard
parent: naval-combat-overview
files:
  - src/systems/naval/navalPlunder.js
  - src/systems/naval/navalShots.js
  - src/systems/naval/warmAshesShips.js
  - src/systems/naval/navalLaw.js
  - src/systems/naval/comeSailAwayItems.js
  - src/ui/navalPlunderWindow.js
  - src/systems/naval/navalHost.js
routes: []
tables: []
replacesBible:
  - "03-World/Naval-Combat.md"
related:
  - naval-combat-overview
  - town-economy-resale-cap-and-sea-trade
  - holdings-fleet-ledger-titles-and-refits
invariants:
  - "Claimed prizes mint a deed at `PRIZE_DEED_SHARE` (`0.25`) of shelf price via `prizeDeedValue` and `mintDeed`."
  - "Warm Ashes `LeaveShip.Update` asks `leaveShipGate(quest)` first: 'naval' ends the raid, 'wait' holds, and 'proceed' falls through. `raidUnderWay()` allows one raid at a time."
  - "Mod save vendor is `NAVAL_SAVE_VENDOR` = 'NavalCombat', version 1 (`navalHost.js`)."
traps:
  - "Ship-price reduction and ship-credit were withdrawn; shelf `HULL_PRICES` stand."
  - "Piracy law runs through `justice/court.js` `lowerRepForCrime`, not a navalLaw.js export."
dfu: []
tags:
  - naval
  - plunder
  - prize
  - salvage
  - quests
---

# Naval Plunder, Prize Deeds, Salvage, and Warm Ashes Raid Gate

Defeated vessels yield hold plunder, flotsam salvage, or minted prize deeds, while quest raids coordinate through the Warm Ashes leave-ship gate and persisted naval save data.

- **Plunder, Salvage, and Prize Deeds (`src/systems/naval/navalPlunder.js`, `src/systems/naval/navalShots.js`, `src/systems/naval/comeSailAwayItems.js`, `src/ui/navalPlunderWindow.js`):** `HOLD_KEYS`, `HOLD_RARITY_TIER`, and `STRONGBOX_RARITY_TIER` populate captured holds. Sinking ships leave flotsam at `SALVAGE_SHARE` (`0.4`) lasting `FLOTSAM_LIFE` (`round(150 * SHIP_TOUGHNESS)` = `240` s). Claiming a prize mints a deed at `PRIZE_DEED_SHARE` (`0.25`) of shelf hull price via `prizeDeedValue` and `mintDeed` (`2000` Large Boat, `25000` Small Ship, `50000` Large Galley, and `37500` Carrack), while shelf `HULL_PRICES` remain unchanged.
- **Warm Ashes Raid Gate (`src/systems/naval/warmAshesShips.js`):** Only one sea raid can run at a time under `raidUnderWay()`. During `LeaveShip.Update`, `leaveShipGate(quest)` intercepts departure: `'naval'` ends the naval raid, `'wait'` holds execution, and `'proceed'` falls through to standard quest handling.
- **Piracy Law and Persistence (`src/systems/naval/navalLaw.js`, `src/systems/naval/navalHost.js`):** Piracy reputation penalties route through `lowerRepForCrime` in `src/justice/court.js`. Persistent naval state saves under `NAVAL_SAVE_VENDOR` (`'NavalCombat'`, version `1`).
