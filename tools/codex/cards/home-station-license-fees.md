---
slug: home-station-license-fees
title: "Home Station License Fees and Two-Press Unmaking"
domain: homes
kind: subcard
parent: home-station-door-overview
files:
  - src/net/decorLaw.js
  - src/ui/decorPanel.js
  - src/homes/decorTool.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-11f.md"
related:
  - home-station-door-overview
  - home-price-guard-and-refund-overview
invariants:
  - "DECOR_STATION_FEES: alchemy 50,000; spells 100,000; enchant 200,000; forge, workbench, cooking, loom, mason and jeweller 50,000 each; vendor 25,000."
  - "The fee is a license charged once and never refunded; `decorRefund` returns half of the paid piece price."
  - "decorStationWords shows 'Unmake station (nothing back)', then on the second press 'Press again to destroy it. Nothing is returned'. A craft change reads 'Change station: N gold (no refund)'."
traps:
  - "Unmaking requires two presses before destroying the station."
dfu: []
tags:
  - decor
  - license
  - refund
---

# Home Station License Fees and Two-Press Unmaking

Home station license pricing, furniture piece refund math, and two-press destruction prompts are enforced across `src/net/decorLaw.js`, `src/ui/decorPanel.js`, and `src/homes/decorTool.js`.

## License Fee Schedule and Refund Math

- **Station fee table (`DECOR_STATION_FEES`):** In `src/net/decorLaw.js`, configuring a home station charges a one-time license fee by station kind: `enchant` costs `200,000` gold; `spells` costs `100,000` gold; `alchemy`, `forge`, `workbench`, `cooking`, `loom`, `mason`, and `jeweller` cost `50,000` gold each; and `vendor` costs `25,000` gold.
- **No license refund (`decorRefund`):** The station license fee is charged once and is never refunded upon removal or reconfiguration. When a placed furniture piece is refunded, `decorRefund` returns half of the paid piece price without returning any station license gold.

## Two-Press Unmaking and Reconfiguration Prompts

In `src/ui/decorPanel.js` and `src/homes/decorTool.js`, unmaking a station requires two consecutive confirmation presses before the station is destroyed. `decorStationWords` renders `'Unmake station (nothing back)'` initially, then switches to `'Press again to destroy it. Nothing is returned'` for the second press. Reconfiguring a station kind displays `'Change station: N gold (no refund)'`.
