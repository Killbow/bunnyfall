---
slug: elite-breach-lone-herald-overview
title: "Elite Breach Lone Herald: Entrant Counting and Solo Post Wording"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/eliteGates/egBrain.js
  - src/net/eliteGates/egHerald.js
  - src/net/eliteGates/egLink.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-20d.md"
related:
  - elite-breach-lone-herald-tracker-and-boards
  - elite-breach-spire-overview
  - quest-guide-herald-and-tracker
invariants:
  - "`heraldCompany` (`src/net/eliteGates/egBrain.js`) counts only entrants (`in` set on `B.mem`), never invited members who never entered, and `egAdmits` locks entry after the first wake."
  - "A company of `n === 1` posts under the entrant name with `alone` (`egRedoubtPost`, `egFirstPost`, `egSealPost` via `whoOf`), while `n >= 2` uses company wording."
  - "`validEgHeraldTell` (`src/net/eliteGates/egHerald.js`) accepts `rd` `n` in `1..EG_PARTY_MAX` and normalizes any other value to `0` (legacy company wording), folded once per breach and redoubt by `egHeraldFold`."
traps:
  - "An opener who never stepped inside is excluded from `heraldCompany`, whereas an entrant who later fell, forsook, or left still counts toward `n`."
  - "`heraldName` sanitizes names to letters, digits, spaces, apostrophes, and hyphens, falling back to `Someone` for empty solo names and `A company` for empty company names."
dfu: []
tags:
  - elite-breach
  - herald
  - redoubt
  - solo
---

# Elite Breach Lone Herald: Entrant Counting and Solo Post Wording

Elite Breach herald announcements (`src/net/eliteGates/egBrain.js`, `src/net/eliteGates/egHerald.js`, and `src/net/eliteGates/egLink.js`) count actual breach entrants rather than the invited roster.

## Entrant Counting

After the first wake, `egAdmits` (`src/net/eliteGates/egBrain.js`) locks entry. `heraldCompany` counts only members with `in` set on `B.mem`, excluding invited members or an opener who never stepped inside, while any entrant who later fell, forsook, or left still counts toward `n`.

## Wording and Hub Fold

- **Solo and Company Posts**: Via `whoOf`, `egRedoubtPost`, `egFirstPost`, and `egSealPost` post `n === 1` under the entrant name with `alone`, while `n >= 2` uses company wording.
- **Name Sanitization**: `heraldName` retains only letters, digits, spaces, apostrophes, and hyphens, falling back to `Someone` for empty solo names and `A company` for empty company names.
- **Internal Herald Tell**: Room-to-hub tells carry `n` internally without changing client WebSocket frames. `validEgHeraldTell` (`src/net/eliteGates/egHerald.js`) accepts `rd` `n` in `1..EG_PARTY_MAX` and normalizes other values to `0` (legacy company wording), folded once per breach and redoubt by `egHeraldFold`.
