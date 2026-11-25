---
slug: "shared-chest-gold-pile-and-hold-keep"
title: "Shared Chest Gold Piles, Hold Keep-Alive, and Private Pour"
domain: "homes"
kind: "subcard"
parent: "ledger-law-pose-freshness-and-room-caps-overview"
files:
  - "src/homes/decorGrants.js"
  - "src/items/itemTransfer.js"
  - "server-account/src/decorAccess.js"
  - "server-account/src/routes/townRoutes.js"
  - "src/net/accountClient.js"
routes:
  - "/v1/homes/decor/use"
tables:
  - "decor_bin"
  - "decor_hold"
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-26r.md"
related:
  - "ledger-law-pose-freshness-and-room-caps-overview"
  - "decor-grants-wait-and-shared-chest-open"
  - "online-home-shared-chest-storage-overview"
  - "decor-built-in-hiding-wall-mounts-and-gold-drops"
invariants:
  - "Service-settled item lists (`from.pileCoins` in `src/items/itemTransfer.js`) hold withdrawn gold as a temporary pack coin pile until settlement succeeds, crediting the character purse only from landed settlement pay."
  - "Open shared-chest windows renew holds on item moves once `DECOR_HOLD_KEEP_MS = 60` s elapses (`src/homes/decorGrants.js`), well inside `HOLD_S = 180` s (`server-account/src/decorAccess.js`)."
  - "Hold renewal extends only an active hold owned by the requesting window; expired holds return `decor-lapsed` without re-acquiring."
traps:
  - "Switching home access to Private via `setDecorAccess` (`server-account/src/decorAccess.js`) always succeeds immediately over an open guest hold, pouring `decor_bin` rows back and rejecting later guest settles with `decor-shut`."
  - "While a shared chest window is open, wagon storage, materials bag, shift-drop, Use, Salvage, and Dismantle actions are blocked so items cannot leave the window pack before settlement."
dfu: []
tags:
  - "homes"
  - "decor"
  - "shared-chest"
  - "gold"
  - "leases"
---

# Shared Chest Gold Piles, Hold Keep-Alive, and Private Pour

Shared chest windows coordinate temporary gold piles, lease renewals, and private-mode transitions across `src/homes/decorGrants.js`, `src/items/itemTransfer.js`, `src/net/accountClient.js`, `server-account/src/decorAccess.js`, and `server-account/src/routes/townRoutes.js` (`/v1/homes/decor/use`).

- **Pending gold piles:** Gold is a purse count (`GOLD_PIECE_WEIGHT_KG = 0.0025` in `src/items/inventory.js`, Currency template `276`) paid in on settle and never returned as an item. Service-settled lists (`from.pileCoins` in `src/items/itemTransfer.js`) hold withdrawn gold as a temporary pack coin pile, crediting the purse only from landed settlement pay.
- **Hold keep-alive and pack locks:** Open shared-chest windows renew `decor_hold` leases over `decor_bin` on item moves after `DECOR_HOLD_KEEP_MS = 60` s (`src/homes/decorGrants.js`), inside `HOLD_S = 180` s (`server-account/src/decorAccess.js`). Renewal extends only an active hold owned by that window, returning `decor-lapsed` if expired. While open, wagon storage, materials bag, shift-drop, Use, Salvage, and Dismantle are blocked.
- **Immediate private pour:** Switching home access to Private via `setDecorAccess` (`server-account/src/decorAccess.js`) succeeds immediately over an open guest hold, pouring `decor_bin` rows back and rejecting later guest settles with `decor-shut`.
