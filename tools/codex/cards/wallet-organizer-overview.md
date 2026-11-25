---
slug: wallet-organizer-overview
title: "Wallet Currency Organizer and Pack Storage"
domain: items
kind: overview
parent: null
files:
  - src/items/walletItem.js
  - src/items/itemBound.js
  - src/net/realmTradeLaw.js
  - src/characters/startingGear.js
  - src/saves/save.js
  - tools/walletProbe.mjs
  - src/items/physicalItems.js
  - src/homes/decorItems.js
  - src/revenants/revenant.js
  - src/homes/homeYards.js
  - src/items/itemInfo.js
  - src/worldEvents/gateSpoils.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Wallet.md"
related:
  - wallet-sheet-ledger-and-silver
  - items-gold-counter-and-wagon
  - sigil-broker-daily-stock-and-dismantle
invariants:
  - "Held pieces (templates 275, 570, 571 via WALLET_HOLDS) stay in entity.items; the wallet never owns a separate collection."
  - "isWalletItem requires templateIndex === WALLET_TEMPLATE (580) AND group 'UselessItems2'."
  - "giveWalletGift grants once: skipped when entity.walletGift >= WALLET_GIFT (1); save.js snapshotPlayer/restorePlayer persist walletGift."
  - "isPackOnly reads the template row's packOnly; physicalItems refuses wagon/storage puts with packOnlyText."
  - "decorStandOf returns null and revenantMayTake returns false for pack-only pieces."
  - "The wallet weighs 0.00 kg; held pieces count once where they lie in the pack."
traps:
  - "Do not move held currency into entity.bagItems; banking, fines, reforge, saves and realm gold law read entity.items directly."
  - "Shown wallet weight (walletKg of held pieces) is display only; never add it to carried weight."
dfu: []
tags:
  - wallet
  - currency
  - items
  - encumbrance
  - bound
---

# Wallet Currency Organizer and Pack Storage

The wallet item (`src/items/walletItem.js` and subcard `wallet-sheet-ledger-and-silver`) is a bound, pack-only currency organizer that groups letters of credit and shard tokens (`WALLET_HOLDS`: templates `275`, `570`, and `571`) while leaving those records in `entity.items`.

## Template Row, One-Time Gift, and Pack-Only Guards

`isWalletItem` requires `templateIndex === WALLET_TEMPLATE` (`580`, in `BOUND_TEMPLATES` across `src/net/realmTradeLaw.js` and `src/items/itemBound.js`) and group `'UselessItems2'`. `WALLET_ROW` sets `basePrice` 1, `baseWeight` 0, `hasNoEncumbrance`, `worldTexture` `205/18`, `rarity` 20, `bound`, and `packOnly`. `giveWallet` (`src/characters/startingGear.js`) outfits new kits, and `giveWalletGift` grants once while `entity.walletGift < WALLET_GIFT` (`1`), persisted by `snapshotPlayer`/`restorePlayer` in `src/saves/save.js` (`tools/walletProbe.mjs`). For `isPackOnly` items, `src/items/physicalItems.js` and `src/homes/homeYards.js` refuse wagon or storage puts with `packOnlyText`, `decorStandOf` (`src/homes/decorItems.js`) returns `null`, and `revenantMayTake` (`src/revenants/revenant.js`) returns `false`.

## In-Place Pack Storage and Display Weight

Held pieces stay in `entity.items` rather than `entity.bagItems` because banking, fines, reforge, saves, and realm gold law read `entity.items` directly. The wallet weighs `0.00 kg` and held pieces (including Welkynd Shard, `baseWeight` 0.1 in `src/worldEvents/gateSpoils.js`) count once in the pack; `walletKg` (`src/items/itemInfo.js`, `toFixed(2) + ' kg'`) is display-only.
