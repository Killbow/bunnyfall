---
slug: guild-window-and-member-presence
title: Guild Window Pages and Member Online/Last-Seen Presence
domain: multiplayer
kind: subcard
parent: guild-overhaul-overview
files:
  - src/ui/socialPanel.js
  - src/net/guildBook.js
  - src/net/playClock.js
  - src/net/heartbeat.js
  - src/net/social.js
  - server-account/src/guilds.js
  - server-account/src/staffHidden.js
  - src/scenes/world.js
routes:
  - /v1/guilds/mine
tables:
  - guild_members
  - players
replacesBible:
  - "11-Multiplayer/Guild-Overhaul.md"
related:
  - guild-overhaul-overview
  - guild-item-vault-and-withdraw-grants
  - chat-safety-block-list-and-conduct
invariants:
  - "Member presence reuses the play heartbeat (`src/net/playClock.js`, `src/net/heartbeat.js`): `viewOf` reads `COALESCE(players.played_at, players.last_seen)` as `seenAt`, and `guildMemberOnline` returns true while `now - seenAt <= PLAY_GRACE_S` (`2 * PLAY_BEAT_S`, where `PLAY_BEAT_S = 300`)."
  - "`guildSeenText` formats last-seen strings using `lastOnlineText` from `src/net/social.js`."
  - "Staff accounts in hidden mode (`server-account/src/staffHidden.js`) report last-online as of `hiddenSince` rather than live presence, including on their own member row (`hidden` flag)."
traps:
  - "The Company window opens only through `socialPanel.openGuild` from the Adventurers Guild hall desk (`openCompany` in `src/scenes/world.js`, which retries for up to 2 seconds while the desk collider blocks `canOpen`) or the hall chest (`openGuild('vault')`); the social panel has no Guild tab."
  - "The window key handler (`guildArrow`) captures Left and Right arrow keys and advances at most one page per physical key press when held."
  - "Under `GUILD_SMALL_QUERY` (`'(max-width: 760px), (max-height: 520px)'`), the window shifts below the toast strip so its close button remains clickable, and taking combat damage does not auto-close the window."
dfu: []
tags:
  - guilds
  - ui
  - presence
  - heartbeat
  - staff-hidden
---

# Guild Window Pages and Member Online/Last-Seen Presence

The Company window (`src/ui/socialPanel.js` and `src/net/guildBook.js`) renders guild overview, roster, vault, heraldry, and ledger pages outside the social panel and displays live or last-seen member presence from `GET /v1/guilds/mine` (`server-account/src/guilds.js`).

- **World entry points and layout (`src/scenes/world.js`, `src/ui/socialPanel.js`):** With no Guild tab in the social panel, players open the window via `socialPanel.openGuild` at an Adventurers Guild desk (`openCompany`, retrying for up to `2` seconds while the desk box blocks `canOpen`) or on the vault page at a hall chest (`openGuild('vault')`). Taking damage does not close the window. Under viewports matching `GUILD_SMALL_QUERY` (`'(max-width: 760px), (max-height: 520px)'`), the window drops below the toast strip so its close button stays reachable.
- **Book pagination (`src/net/guildBook.js`):** `guildPageNames()` and `guildPageWords()` supply page titles and labels, while `guildCards` lays out page cards. `guildArrow` handles Left and Right arrow keys, turning one page per press, and the book re-renders only when `pictureOf(state, guild, invites)` changes.
- **Heartbeat presence and hidden staff (`server-account/src/guilds.js`, `server-account/src/staffHidden.js`):** `viewOf` reads `COALESCE(players.played_at, players.last_seen)` as `seenAt` (updated by the 300-second `PLAY_BEAT_S` heartbeat in `src/net/playClock.js` and `src/net/heartbeat.js`). `guildMemberOnline` is true while `now - seenAt <= PLAY_GRACE_S` (`2 * PLAY_BEAT_S`), `guildOnlineText` formats the online count, and `guildSeenText` delegates to `lastOnlineText` (`src/net/social.js`). Hidden staff show `hiddenSince` as last-seen to all readers, including on their own `hidden` row.
