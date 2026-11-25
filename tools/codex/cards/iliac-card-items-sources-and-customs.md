---
slug: iliac-card-items-sources-and-customs
title: "Iliac Card Items, Drop Sources, Worth, and Realm Customs"
domain: items
kind: subcard
parent: tavern-cards-holdem-and-iliac-hand
files:
  - src/net/iliacCards.js
  - src/cards/iliacItems.js
  - src/cards/cardSources.js
  - src/cards/bossCards.js
  - src/net/cardWorthLaw.js
  - src/saves/realmCustoms.js
  - src/trade/shopStock.js
  - src/ui/cardBinderPage.js
  - src/ui/cardPanelKit.js
  - src/ui/cardTableHud.js
  - src/ui/collectionsPage.js
replacesBible:
  - "11-Multiplayer/Tavern-Cards.md#catalog"
  - "11-Multiplayer/Tavern-Cards.md#binder"
  - "11-Multiplayer/Tavern-Cards.md#sources"
  - "11-Multiplayer/Tavern-Cards.md#ui"
related:
  - iliac-hand-rules-relay-and-ladder
  - tavern-cards-holdem-and-iliac-hand
  - items-gold-counter-and-wagon
  - economy-ledger-and-item-judge
  - realm-saves-and-mod-save-hooks
  - ui-overlays-and-localization
invariants:
  - "Individual cards use template `581` (`ILIAC_CARD_TEMPLATE`), are weightless, stack by catalog ID, and take `CARD_WORTH[tier]` (`common: 5`, `magic: 20`, `rare: 75`, `legendary: 300`, `aetheric: 1200`, `artifact: 2500`, `gilded: 5000`); shops refuse to buy cards or packs (`583`)."
  - "The Card Binder (template `582`) is bound and inventory-only, granted once with the 30-card `STARTER_DECK` at character creation (`giveBinderAtChargen`) or via `binderGift` (`BINDER_GIFT = 1`), and stores up to `BINDER_DECKS_MAX` (`12`) decks."
  - "Sealed packs (`583`, sold at `CARD_PACK_BASE_PRICE = 40` via `calculateTradePrice`) yield `CARD_PACK_SIZE` (`5`) cards: four from `PACK_SLOT_TIERS` (`common: 720`, `magic: 280`) and one from `PACK_TOP_TIERS` (`rare: 850`, `legendary: 130`, `aetheric: 15`, `artifact: 5`), excluding boss and festival cards."
  - "Offline-to-online character imports cap total card and pack value (`CARD_PACK_WORTH = 171`) at `customsCardAllowance(level) = STARTER_DECK_WORTH + 150 * level`, trimming the highest-worth cards first."
traps:
  - "When `cardCustoms` (`src/saves/realmCustoms.js`) trims an over-budget offline import, it removes the most expensive card first; only among equal-worth cards does it strip house decor before copies unneeded by saved binder decks."
  - "`foeCardRoll` skips revenants and world bosses; world bosses roll via hoard `bossCardRoll` (`src/cards/bossCards.js`), which always consumes one RNG draw to keep downstream loot deterministic."
tags:
  - items
  - cards
  - loot
  - customs
  - binder
  - ui
---

Iliac Hand cards span seven `ILIAC_TIERS` (`common` through `gilded`) in `src/net/iliacCards.js` and are instantiated by `src/cards/iliacItems.js`. Despite an older file comment in `iliacItems.js`, `src/trade/shopStock.js` blocks selling cards (`581`) and packs (`583`) to merchants.

## Drop Sources and Boss Cards

In `src/cards/cardSources.js`, regular enemies roll `foeCardRoll` at `FOE_CARD_PER_MILLE` (`common: 16`, `magic: 11`, `rare: 7`, `legendary: 3`), doubled by `TITLED_FOE_CARD_MULT` (`2`) for titled enemies. Guild quest completions roll `GUILD_CARD_PER_MILLE` (`334`), awarding the highest tier allowed by the player's guild rank.

In `src/cards/bossCards.js`, `BOSS_CARDS` maps 13 Battlespire lords plus three world bosses (`valkynaz-ruhn` for Gate, `sethrakul` for Serpent, and `brass-remnant` for the Abyss Dungeon). `bossCardRoll` drops a boss card at `BOSS_CARD_PER_MILLE` (`200`, or `250` for Serpent and Abyss).

## Binder UI and Table Overlays

The collection viewer and deck builder (`src/ui/cardBinderPage.js`) mount inside the Holdings Collections tab alongside the Legendary weapon codex (`src/ui/collectionsPage.js`). In-game table HUDs (`src/ui/cardTableHud.js` and `src/ui/iliacTableHud.js`) share styling from `src/ui/cardPanelKit.js` and swallow `pointerdown`, `mousedown`, `click`, `touchstart`, `wheel`, and `contextmenu` events so table clicks never trigger weapon swings or camera movement.
