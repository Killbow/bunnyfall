---
slug: wallet-sheet-ledger-and-silver
title: "Wallet Sheet, Ledger Rows, and Silver Check"
domain: ui
kind: subcard
parent: wallet-organizer-overview
files:
  - src/items/walletItem.js
  - src/ui/enhancedInventory.js
  - src/ui/nativeInventory.js
  - src/ui/packPages.js
  - src/items/quickslots.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Wallet.md"
related:
  - wallet-organizer-overview
  - hotbar-icons-item-slotting-and-key-gate
invariants:
  - "walletLedger yields sections 'Coin' and 'In the wallet'; walletLines renders the same rows so classic and enhanced views agree."
  - "refreshWalletSilver keeps at most one request in flight (_asking)."
  - "SILVER_WHY: offline 'held in your online account', asking 'checking your account', none 'none'."
traps:
  - "packPages files letters of credit (MiscItems 275) under Valuables; group alone would send them to Misc."
dfu: []
tags:
  - wallet
  - inventory-ui
  - silver
---

# Wallet Sheet, Ledger Rows, and Silver Check

Inventory windows, pack tabs, and hotbar slots (`src/items/walletItem.js`, `src/ui/enhancedInventory.js`, `src/ui/nativeInventory.js`, `src/ui/packPages.js`, `src/items/quickslots.js`, and `src/scenes/world.js`) render a unified wallet ledger and query the online Marks balance without duplicating carried currency items.

## Unified Ledger Sections and Valuables Tab Routing

In `src/items/walletItem.js`, `walletLedger` yields sections `'Coin'` and `'In the wallet'`, while `walletLines` renders those same rows so classic (`src/ui/nativeInventory.js`), enhanced (`src/ui/enhancedInventory.js`), and quickslot (`src/items/quickslots.js`) views agree. In `src/ui/packPages.js`, letters of credit (`MiscItems` `275`) file under Valuables because item group alone would send them to Misc.

## Online Silver Balance Query and Status Reasons

In `src/scenes/world.js`, `setWalletSilver` connects the wallet silver reader to the online Marks book balance when connected to the relay. Opening the wallet calls `refreshWalletSilver`, which guards concurrent calls with `_asking` so at most one account request stays in flight at a time. When no numeric balance is shown, `SILVER_WHY` supplies the status text: `'held in your online account'` while offline, `'checking your account'` while `_asking` is active, and `'none'` when the online balance is zero.
