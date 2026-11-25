---
slug: witches-festival-wyrd-sister-sales
title: "Wyrd Sister Wares, Idempotent Sales, and Starwarden Purse"
domain: systems
kind: subcard
parent: witches-festival-overview
files:
  - src/net/festivalLaw.js
  - server-account/src/festival.js
  - src/systems/festival/festivalClient.js
  - src/ui/wyrdWindow.js
  - src/items/aetheric.js
  - src/net/identityToken.js
  - src/net/accountClient.js
  - server-account/src/index.js
  - server-account/src/questlines.js
  - src/systems/quest/questlineHost.js
  - src/systems/questlines/quests/QLTF01.txt
routes:
  - /v1/festival/buy
  - /v1/account/icon
  - /v1/account/title
  - /v1/account/aura
tables:
  - players
  - fest_sales
replacesBible:
  - "06-Systems/Witches-Festival.md"
related:
  - witches-festival-overview
  - questlines-service-claims-titles-and-weir-key
  - starfall-overview
  - market-vendors-and-professions
invariants:
  - "Every `/v1/festival/buy` purchase runs a guarded `UPDATE` on `players` that deducts `price` only when `fest_cakes >= price` (and, for account unlock wares, only when `fest_wares` does not already contain the ware), inserting a `fest_sales` row in the same D1 batch."
  - "The client generates a 12-hex-digit request ID (`SALE_RID_RE`); a duplicate request ID returns `{ repeat: true, ware, ... }` before `gate` runs, even if the festival has closed in the meantime."
  - "At most one purchase is in flight on the client: `_pending` is persisted in `'WitchesFestival'` mod save data until settled, and only a terminal refusal in `SALE_FINAL` (`ware`, `rid`, `owned`, `cakes`, `closed`, or `rate`) clears it without delivery."
  - "Account unlock wares (`title`, `aura`, and `icon`) are purchased once and stored on the account, whereas Hearth Offerings, Wyrd's Raiment pieces (`bound = true`), and Iliac cards are minted client-side only after the server deducts the cakes."
  - "`QL_PURSES` in `server-account/src/questlines.js` awards `QL_STARWARDEN_CAKES = 30` Soul Cakes once per account under `(ql_titles & bit) = 0` when granting the `starwarden` title for Thirteenth of Frostfall, provided both `festivalOpenFor` and `festivalOpen` are true."
traps:
  - "Opening the Wyrd Sister dialog reports the `wyrd-met` act, which triggers Morwen's letter (`QLTF01.txt`, delivered by raven if the player already holds a fallen star) but never rolls a Soul Cake find."
  - "`src/ui/wyrdWindow.js` displays unknown balances (`null`) rather than `0` until `/v1/festival/mine` responds, polling local state every `WYRD_WATCH_MS = 2000` ms."
dfu: []
tags:
  - witches-festival
  - vendor
  - idempotency
  - profile-icon
  - aetheric-set
  - questlines
---

# Wyrd Sister Wares, Idempotent Sales, and Starwarden Purse

Wyrd Sister vendor inventory, idempotent purchase settlement, and account cosmetic unlocks live in `src/net/festivalLaw.js`, `server-account/src/festival.js`, `src/systems/festival/festivalClient.js`, and `src/ui/wyrdWindow.js`.

## Catalog, Pricing, and Idempotent Settlement

- **Prices (`FESTIVAL_WARES` in `src/net/festivalLaw.js`):** Account unlocks cost `60` cakes for the `witchwarden` title, `150` for the `witchfire` aura, and `40` each for the `tallowskull`, `twinmoons`, and `wyrdcauldron` icons. Repeatable wares cost `5` cakes for a Hearth Offering bowl, `40` for most `WYRD_PIECE_IDS` pieces (`50` for `wyrd-robe`, `60` for `wyrd-athame`; nine bound Aetheric pieces from `wyrd-hood` to `wyrd-athame` in `src/items/aetheric.js`), and `20` for five `FESTIVAL_CARD_IDS` cards (`45` for `spectre-of-lysandus`; all six cards are excluded from standard packs and drops).
- **Idempotent purchase flow (`/v1/festival/buy`):** The client stores `_pending` (with a 12-hex-digit `rid` matching `SALE_RID_RE`) in `'WitchesFestival'` mod save data. On the server, `festivalBuy` checks `fest_sales` by `rid` before running `gate` so retries settle after close, then batches the guarded `players` deduction (`fest_cakes >= price`) and `fest_sales` insert.

## Icons, Equips, and Questline Integration

`ICONS` in `src/net/identityToken.js` lists `tallowskull`, `twinmoons`, `wyrdcauldron`, and `soulcake` (earned at `SOULCAKE_TAKEN = 10` cakes taken); `mintToken` writes the active icon into the identity token `pi` claim. Equipping cosmetics calls `/v1/account/icon`, `/v1/account/title`, and `/v1/account/aura` (`wearAccount` in `src/net/accountClient.js` and `server-account/src/index.js`, returning `403` `not-held` if unowned). Meeting a Wyrd Sister (`src/systems/quest/questlineHost.js`) fires `wyrd-met` to start `QLTF01.txt`, whose final step awards `QL_STARWARDEN_CAKES = 30` cakes (`server-account/src/questlines.js`).
