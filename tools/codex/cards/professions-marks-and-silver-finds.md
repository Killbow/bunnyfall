---
slug: professions-marks-and-silver-finds
title: "Marks Currency, Faucets, Bank, and Silver Finds"
domain: economy
kind: subcard
parent: professions-arc-overview
files:
  - src/net/marksLaw.js
  - src/net/marksBook.js
  - src/items/silverFinds.js
  - server-account/src/marks.js
routes:
  - /v1/marks/balance
  - /v1/marks/exchange
  - /v1/marks/report
  - /v1/marks/find
  - /v1/marks/guild/deposit
  - /v1/marks/guild/withdraw
tables:
  - marks
  - guild_marks
  - marks_ledger
replacesBible:
  - "06-Systems/Professions-Arc.md"
related:
  - professions-arc-overview
  - economy-ledger-and-item-judge
  - professions-gathering-nodes-and-motherlodes
invariants:
  - "`MARKS_MAX` is 10,000,000 per balance; `MARKS_MOVE_MAX` is 1,000,000."
  - "`MARKS_BANK` exchanges Marks into gold only at 8 gold per Mark with no daily exchange cap; gold never buys Marks."
  - "`MARKS_COMBAT` groups `gate`, `raid`, `serpent`, `eg`, and `star` in activity totals without a daily earning cap; replay protection deduplicates by `rid` or witnessed event."
  - "Mutating Marks operations require an `rid` matching `MARKS_RID_RE`, and `MARKS_OPS_MAX` allows 120 mutations per `MARKS_OPS_WINDOW_S` (3,600 s)."
traps:
  - "Marks operate only when `MARKS_OPEN` (`marksSwitchOf`: `off`, `dev`, or `on`) is active; offline play earns no Marks."
  - "World find requests must use a kind from `FIND_KINDS` (`corpse`, `pile`, or `search`), each rolled at its own rate under `MARKS_FAUCETS.find`."
tags:
  - marks
  - currency
  - faucets
  - silver-finds
  - bank
---

Marks (`src/net/marksLaw.js`, `src/net/marksBook.js`, and `server-account/src/marks.js`) are the online currency for player markets, writs, specializations, and guild treasuries. The currency requires `MARKS_OPEN` (`marksSwitchOf`: `off`, `dev`, or `on`), and offline sessions earn none.

## Balances, Bank Exchange, and Rate Limits

Personal (`marks`) and guild (`guild_marks`) balances cap at `MARKS_MAX` (10,000,000), with single transfers bounded by `MARKS_MOVE_MAX` (1,000,000). Alongside `/v1/marks/balance` reads, mutating routes (`/v1/marks/exchange`, `/v1/marks/report`, `/v1/marks/find`, `/v1/marks/guild/deposit`, and `/v1/marks/guild/withdraw`) write a `marks_ledger` row keyed by an `rid` matching `MARKS_RID_RE` under `MARKS_OPS_MAX` (120 mutations per `MARKS_OPS_WINDOW_S` of 3,600 s).

Nominal valuation sets `MARK_WORTH_GOLD` at 10, while `/v1/marks/exchange` (`MARKS_BANK`) converts Marks into gold one-way at 8 gold per Mark without a daily cap. Gold never buys Marks.

## Faucets and Silver Finds

`MARKS_FAUCETS` and `src/items/silverFinds.js` govern online earnings without daily caps on combat, gathering, motherlodes, guild deeds, or loot finds:

- **Combat (`MARKS_COMBAT`, `/v1/marks/report`):** Oblivion Gates (`gate` 50), town raids (`raid` 30), sea serpents (`serpent` 40), Elite Breach Redoubts (`eg`), and fallen stars (`star` 30) strike once per witnessed event and account (`deed` strikes 25 to a guild treasury once 3 tenured members claim the same raid or gate).
- **Gathering and contracts:** Counted harvests roll `MARKS_FAUCETS.gather` (10% chance, 2 to 5 Marks) and Motherlode strikes pay 10 Marks per witnessed node, while Court writs (`writ`) and crafting writs (`craftWrit`) each allow 3 fills per UTC day.
- **Silver finds (`/v1/marks/find`):** Looting and searching roll `FIND_KINDS` (`corpse` 5%, `pile` 12%, and `search` 15%) for 1 to 4 Marks per unique `rid`.
