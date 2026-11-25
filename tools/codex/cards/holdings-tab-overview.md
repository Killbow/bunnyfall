---
slug: holdings-tab-overview
title: "Holdings Tab: Owned Assets and Followers on the Pause Menu"
domain: ui
kind: overview
parent: null
files:
  - src/ui/enhancedMenu.js
  - src/ui/holdingsPages.js
  - src/ui/fleetPage.js
  - src/ui/captainPage.js
  - src/ui/campsPage.js
  - src/ui/companionRoster.js
  - src/ui/revenantPage.js
  - src/ui/collectionsPage.js
  - src/scenes/world.js
  - src/scenes/exterior.js
routes: []
tables: []
replacesBible:
  - "03-World/Holdings.md"
related:
  - holdings-stable-and-transport-stabling
  - holdings-fleet-ledger-titles-and-refits
  - harbor-quays-docking-and-gangways
  - naval-and-come-sail-away
  - naval-refit-overview
invariants:
  - "Holdings pages never access runtimes directly; each scene host injects a provider through `setHoldingsProvider` (`src/scenes/world.js` supplies Stable and Fleet, while `src/scenes/exterior.js` supplies Stable only)."
  - "`holdingsSections()` lists only pages whose `*PageShown()` guard returns true, and an unknown `holdSec` value falls back to the first available section."
traps:
  - "There is no `'stores'` Holdings section; `'stores'` belongs to the Crafting workshop landing (`src/ui/crafting/workshopTab.js`), while `collections` occupies the final slot on the Holdings rail."
dfu: []
tags:
  - holdings
  - pause-menu
  - ui
  - stable
  - fleet
---

# Holdings Tab: Owned Assets and Followers on the Pause Menu

The `holdings` pause-menu tab (`PAUSE_TABS` in `src/ui/enhancedMenu.js`, positioned between `craft` and `family`) groups player-owned transport, ships, naval commissions, camps, followers, and collections under one rail drawn by `pauseHoldings`.

## Section Rail and Visibility Guards

`holdingsSections()` builds the left rail in a fixed order from each page module's `*_PAGE_SECTIONS` list:

- `stable` (`src/ui/holdingsPages.js`): horse and wagon summoning, stabling, and renaming.
- `fleet` (`src/ui/fleetPage.js`): ship ledger, title book deeds, remote repairs, hull refits, and crew role assignments.
- `captain` (`src/ui/captainPage.js`): crown standing, letters of marque, active harbor contracts, treasure charts, and service tallies.
- `camps` (`src/ui/campsPage.js`): pitched wilderness camps and placed camp pieces.
- `companions` (`src/ui/companionRoster.js`): recruited companion roster and loadout summaries.
- `revenants` (`src/ui/revenantPage.js`): raised revenant thralls and upkeep state.
- `collections` (`src/ui/collectionsPage.js`): account and character collection progress.

Each section appears only when its `*PageShown()` predicate passes. If the active `holdSec` id is missing or hidden, `pauseHoldings` falls back to the first visible section. There is no `'stores'` section on the Holdings rail; workshop material stores live on the Crafting tab.

## Scene Provider Injection

Holdings UI modules never import scene runtimes directly. Active scene hosts register callbacks via `setHoldingsProvider`: `src/scenes/world.js` wires both Stable (`stableProviderFor`) and Fleet providers, whereas `src/scenes/exterior.js` registers the Stable provider alone.

## Subcards

- `holdings-stable-and-transport-stabling`
- `holdings-fleet-ledger-titles-and-refits`
- `harbor-quays-docking-and-gangways`
