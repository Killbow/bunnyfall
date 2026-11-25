---
slug: loot-banner-acquire-watch-and-marks
title: "Acquire Watch and Receiver-Stripped Acquired Marks"
domain: items
kind: subcard
parent: loot-banner-overview
files:
  - src/items/acquireWatch.js
  - src/items/itemFields.js
  - src/net/realmTradeLaw.js
  - src/items/loot.js
  - src/world/wild/wildDropLaw.js
  - src/items/lootRarity.js
  - src/net/iliacCards.js
  - src/items/inventory.js
  - src/saves/save.js
routes: []
tables: []
replacesBible:
  - "10-UI/Loot-Banner.md"
related:
  - loot-banner-overview
  - loot-rarity-ladder-overview
invariants:
  - "Markable items (non-ammo weapons, armor, clothing, jewellery, artifacts, cards) get `acquired: true` on the first frame they appear across the pack, wagon, and Materials Bag."
  - "`acquired` is a declared bool field in itemFields.js. It persists in saves and is stripped by RECEIVER_MARKS on the wire and in wild death records."
  - "Moving an item between pack, wagon, and bag is never an arrival. An entity's first frame, a restorePlayer load, and character creation set baselines only."
  - "Cards arrive when their total count across all three lists rises from one frame to the next, minus marked incoming records."
traps:
  - "Pieces already sitting in house chests or guild vaults have no mark, so they announce once when first withdrawn."
  - "A withdrawn card that merges onto a pack stack raises the count, so it announces."
  - "Items placed in an online room chest lose their marks over the wire and re-announce after a room rebuild."
dfu: []
tags:
  - acquired
  - receiver-marks
  - wire
  - saves
---

# Acquire Watch and Receiver-Stripped Acquired Marks

`createAcquireWatch` (`src/items/acquireWatch.js`) detects new loot arrivals across the player pack, wagon, and Materials Bag (`src/items/inventory.js`) without re-firing when items move between those containers or load from `src/saves/save.js`.

- **Markable arrivals and baseline frames:** Markable items tested by `markable` (non-ammo weapons, armor, clothing, jewellery, artifacts, and cards) receive `acquired: true` on the first frame they appear across the three player lists. The initial frame of an entity, a `restorePlayer` load, and character creation set the baseline without announcing. Cards arrive whenever their combined count across all three lists rises from one frame to the next, minus already marked incoming records.
- **Tier resolution (`acquiredTier`):** Card tiers resolve directly from the card catalog (`src/net/iliacCards.js`) regardless of the loot-rarity toggle. All other items read `rarityAttr` (`src/items/lootRarity.js`), returning nothing when rarity is disabled or the tier is Common.
- **Persistence and wire stripping:** `src/items/itemFields.js` declares `acquired` as a persistent boolean field saved to disk, while `RECEIVER_MARKS` (`src/net/realmTradeLaw.js`) strips `acquired` alongside `equipSlot`, `questItem`, `wagonEntry`, `horseBond`, `horseFed`, and `appearance` on the wire (`src/items/loot.js`) and in wild death drops (`src/world/wild/wildDropLaw.js`). Unmarked house chest, guild vault, or rebuilt online room chest withdrawals therefore announce once when taken.
