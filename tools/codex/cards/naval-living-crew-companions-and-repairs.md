---
slug: naval-living-crew-companions-and-repairs
title: "Living Crew, Crew Companions, and Sea Repairs"
domain: world
kind: subcard
parent: naval-combat-overview
files:
  - src/systems/naval/crewLife.js
  - src/systems/naval/shipCrew.js
  - src/systems/naval/crewCompanions.js
  - src/systems/naval/crewAshore.js
  - src/systems/naval/navalYard.js
  - src/systems/naval/navalDeck.js
  - src/characters/exteriorFoes.js
  - src/scenes/dungeonContext.js
routes: []
tables: []
replacesBible:
  - "03-World/Naval-Combat.md"
related:
  - naval-combat-overview
  - crew-veterancy-posts-and-headcount-exchange
  - naval-ramming-and-grapple-boarding
invariants:
  - "Companions are never killed: `exteriorFoes.js` and `dungeonContext.js` clamp companion health at 1 and set `_knockedOut`; KO'd hands rest aboard `REST_MIN` (`8 * 60` world minutes)."
  - "At most `COMPANION_MAX` (`2`) crewmen go ashore."
  - "`packCapacityKg` follows DFU MaxEncumbrance of the companion's Strength."
  - "Deck walkers stay on `buildDeck` grids moved by `intoDeck` and `outOfDeck`."
  - "Companion spell effects carry from one body to the next in memory only, keyed by party member; a save keeps health but not spells (`crewAshore.js`)."
  - "`buildDeck` clips each wall face to every grid cell and marks the cell with that clipped height range, so the baked deck does not depend on how the hull mesh is triangulated."
  - "Only upward flat faces enter a cell's `floors` list and the side-midpoint heights that join treads."
  - "Floors in side-by-side cells join within `DECK_JOIN`, or within `FLIGHT_JOIN` when a floor at their shared side's midpoint lies within `DECK_JOIN` of both."
  - "The edge inset (`DECK_INSET`) keeps a one-cell way up to any raised deck (more than `FLIGHT_OVER` above the main deck and at least `FLIGHT_CELLS` cells) that it would otherwise cut off from the open deck (`keepFlights`)."
traps:
  - "Crew morale is gentle: no wages and no desertion. Do not add pay hooks."
  - "Damage control under fire repairs slowly and never douses fires or refloats wrecks."
dfu:
  - Assets/Scripts/Game/Formulas/FormulaHelper.cs
  - Assets/Scripts/Game/Entities/DaggerfallEntity.cs
tags:
  - naval
  - crew
  - companions
  - repair
  - deck
---

# Living Crew, Crew Companions, and Sea Repairs

Aboard ship and ashore, living crew hands follow deck grids, respond to battle orders, accompany the captain on land without permanent death, and spend carpenter stores on sea repairs.

- **Deck Life and Battle Orders (`src/systems/naval/crewLife.js`, `src/systems/naval/shipCrew.js`, `src/systems/naval/navalDeck.js`):** Visible deck hands scale with `CREW_SHOWN` (`[0, 2, 6, 8, 8]` by hull) and walk `buildDeck` grids transformed through `intoDeck` and `outOfDeck`. `CREW_ORDERS` switches hands between `guns` ('Man the guns'), `rail` ('All hands to the rail'), `repair` ('Make repairs'), and `stand` ('Stand down'). Crew morale requires no wages and never causes desertion.
- **Ashore Companions (`src/systems/naval/crewCompanions.js`, `src/systems/naval/crewAshore.js`, `src/characters/exteriorFoes.js`, `src/scenes/dungeonContext.js`):** Up to `COMPANION_MAX` (`2`) crew members can accompany the player ashore, with `packCapacityKg` derived from the DFU `MaxEncumbrance` formula for the companion Strength score. Companions never die: lethal damage in exterior or dungeon combat clamps health at `1`, sets `_knockedOut`, and returns the hand to rest aboard for `REST_MIN` (`8 * 60` world minutes).
- **Sea Repairs and Stores (`src/systems/naval/navalYard.js`):** Each carpenter store holds `STORE_POINTS` (`64`), managed by `seaRepair`, `storePrice`, and `storesToWhole`. Active damage control under fire repairs slowly and never extinguishes burning stacks or refloats wrecked hulls.
