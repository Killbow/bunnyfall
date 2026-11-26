---
slug: caverns-society-contracts
title: "Caverns: The Cartographers' Society, Ore Contracts and Survey Seals"
domain: economy
kind: subcard
parent: professions-arc-overview
files:
  - src/net/mine/societyLaw.js
  - server-account/src/society.js
  - src/guilds/societyDesk.js
  - src/guilds/bunnyServices.js
  - server-account/src/titles.js
routes:
  - /v1/society
  - /v1/society/take
  - /v1/society/turnin
  - /v1/society/buy
  - /v1/society/kit
  - /v1/society/use
tables:
  - society_contracts
  - mine_kit
related:
  - caverns-mines-overview
invariants:
  - "A contract is one of the day's `societyOffers(character, day)`, one open a character; turned in from the Stores' `own` units alone, so Seals are never bought with gold."
  - "Seals and wares live on the players row (`society_seals`, `society_wares`, migration 0222); a ware's buy re-checks its price and the read row in the UPDATE that spends."
traps:
  - "A turn-in deletes its contract first and puts it back on a short Stores, so two turn-ins at once pay once."
  - "The Burning Stair's Elite Breach source is off; the wardrobe names the Society as its source."
tags:
  - caverns
  - society
  - titles
---

The Cartographers' hall offers `K - Ore contracts and Survey Seals` (`openSociety`), opening `createSocietyDesk`, a choice box in the Favor shop's manner. The desk reads `/v1/society`: the Survey Seals, the open contract and how much of its ore the Stores hold, or the day's three offers (`SOCIETY_CONTRACTS`: 400 iron for 40 Seals up to 30 adamantium for 130).

The shop (`SOCIETY_WARES`) sells a ladder of titles, each needing the one before (Prospector 150, Delver 400, Deepwarden 900, Master of the Seam 1800), and The Burning Stair aura (4000). `titlesHeld` and `aurasHeld` read the row's wares, so other players see them as any title or aura. The mine kit (`SOCIETY_KIT`: drill, fuel, lamps, Survey Rod) is bought for gold as a realm act (`societyKitBuy`, the record's purse) and kept in `mine_kit` (migration 0224); a member's Seals rise a tenth a rank, read off the realm record (`societyRankOf`).
