---
slug: wild-zone-letters-tenth-and-sea-refusal
title: "Wild Zone Letters-of-Credit Tenth and Open-Sea Fleet Refusal"
domain: multiplayer
kind: subcard
parent: wild-zone-enemy-death-keeps-overview
files:
  - src/world/wild/wildDropLaw.js
  - src/player/wildDeath.js
  - server-account/src/wild.js
  - src/systems/naval/fleetHost.js
routes:
  - /v1/wild/fall
tables: []
replacesBible:
  - `01-Overview/audits/Audit-Foe-Keeps.md`
related:
  - wild-zone-enemy-death-keeps-overview
  - wild-zone-pvp-death-drops-and-remains
  - economy-ledger-and-item-judge
  - wild-zone-travel-strangers-and-zone-limits
invariants:
  - "A player kill takes one tenth of the value of each letter of credit into the remains gold pile (`gold.letters`), while the letter item stays."
  - "`WILD_FALL_LETTERS = 1` is exported from wildDropLaw.js and sent as `letters` by `wildFallWords` in wildDeath.js."
  - "Fleet Summon and Send away are refused into, out of, or across the open sea while it is an active PvP zone (`openSea` in fleetHost.js)."
traps:
  - "Letters under 10 gold, quest letters, and ledger-tracked letters pay no tenth."
  - "`wildTookAny` counts the share from a letter alone as a reportable loss."
dfu: []
tags:
  - wild-zone
  - letters-of-credit
  - naval
  - economy
---

# Wild Zone Letters-of-Credit Tenth and Open-Sea Fleet Refusal

Letter-of-credit tenth deductions on player kills and open-sea fleet movement refusals live in `src/world/wild/wildDropLaw.js`, `src/player/wildDeath.js`, `server-account/src/wild.js`, and `src/systems/naval/fleetHost.js`.

## Letters-of-Credit Gold Tenth

When a player falls to a referee-confirmed player kill in an active wild zone, `src/world/wild/wildDropLaw.js` keeps every letter of credit in the victim pack rather than dropping the document item into world remains. Instead, each eligible letter loses one tenth of its value (`WILD_GOLD_DIVISOR = 10`, floored per letter) into the remains gold pile under `gold.letters`:
- `src/world/wild/wildDropLaw.js` exports `WILD_FALL_LETTERS = 1`, which `wildFallWords` in `src/player/wildDeath.js` sends as `letters` in the `/v1/wild/fall` payload to `server-account/src/wild.js`.
- Letters worth under `10` gold, quest letters, and ledger-tracked letters are exempt and pay no tenth.
- `wildTookAny` counts a gold deduction taken from a letter of credit alone as a reportable loss on the death summary even when purse coins and bag items were empty.

## Open-Sea Fleet Summon and Send-Away Refusal

In `src/systems/naval/fleetHost.js`, while the Eltheric Ocean is an active PvP zone (`openSea`), fleet management commands refuse to `Summon` or `Send away` ships into, out of, or across the open sea so vessels cannot bypass wild-zone crossing risk.
