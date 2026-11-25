---
slug: "craft-caps-loot-door-and-hunt-bounds-overview"
title: "Craft Caps, Relay Loot Door, and Hunt Book Bounds"
domain: "progression"
kind: "overview"
parent: null
files:
  - "src/ui/craftHall.js"
  - "src/net/profBook.js"
  - "src/net/masterLaw.js"
  - "src/net/wire.js"
  - "server/src/world/lease.js"
  - "src/items/sigilSets.js"
  - "tools/huntPace.mjs"
  - "src/net/huntLaw.js"
  - "src/net/huntBook.js"
  - "src/characters/wardrobe.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Horizontal.md"
related:
  - "sea-crew-caps-and-quay-tow-limits"
  - "professions-crafting-provenance-and-master-art"
  - "combat-formulas-and-power-ceiling"
  - "bounty-hunt-ledger-marks-and-mastery"
  - "collections-wardrobe-catalogue-and-availability"
invariants:
  - "Craft hall XP rows cap at `GATHER_TOPS` and `benchTop` per act, and `profBook` re-reads whenever `stateGen` changes during an in-flight read."
  - "Master work lines roll once and sign via `masterRecordLines`, never re-rolling on read, and set catch-up reach reads only worn pieces (`wornSetRanks`)."
  - "Loot rooms attach `hello.ll = LOOT_HELLO_LAW` (bounded by `LOOT_HELLO_LAW_WIRE_MAX`); when relay `lootDoor` is on, `_lootDoorRefusal` in `server/src/world/lease.js` rejects builds below `LOOT_HELLO_LAW`."
  - "`HUNT_CLEARS_DAY_MAX = 750` derives from `tools/huntPace.mjs`, mark rungs evaluate against their own week, and `403 hunt-need-account` closes `huntBook` (`closed = true`) instead of retrying."
traps:
  - "`_lootDoorRefusal` lives in `server/src/world/lease.js`, not `server/src/index.js`; enable `lootDoor` only after relay and web builds carrying `ll` are deployed."
  - "Never treat `hunt-need-account` (`403`) as transient; `huntBook` latches `closed = true` until an account session exists."
dfu: []
tags:
  - "crafting"
  - "master-art"
  - "loot-door"
  - "hunters-mark"
  - "wardrobe"
---

# Craft Caps, Relay Loot Door, and Hunt Book Bounds

Horizontal progression guards bound crafting XP, master work signing, relay loot-room admission, hunt ledger pacing, and wardrobe role isolation.

## Crafting, Master Lines, and Set Reach

In `src/ui/craftHall.js`, craft hall XP rows cap at `GATHER_TOPS` and `benchTop` per act, while `src/net/profBook.js` re-reads whenever `stateGen` changes during an in-flight read. Master work stat lines (`src/net/masterLaw.js`) roll once at creation and sign via `masterRecordLines`, never re-rolling on read. In `src/items/sigilSets.js`, set catch-up reach reads only worn pieces via `wornSetRanks`, and `wornByRole` in `src/characters/wardrobe.js` pins appearance role isolation.

## Relay Loot Door and Hunt Book Pacing

- **Loot room handshake (`src/net/wire.js`, `server/src/world/lease.js`):** Loot rooms attach `hello.ll` (`LOOT_HELLO_LAW`, bounded by `LOOT_HELLO_LAW_WIRE_MAX`). When relay `lootDoor` is on, `_lootDoorRefusal` in `server/src/world/lease.js` rejects client builds below `LOOT_HELLO_LAW`.
- **Hunt book caps (`tools/huntPace.mjs`, `src/net/huntLaw.js`, `src/net/huntBook.js`):** `HUNT_CLEARS_DAY_MAX` (`750`) derives from `tools/huntPace.mjs`, and service UTC day holds a day-full hunt report until UTC midnight rollover. Mark rungs evaluate against their own week, while `403` (`hunt-need-account`) latches `closed` (`true`) on `huntBook` instead of retrying.
