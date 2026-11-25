---
slug: wardrobe-wire-and-receiver-marks
title: "Look Wire Fields and the Appearance Receiver Mark"
domain: multiplayer
kind: subcard
parent: wardrobe-appearances-overview
files:
  - src/net/wire.js
  - src/net/appearanceLaw.js
  - src/characters/foeBodies.js
  - src/characters/exteriorFoes.js
  - src/net/realmTradeLaw.js
  - src/items/itemFields.js
  - server-account/src/service.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Wardrobe.md"
related:
  - wardrobe-appearances-overview
  - wardrobe-drawn-piece-rendering
  - wire-protocol-and-frame-dispatch
  - economy-ledger-and-item-judge
  - revenant-lairs-thefts-and-companions
invariants:
  - "`validLookItem` (`src/net/wire.js`) retains the optional `ap = [t, m, v]` tuple on an equipped look item only when `validWireAppearance` (`src/net/appearanceLaw.js`) confirms it is a valid look matching the item kind, omitting `ap` otherwise."
  - "`validFoeRecord` (`src/net/wire.js`) accepts `la` only alongside `lw`, requiring strictly ascending in-range `[lwIndex, t, m, v]` tuples, dropping invalid entries, and omitting `la` when empty."
  - "`appearance` is listed in `RECEIVER_MARKS` (`src/net/realmTradeLaw.js`), so player trades, vault moves, and market transfers strip `item.appearance` and deliver the base item look to the recipient."
traps:
  - "Relays predating `ap` and `la` strip those fields and show peers the base item look, so relay and client updates can deploy in either order."
  - "The account server (`server-account/src/service.js`) must deploy before the client when changing `appearance` schema rules; an older account service rejects trades, listings, and vault moves carrying an unrecognized `appearance` field."
  - "Never hardcode `RELAY_VERSION` or `ACCOUNT_VERSION` literals in documentation or checks; read the live constants from `src/net/wire.js` and `server-account/src/service.js`."
dfu: []
tags:
  - wardrobe
  - wire
  - relay
  - companions
  - receiver-marks
---

# Look Wire Fields and the Appearance Receiver Mark

Multiplayer relays and the account server propagate and sanitize Wardrobe appearances across `src/net/wire.js`, `src/net/appearanceLaw.js`, `src/characters/foeBodies.js`, `src/characters/exteriorFoes.js`, `src/items/itemFields.js`, and `src/net/realmTradeLaw.js`.

## Wire Look Payloads (`ap` and `la`)

- **Player equipment (`ap` in `src/net/wire.js`):** Each equipped item entry validated by `validLookItem` may carry an optional `ap: [t, m, v]` array. `validLookItem` delegates to `validWireAppearance` (`src/net/appearanceLaw.js`) to verify that `[t, m, v]` names a catalog look matching the item's equipment kind, dropping invalid tuples so peers fall back to the base piece.
- **Sworn companion and enemy kits (`la` in `src/characters/foeBodies.js`, `src/characters/exteriorFoes.js`):** `foeWireLook` emits `{ lw, la }`, where `lw` holds `[slot, group, t, m, d, v]` equipment tuples and `la` holds sparse `[lwIndex, t, m, v]` appearance overrides. `exteriorFoes.js` transmits `la` alongside `lw` for sworn companion kits, and `validFoeRecord` (`src/net/wire.js`) enforces strictly ascending `lwIndex` bounds, strips invalid looks, and omits empty `la` arrays.

## Item Judge Validation and Receiver Marks

The account service (`server-account/src/service.js`) requires no dedicated route, D1 table, or SQL migration for appearances. Instead, `src/items/itemFields.js` declares `appearance` (`{ t, m, v }`, validated by `validAppearanceField`) for the item judge. Because `RECEIVER_MARKS` (`src/net/realmTradeLaw.js`, alongside `equipSlot`, `questItem`, `acquired`, `wagonEntry`, `horseBond`, and `horseFed`) includes `appearance`, any trade, vault deposit, or market sale strips `item.appearance` from the transferred item without affecting either player's unlocked `entity.appearances` collection.
