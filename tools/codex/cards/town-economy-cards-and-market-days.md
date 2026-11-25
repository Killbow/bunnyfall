---
slug: town-economy-cards-and-market-days
title: "Town Tooltip Cards, Market Days, and Trade News"
domain: economy
kind: subcard
parent: town-economy-overview
files:
  - src/net/townEconLaw.js
  - src/ui/eventMapMarks.js
  - src/ui/heldMap.js
  - src/ui/travelViewHud.js
  - src/systems/livingWorld/trips.js
  - src/systems/livingWorld/lines.js
  - src/systems/livingWorld/livingTown.js
  - src/trade/townEconHost.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Town-Economy-Arc.md"
related:
  - town-economy-overview
  - living-world-census-schedules-and-watch
  - seats-arc-overview
invariants:
  - "`townTipOf` builds the card from the economy line, the price line, the strongest reason line, either the seat lines or the area line (`townAreaLine` names the guild holding the bailiwick), and last the patrons line."
  - "Cards appear on the Held Map and the Overworld readout, capped at `TOWN_TIP_LINES_MAX` (7). The classic map is unchanged."
  - "The patrons line lists at most `TOWN_TIP_PATRONS_MAX` (2) names plus a count, and is added only while the card has `TOWN_TIP_PATRONS_ROOM` (5) lines or fewer."
traps:
  - "`marketBandOf` caches a town band for each living-world day only once the share book and seat list have answered; before that, bands are recomputed without caching. The cache is bounded by `MARKET_BANDS_MAX` (4096), evicting the oldest entry first."
dfu: []
tags:
  - tooltip
  - held-map
  - living-world
  - market-day
  - rumors
---

# Town Tooltip Cards, Market Days, and Trade News

Prosperity bands and cycle trends surface to online players through Held Map and Overworld tooltip cards (`src/net/townEconLaw.js`, `src/ui/eventMapMarks.js`), Living World market schedules (`src/systems/livingWorld/trips.js`), and resident trade rumors (`src/systems/livingWorld/lines.js`).

## Tooltip Card Assembly and Trend Math

- **Line ordering (`src/net/townEconLaw.js`, `src/ui/heldMap.js`, `src/ui/travelViewHud.js`):** `townTipOf` builds up to `TOWN_TIP_LINES_MAX` (`7`) lines for the Held Map and Overworld readout, leaving the classic map untouched: the economy band and trend line, the price line, the strongest reason line, either the seat lines or the bailiwick line (`townAreaLine`, naming the ruling guild), and the patrons line.
- **Patrons and trend:** The patrons line lists at most `TOWN_TIP_PATRONS_MAX` (`2`) patron names plus a count when the card has `TOWN_TIP_PATRONS_ROOM` (`5`) or fewer lines. The trend word compares yesterday's and today's prosperity using today's seat, raid, and player terms to isolate the market cycle.

## Market Days, Band Caching, and Trade News

- **Market frequency (`src/systems/livingWorld/trips.js`, `src/systems/livingWorld/livingTown.js`):** In `marketDay`, `Booming` towns schedule a second weekly market `MARKET_BOOM_DAY` (`4`) days after their primary day, whereas `Destitute` towns hold a market once every `MARKET_DESTITUTE_WEEKS` (`2`) weeks.
- **Band cache and rumors (`src/trade/townEconHost.js`, `src/systems/livingWorld/lines.js`):** `marketBandOf` caches per-day town bands (`MARKET_BANDS_MAX` = `4096`, evicting oldest first) only after both the share book and seat list answer. `townEconNews` rotates economy talk onto `TOWN_ECON_NEWS_DAYS` (`3`) days per week per town.
