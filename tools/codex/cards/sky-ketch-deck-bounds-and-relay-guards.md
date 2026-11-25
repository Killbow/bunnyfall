---
slug: "sky-ketch-deck-bounds-and-relay-guards"
title: "Sky-Ketch Deck Bounds, Roof Cast-Back, Rez Timestamps, and Stand-In Bars"
domain: "multiplayer"
kind: "subcard"
parent: "sky-ketch-raid-overview"
files:
  - "src/systems/ketch/ketchDeckHost.js"
  - "src/net/ketch/ketchDeck.js"
  - "src/net/ketch/ketchConstructs.js"
  - "src/worldEvents/sdSteps.js"
  - "src/world/ketch/ketchModel.js"
  - "server/src/world/ketch.js"
  - "src/net/ketch/ketchReceipt.js"
  - "src/world/spoilsWorld.js"
  - "src/ui/hudFoeTarget.js"
  - "src/combat/healthShare.js"
  - "src/world/gateBoss.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Ketch-II.md"
related:
  - "sky-ketch-raid-overview"
  - "sky-ketch-stages-cells-and-constructs"
  - "tonal-warden-fight-and-downed-crew"
  - "sky-ketch-receipts-spoils-and-claims"
invariants:
  - "Own-cast deck bodies (lid and engine-house roof via `ketchOnRoof`) land through `ketchSkyLanding` at the active checkpoint, Sailwalk span, or `KT_ARRIVE`."
  - "`KT_BOW` (`{ tip: 4, beam: 8, at: 6 }`) and `ketchBowHalf` in `src/net/ketch/ketchDeck.js` define the bow floor boundary enforced by `keepOnFloor`, and Sentries back off for `KT_KEEP_BACK_MS` (`2500` ms) before firing in place."
  - "Server-side ``rez`` stamps `players[sub].rzAt` (`server/src/world/ketch.js`) so poses at or before `rzAt` are not treated as dead, and hub receipt delivery retries every `KT_TELL_RETRY_MS` (`30` s) up to `KT_RECEIPT_VOYAGE_MAX` (`0xffffffff`)."
  - "Stand-in boss target bars (`src/ui/hudFoeTarget.js`, `src/world/gateBoss.js`) read `relayShare` via `src/combat/healthShare.js` and record hits through `markHostStruck`."
traps:
  - "Rotten Rigging wind gusts (`src/worldEvents/sdSteps.js`) must gate on `sdBreathBand` (`SD_BREATH_BAND_M = 3`), never on `z` coordinate alone."
  - "Stand-in target bars must read `relayShare` through `healthShare`, never `STAND_IN_WHOLE`."
dfu: []
tags:
  - "sky-ketch"
  - "collision"
  - "relay"
  - "hud"
---

# Sky-Ketch Deck Bounds, Roof Cast-Back, Rez Timestamps, and Stand-In Bars

Sky-Ketch deck geometry, roof cast-back landings, relay resurrection timestamps, receipt retries, and stand-in boss target bars keep raid state synchronized.

## Deck Boundaries, Roof Landings, and Sentries

In `src/systems/ketch/ketchDeckHost.js` and `src/world/ketch/ketchModel.js`, players on the lid or engine-house roof (`ketchOnRoof`) land via `ketchSkyLanding` at the active checkpoint, Sailwalk span, or `KT_ARRIVE`. In `src/net/ketch/ketchDeck.js`, `KT_BOW` (`tip: 4`, `beam: 8`, `at: 6`) and `ketchBowHalf` define the bow floor boundary for `keepOnFloor`. Sentries (`src/net/ketch/ketchConstructs.js`) retreat for `KT_KEEP_BACK_MS` (`2500` ms) before firing in place, and Rotten Rigging gusts (`src/worldEvents/sdSteps.js`) gate on `sdBreathBand` (`SD_BREATH_BAND_M` at `3` m).

## Relay Resurrection, Receipts, and Target Bars

- **Resurrection and receipts (`server/src/world/ketch.js`, `src/net/ketch/ketchReceipt.js`, `src/world/spoilsWorld.js`):** Server `rez` stamps `players[sub].rzAt`, ignoring older poses as dead, and `dn` frames set `sw: 1` on pellet-free overboard removal. Hub receipt delivery retries every `KT_TELL_RETRY_MS` (`30` s) up to `KT_RECEIPT_VOYAGE_MAX` (`0xffffffff`), while `resendSpent` covers the Ketchmaster hold pool.
- **Target bars (`src/ui/hudFoeTarget.js`, `src/combat/healthShare.js`, `src/world/gateBoss.js`):** Stand-in boss bars read `relayShare` via `healthShare` (never `STAND_IN_WHOLE`) and record hits through `markHostStruck`.
