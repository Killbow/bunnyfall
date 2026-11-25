---
slug: community-arc-overview
title: "Community Arc: Chat, Letters, Pages, Inspect, Loot Piles, and Duels"
domain: multiplayer
kind: overview
parent: null
files:
  - src/ui/chatPanel.js
  - src/net/chat.js
  - src/net/chatCommands.js
  - src/player/lootStack.js
  - src/characters/corpseMarker.js
  - src/player/activate.js
  - src/net/mail.js
  - src/net/journalPage.js
  - src/net/profileCard.js
  - src/net/duelSession.js
  - src/net/wire.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Community-Arc.md"
related:
  - community-chat-channels-dice-and-emotes
  - community-letters-pages-and-profile-cards
  - community-duels-ring-and-relay-receipts
  - chat-safety-overview
  - integrity-pvp-duel-and-wild-referees
invariants:
  - "Relay-gated features check the relay version before sending: ROLL_RELAY_MIN, EMOTE_RELAY_MIN, CARD_RELAY_MIN and PAGE_RELAY_MIN are all 102; LANG_RELAY_MIN is 196."
  - "Loot stacking: noteBodyStack (src/player/lootStack.js) gathers corpses within ray reach of the first hit (corpseLootTargets, pileBody in src/characters/corpseMarker.js; pickActivatableHit in src/player/activate.js) into one window with a tab per body."
traps:
  - "Feature version gates are relay version numbers. Never hardcode a RELAY_VERSION literal; compare through the relaySupports* helpers."
dfu:
  - Assets/Scripts/Game/PlayerActivate.cs
tags:
  - community-arc
  - chat
  - mail
  - journal
  - inspect
  - loot-stack
  - duel
---

# Community Arc: Chat, Letters, Pages, Inspect, Loot Piles, and Duels

The community arc connects social communication, corpse looting, offline mail, shared notebook pages, character inspection, and peer duels across `src/ui/`, `src/net/`, and `src/player/`.

## Relay Version Gates and Corpse Loot Stacking

- **Relay capability checks (`src/net/wire.js`):** Social features query relay version thresholds through `relaySupports*` helpers rather than comparing raw `RELAY_VERSION` literals. `ROLL_RELAY_MIN`, `EMOTE_RELAY_MIN`, `CARD_RELAY_MIN`, and `PAGE_RELAY_MIN` require version `102`, while `LANG_RELAY_MIN` requires version `196`.
- **Tabbed corpse loot (`src/player/lootStack.js`):** Standard Daggerfall Unity corpse activation in `Assets/Scripts/Game/PlayerActivate.cs` stops at `CorpseActivationDistance = 150 * GlobalScale`. When a player clicks a fallen body, `pickActivatableHit` (`src/player/activate.js`) and `corpseLootTargets` (`src/characters/corpseMarker.js`, with `pileBody`) collect nearby corpses within ray reach of the initial hit. `noteBodyStack` merges those targets into a single loot window with one tab per corpse.

## Subcards

- `community-chat-channels-dice-and-emotes`: panel sizing, region and language rooms, `/roll`, 38 emotes, and `/rp` lines.
- `community-letters-pages-and-profile-cards`: account `letters`, nearby `PageOffers`, and rate-limited inspect profile cards.
- `community-duels-ring-and-relay-receipts`: ring boundaries, striker-counted blows, and relay-signed `/v1/duel/claim` results.
