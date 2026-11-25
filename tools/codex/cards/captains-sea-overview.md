---
slug: captains-sea-overview
title: "Captain's Sea: Crew Service, Crown Standing, Spyglass, and Harbor Trade"
domain: world
kind: overview
parent: null
files:
  - src/systems/naval/shipCrew.js
  - src/systems/naval/captainLedger.js
  - src/systems/naval/shipKnowledge.js
  - src/systems/naval/harbourBoard.js
  - src/systems/naval/tradeGoods.js
  - src/systems/naval/navalDirector.js
  - src/systems/naval/harbourOffice.js
  - src/systems/naval/navalHost.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "03-World/Captains-Sea.md"
related:
  - naval-and-come-sail-away
  - naval-refit-overview
  - captain-tree-and-ore-refits
  - naval-ramming-and-grapple-boarding
  - crew-veterancy-posts-and-headcount-exchange
  - captain-log-crown-standing-and-marque
  - spyglass-ship-knowledge-and-false-colours
  - harbour-board-ports-exchange-and-charts
invariants:
  - "`watersOf({ nearPort, portPx })` returns `'coastal'` near a port, `'deep'` when `portPx >= DEEP_PX` (`12` Chebyshev map pixels from `navalPortPx`), and `'open'` otherwise."
  - "In deep waters, `factionWeights` scales pirate spawns by `DEEP_PIRATE_K` (`1.8`) and merchants by `DEEP_TRADE_K` (`0.5`), while deep ships gain `DEEP_LEVEL` (`3`), `DEEP_BOLD` (`0.5`), and `DEEP_TIER` (`2`)."
  - "`src/systems/naval/navalWire.js` broadcasts deep ships (list `d`) and deep casks (list `e`) so every peer resolves the same deep-water hold and loot tier."
traps:
  - "This arc runs entirely on the client with no HTTP routes, WebSocket frames, or SQLite tables; never treat it as server-authoritative."
dfu: []
tags:
  - naval
  - captain
  - crew
  - spyglass
  - harbor
  - deep-waters
---

# Captain's Sea: Crew Service, Crown Standing, Spyglass, and Harbor Trade

The Captain's Sea arc layers crew veterancy, crown standing, spyglass reconnaissance, harbor contracts, commodity trading, and deep-water encounter scaling onto open-sea sailing (`naval-and-come-sail-away` and `naval-refit-overview`). The entire subsystem runs on the client without dedicated HTTP routes, WebSocket frames, or database tables.

- **Waters and deep-sea scaling (`src/systems/naval/navalDirector.js`, `src/systems/naval/navalWire.js`):** `watersOf({ nearPort, portPx })` classifies sea pixels as `'coastal'` near a port, `'deep'` when `portPx >= DEEP_PX` (`12` Chebyshev map pixels via `navalPortPx`), and `'open'` otherwise. In deep water, `factionWeights` multiplies pirate weight by `DEEP_PIRATE_K` (`1.8`) and merchant weight by `DEEP_TRADE_K` (`0.5`), while spawned ships gain `DEEP_LEVEL` (`3`), `DEEP_BOLD` (`0.5`), and `DEEP_TIER` (`2`). `navalWire.js` syncs deep ships (list `d`) and deep casks (list `e`) across peers so hold and loot tiers match.
- **Ledger, harbor office, and UI (`src/systems/naval/captainLedger.js`, `src/systems/naval/harbourOffice.js`, `src/scenes/world.js`):** `createCaptainLedger` persists crown standing, active letters of marque, held contracts, treasure charts, and log tallies under `CAPTAIN_SAVE_VENDOR`. In port, `createHarbourOffice` drives contract boards, commodity and crew trading, letters of marque, Admiralty sales, and chart reading. `navalOpenYard` opens `src/ui/navalYardWindow.js`, and the Holdings tab in `src/ui/enhancedMenu.js` renders `src/ui/captainPage.js`.
- **Subcards:** `crew-veterancy-posts-and-headcount-exchange`, `captain-log-crown-standing-and-marque`, `spyglass-ship-knowledge-and-false-colours`, and `harbour-board-ports-exchange-and-charts`.
