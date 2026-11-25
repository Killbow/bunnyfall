---
slug: home-station-door-overview
title: "Home Station Chooser and Profession Page Routing"
domain: homes
kind: overview
parent: null
files:
  - src/scenes/worldModes.js
  - src/ui/profPages.js
  - src/net/decorLaw.js
  - src/ui/decorPanel.js
  - src/ui/enhancedMenu.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-11f.md"
related:
  - home-station-license-fees
  - market-vendors-and-professions
  - professions-arc-overview
  - materials-bag-loose-origin-and-station-crafting
invariants:
  - "useDecorStation sends PROF_STATIONS (forge, workbench, loom, mason, jeweller) to the profession pages when forgeOffered(). Otherwise it shows stationColdLine."
  - "Alchemy and enchant stations (STORES_ACT_STATIONS) show a chooser only when forgeOffered(). Otherwise openStationMaker opens the Daggerfall maker directly."
  - "The spells station has no profession act and always opens the maker."
  - "The ChoiceWindow has three options: Digit1 is `1 - ${SERVICE_LABEL[maker]}`, where maker is the SERVICE_DESTINATION key matching DECOR_STATION_SERVICES[kind]. Digit2 is stationActLabel(kind). Escape closes it."
  - "Each option calls leave() to clear interiorOverlay before opening its door."
  - "Digit2 calls stationDoorAt(kind), which sets focusStoresStation and returns 'crafting'. stationHead scrolls to #prof-station-<kind> once, then clears the focus."
traps:
  - "The access checks (owner, hall member, caravan guest) run before any door opens."
  - "The labels are localized via t(); do not hardcode 'Stores page' wording."
dfu: []
tags:
  - station-door
  - home-stations
  - enchanting
  - alchemy
  - disenchant
  - choicewindow
---

# Home Station Chooser and Profession Page Routing

Home station dispatch and profession page routing span `src/scenes/worldModes.js`, `src/ui/profPages.js`, `src/net/decorLaw.js`, `src/ui/decorPanel.js`, and `src/ui/enhancedMenu.js`.

## Station Dispatch and the ChoiceWindow

- **Access and station routing:** Access checks for the owner, hall member, or caravan guest run before any door opens. When `forgeOffered()` (`profPagesShown()`) is truthy, `useDecorStation` routes `PROF_STATIONS` (`forge`, `workbench`, `loom`, `mason`, and `jeweller`) to the profession pages; otherwise it displays `stationColdLine`. The `spells` station has no profession act and always opens the maker via `openStationMaker`.
- **Dual-action chooser (`STORES_ACT_STATIONS`):** For `alchemy` (`Brew`) and `enchant` (`Disenchant`), `useDecorStation` opens a `ChoiceWindow` when `forgeOffered()` holds, or calls `openStationMaker` directly when it does not.
- **Chooser options and focus scrolling:** In the `ChoiceWindow`, `Digit1` shows `1 - ${SERVICE_LABEL[maker]}` (where `maker` is the `SERVICE_DESTINATION` key matching `DECOR_STATION_SERVICES[kind]`), `Digit2` shows `stationActLabel(kind)` localized via `t()`, and `Escape` closes the window. Both active options call `leave()` to clear `interiorOverlay` first. Selecting `Digit2` calls `stationDoorAt(kind)`, which sets `focusStoresStation` and returns `'crafting'` so `stationHead` scrolls to `#prof-station-<kind>` once and clears the focus.
