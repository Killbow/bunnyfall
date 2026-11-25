---
slug: crew-veterancy-posts-and-headcount-exchange
title: "Crew Veterancy, Post Bonuses, and Headcount Crew Trading"
domain: world
kind: subcard
parent: captains-sea-overview
files:
  - src/systems/naval/shipCrew.js
  - src/systems/naval/crewTrade.js
  - src/systems/naval/crewDeal.js
  - src/systems/naval/harbourOffice.js
  - src/systems/naval/tradeGoods.js
  - src/systems/naval/navalPlunder.js
  - src/ui/fleetPage.js
  - src/systems/naval/navalHost.js
routes: []
tables: []
replacesBible:
  - "03-World/Captains-Sea.md"
related:
  - captains-sea-overview
  - naval-ramming-and-grapple-boarding
  - captain-log-crown-standing-and-marque
invariants:
  - "`serviceOf(h)` computes `fights + 2 * boardings + prior`, with each term floored at `0`."
  - "`VETERANCY` rank thresholds are Green (`0`), Seasoned (`4`), Veteran (`12`), and Old Salt (`30`); `veteranOf` selects the highest threshold met."
  - "`postsOf(hands, away)` keeps only the highest-ranked holder of each `POST_WORTH` role (picking the earliest roster entry on a tie) and excludes anyone in `away` (the shore party)."
  - "`crewWorth` returns `reload: 1 - Gunner`, `mend: 1 + Carpenter`, `sight: 1 + Lookout`, `wear: 1 + Cook`, `way: 1 + Bosun`, and `hands: First Mate`; an uncrewed vessel returns `NO_WORTH`."
  - "`crewSpare` blocks all sales for customs-migrated vessels (`crossed`), never sells below `CREW_LEAST` (`1`), and retains enough crew to cover the shore party plus one hand."
  - "`crewPayMost(discount)` returns `max(1, ceil(yardHandPrice(discount)) - 1)`, which `crewRowOf` uses to cap the harbor exchange buy price."
traps:
  - "Crew trades through the exchange `CREW` row (`kg: 0`, `crew: true`, `CREW_BASE = 15`), not as an inventory item; never mint crew into a cargo hold."
  - "`signOffOrder` discharges ordinary Deckhands first and the First Mate last, and never discharges anyone listed in `away`."
dfu: []
tags:
  - crew
  - veterancy
  - posts
  - crew-trade
  - exchange
---

# Crew Veterancy, Post Bonuses, and Headcount Crew Trading

Ship hands accumulate service points, advance through four veterancy tiers, fill specialist deck posts, and trade across harbor exchanges (`src/systems/naval/shipCrew.js`, `src/systems/naval/crewTrade.js`, and `src/systems/naval/crewDeal.js`).

- **Service and veterancy (`shipCrew.js`):** `serviceOf(h)` sums `fights + 2 * boardings + prior` with each term floored at `0`, where `prior` grants Seasoned hires (`SEASONED_HIRE = 4`) their starting credit. `veteranOf` maps service to `VETERANCY` tiers: Green (`0`), Seasoned (`4`), Veteran (`12`), and Old Salt (`30`).
- **Posts and ship multipliers (`shipCrew.js`, `navalHost.js`):** `postsOf(hands, away)` ignores shore-party hands in `away` and assigns the highest-ranked holder per role (breaking ties by roster order). From `POST_WORTH`, `crewWorth` computes `reload: 1 - Gunner` (`0.04` base plus `0.03` per rank, read by `reloadScale`), `mend: 1 + Carpenter` (`0.15` base plus `0.1`, read by `fieldMend` in `src/systems/naval/navalYard.js`), `sight: 1 + Lookout` (`0.1` base plus `0.1`), `wear: 1 + Cook` (`0.25` base plus `0.25`), `way: 1 + Bosun` (`0.01` base plus `0.01`), and `hands: First Mate` (`[0, 0, 1, 2]` extra boarding hands), or `NO_WORTH` when uncrewed.
- **Headcount exchange and pressing (`crewTrade.js`, `crewDeal.js`, `harbourOffice.js`, `navalPlunder.js`):** `buyCrew` and `sellCrew` invoke `deal.signOn` and `deal.signOff` on the virtual `CREW` commodity row (`kg: 0`, `crew: true`, `CREW_BASE = 15`), capped at `crewPayMost(discount)`. `crewSpare` blocks customs-crossed ships (`crossed`) and preserves `away` plus at least `CREW_LEAST` (`1`) hand, while `signOffOrder` discharges Deckhands first and the First Mate last. After boarding, pressing crew from a prize restores combat losses up to `PRESS_SHARE` (`0.6`).
