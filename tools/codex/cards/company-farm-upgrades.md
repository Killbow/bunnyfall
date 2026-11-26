---
slug: company-farm-upgrades
title: "Company Farm Upgrades: Tools, Irrigation, Soil and the 3x3 Harvest"
domain: account
kind: subcard
parent: homes-camps-guilds-and-territories
files:
  - src/net/farmProgressLaw.js
  - src/net/farmGardenLaw.js
  - src/net/farm/toolRange.js
  - src/scenes/farmingMode.js
  - src/world/farmGardenArt.js
  - src/ui/farmWords.js
  - server-account/src/farmProgress.js
routes:
  - /v1/farms/garden
tables: []
related:
  - company-farm-market-day
  - homes-camps-guilds-and-territories
invariants:
  - "`FARM_UPGRADES` in `farmProgressLaw.js` is the one table of prices and thresholds; the tier counts, `FARM_TOOL_AREAS` and the validation of saved levels all derive from it, so adding a tier adds no other code."
  - "The service checks `farmToolArea` (1, 3, 5 or 9 beds) on every action; the client picks the beds, the service never trusts the pick beyond that count."
traps:
  - "Soil is stamped on a bed when it is planted (`quality` is the extra items, `rate` the pace, from `FARM_SOIL`), so buying a tier never changes crops already in the ground, and `validGarden` rejects a rate or quality that is not in that table."
  - "Tools at tier 3 take the whole 3x3 block, diagonals included, within `blockReach`; a bed out of reach or blocked is left out and the aimed bed is always worked. Areas 3 and 5 stay within one bed step, nearest first."
dfu: []
tags:
  - farms
  - upgrades
  - companies
---

# Company Farm Upgrades

Three tracks, bought in order by a captain or officer with Company gold and Argents once every crop has shipped enough. Progress lives in the garden JSON as `progress.upgrades`, so a farm past a threshold sees the next tier on load and nothing resets.

| Track | Tier 1 / 2 / 3 shipped | Effect at tier 3 |
| --- | --- | --- |
| Tools | 1,000 / 6,000 / 26,000 | 9 beds a click |
| Irrigation | 1,000 / 26,000 | harvest replants and waters |
| Soil | 1,000 / 6,000 / 26,000 | 3 extra items, 50% faster |

`farmToolBeds` (`src/net/farm/toolRange.js`) picks the beds, and `farmingMode.js` uses the same pick for the click and for the highlight, drawn by `farmGardenArt.js` (one quad per bed, nine at most).
