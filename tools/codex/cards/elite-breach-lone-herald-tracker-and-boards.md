---
slug: elite-breach-lone-herald-tracker-and-boards
title: "Lone Herald HUD Entrant Count, Descent Brackets, and First Letter"
domain: multiplayer
kind: subcard
parent: elite-breach-lone-herald-overview
files:
  - src/ui/eliteGates/egHud.js
  - src/net/eliteGates/egLink.js
  - server-account/src/egHonours.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-20d.md"
related:
  - elite-breach-lone-herald-overview
  - elite-breach-spire-overview
invariants:
  - "`egHudModel` (`src/ui/eliteGates/egHud.js`) displays the invited company before the first wake and switches to entrants only via `egGatherOf` afterward, hiding the company line when `n === 1`."
  - "`egBracketOf` classifies `n >= 5` as `company`, `n >= 2` as `few`, and `n === 1` as `alone`, with `egDescentCompanies` ranking by all admitted entrants."
  - "Runs started deeper than Hall `1` post to Depths or Deepest Redoubts and never enter the Descent Alone bracket."
traps:
  - "Invited members who never entered display `was not there` in the end-of-run recap."
  - "`EG_FIRST_POST` (`server-account/src/egHonours.js`) dispatches once on the next balance read."
dfu: []
tags:
  - elite-breach
  - hud
  - leaderboard
  - honors
---

# Lone Herald HUD Entrant Count, Descent Brackets, and First Letter

The Elite Breach HUD, descent leaderboards, and Redoubt `10` completion letter (`src/ui/eliteGates/egHud.js`, `src/net/eliteGates/egLink.js`, and `server-account/src/egHonours.js`) partition runs and party displays by admitted entrants rather than the pre-entry stake roster.

## HUD Gather State and Recap

Before the first wake, `egHudModel` (`src/ui/eliteGates/egHud.js`) displays the full invited company. Once the breach wakes, `egHudModel` switches to admitted entrants via `egGatherOf` and hides the company line when `n === 1`. In the end-of-run recap, invited roster members who never stepped inside display `was not there`.

## Descent Brackets and First Completion Letter

- **Bracket Classification**: `egBracketOf` (`src/net/eliteGates/egLink.js`) classifies `n >= 5` as `company`, `n >= 2` as `few`, and `n === 1` as `alone`.
- **Leaderboard Scope**: `egDescentCompanies` ranks runs by all admitted entrants. Runs started deeper than Hall `1` post to Depths or Deepest Redoubts and never enter the Descent Alone bracket.
- **Redoubt 10 Letter**: `EG_FIRST_POST` (`server-account/src/egHonours.js`) commemorates the first-ever Redoubt `10` completion and dispatches once on the next balance read.
