---
slug: community-chat-channels-dice-and-emotes
title: "Chat Panel Sizing, Channels, Dice Rolls, Emotes, and Roleplay Lines"
domain: multiplayer
kind: subcard
parent: community-arc-overview
files:
  - src/ui/chatPanel.js
  - src/ui/chatScroll.js
  - src/ui/chatColours.js
  - src/net/chat.js
  - src/net/chatCommands.js
  - src/net/dice.js
  - src/net/wire.js
  - src/net/remotePlayers.js
  - src/ui/nameLayer.js
  - server/src/message/frames/roll.js
  - server/src/room/doors.js
  - tools/chatScrollProbe.mjs
  - tools/chatSizeProbe.mjs
  - tools/chatChanProbe.mjs
routes: []
tables: []
replacesBible:
  - "06-Systems/Community-Arc.md"
related:
  - community-arc-overview
  - chat-safety-overview
  - room-engine-and-hub-sharding
invariants:
  - "Chat width ranges from CHAT_WIDTH_MIN = round(440 * 0.8) = 352 to CHAT_WIDTH_MAX = round(440 * 1.8) = 792. Text scales with width / CHAT_WIDTH_BASE (440)."
  - "List height runs from CHAT_LIST_MIN = 80 px to CHAT_LIST_MAX_VH = 75 (three quarters of the viewport). CHAT_SIZE_STEP = 20 px per arrow key on the grip."
  - "The Region tab joins chat:region.<i> (CHAT_REGION_COUNT = 62) after CHAT_REGION_HOLD_MS = 5000 via nextRegionRoom. The first region is joined immediately."
  - "CHAT_SAY_RANGE = 60 equals NAME_RANGE = 60 (src/net/remotePlayers.js). VOICE_RANGE: a shout reaches 3x that range, low speech reaches 1/4."
  - "ChatLog.pushAll puts one line on every tab; it shows in the peek once and adds to the unread count once."
  - "Dice: the client sends {t:'roll', n, m, k}. The relay (server/src/message/frames/roll.js) rolls with crypto-backed rand32 through drawBelow rejection sampling. Muted players are refused."
  - "Roll bounds: ROLL_DICE_MAX = 10, ROLL_SIDES_MAX = 1000, ROLL_MOD_MAX = 1000. A bare /roll is a d20. Rate: ROLL_HZ_MAX = 1 per socket, with strikes up to CHAT_STRIKES_MAX = 20."
  - "chat:trade and chat:lfg are unsharded, each capped at CHAT_SOCKETS_MAX = 2048. CHAT_LANGS lists 15 language rooms (chat:lang.<code>)."
traps:
  - "sanitizeChat keeps a ZWJ only between Extended_Pictographic characters, so multi-part emoji stay whole. graphemeCut (src/ui/nameLayer.js) trims bubble text by grapheme."
  - "/me sends me: true and is refused on old relays with EMOTE_OLD_RELAY_TEXT."
  - "EMOTES has 38 gestures, not 20."
dfu:
  - Assets/Scripts/Game/PlayerGPS.cs
tags:
  - chat
  - channels
  - dice
  - emotes
  - emoji
  - roleplay
  - language-channels
---

# Chat Panel Sizing, Channels, Dice Rolls, Emotes, and Roleplay Lines

`src/ui/chatPanel.js`, `src/net/chat.js`, and `src/net/chatCommands.js` drive chat geometry, channels, dice, emotes, and roleplay.

## Panel Sizing, Channels, and Voice Range

- **Geometry and colors:** Width scales between `CHAT_WIDTH_MIN = 352` and `CHAT_WIDTH_MAX = 792` around `CHAT_WIDTH_BASE = 440`. List height spans `CHAT_LIST_MIN = 80` px to `CHAT_LIST_MAX_VH = 75` in `CHAT_SIZE_STEP = 20` px increments. `paintList` scrolls opening panels to the newest line, `ChatLog.pushAll` broadcasts a line across tabs while counting peek and unread once, and `src/ui/chatColours.js` enforces 4.5:1 WCAG contrast via `contrast()`.
- **Rooms and range:** The Region tab joins its initial `chat:region.<i>` room (`CHAT_REGION_COUNT = 62`) immediately and switches after `CHAT_REGION_HOLD_MS = 5000` via `nextRegionRoom`. Unsharded `chat:trade` and `chat:lfg` cap at `CHAT_SOCKETS_MAX = 2048` (`server/src/room/doors.js`), while `CHAT_LANGS` defines 15 `chat:lang.<code>` rooms. Local speech uses `CHAT_SAY_RANGE = 60` (`NAME_RANGE = 60` in `src/net/remotePlayers.js`); under `VOICE_RANGE`, shouts reach 3x and low speech reaches 1/4.

## Dice, Emotes, Emoji, and Roleplay

Clients send `{t:'roll', n, m, k}` (`src/net/dice.js`; bare `/roll` defaults to d20) bounded by `ROLL_DICE_MAX = 10`, `ROLL_SIDES_MAX = 1000`, `ROLL_MOD_MAX = 1000`, and `ROLL_HZ_MAX = 1` (`CHAT_STRIKES_MAX = 20`). `server/src/message/frames/roll.js` refuses muted players and rolls via crypto-backed `rand32` and `drawBelow`. `EMOTES` defines 38 gestures, `/me` sends `me: true` (or `EMOTE_OLD_RELAY_TEXT` on older relays), `/rp` renders `*asterisks*` in green italics, and `/ooc` or `((text))` marks out-of-character speech. `SHORTCODE_LIST` maps 62 shortcodes to 60 emoji, `sanitizeChat` preserves ZWJ between `Extended_Pictographic` code points, and `graphemeCut` (`src/ui/nameLayer.js`) trims overhead bubbles.
