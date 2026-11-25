---
slug: chat-safety-block-list-and-conduct
title: "Player Block List and Code of Conduct Agreement"
domain: multiplayer
kind: subcard
parent: chat-safety-overview
files:
  - src/net/safety/safetyLaw.js
  - src/net/safety/conduct.js
  - server-account/src/safety.js
  - src/net/chat.js
  - src/net/social.js
  - src/net/chatSafetyHost.js
  - src/ui/conductCard.js
  - src/net/accountClient.js
routes:
  - /v1/safety/blocks
  - /v1/safety/block
  - /v1/safety/unblock
  - /v1/safety/conduct
tables:
  - blocks
  - players
replacesBible:
  - "11-Multiplayer/Chat-Safety-Arc.md"
related:
  - chat-safety-overview
  - chat-safety-reports-cases-and-auto-mute
invariants:
  - "`BLOCKS_MAX` (`200`) is enforced atomically in one `INSERT ... WHERE COUNT < BLOCKS_MAX` statement; blocking oneself returns `'block-self'`, and block or unblock calls share `BLOCK_RATE_MAX` (`60`) per `BLOCK_WINDOW_S` (`3600` s)."
  - "Blocked accounts receive no notification; `ChatLog.hears` and `SocialState.hears` filter messages on the client and silently drop friend requests, party invites, and notes from blocked accounts."
  - "Adding a block retroactively purges earlier chat lines via `ChatLog.forgetSpeaker` and prunes pending social requests and invites."
  - "`agreeConduct` rejects submissions with `'conduct-stale'` unless the version matches `CONDUCT_VERSION`, persists the agreed version in `players.conduct_v`, and echoes it as `conduct` when minting identity tokens."
traps:
  - "`CONDUCT_VERSION` is a date string; bump it only for substantive rule changes because every player must re-agree before sending their next chat line."
  - "An agreed browser session retains its local agreement until reload, so a mid-session `CONDUCT_VERSION` bump prompts the player on their next page load."
dfu: []
tags:
  - block-list
  - conduct
  - chat
  - social
---

Account-backed block lists and code-of-conduct agreements live in `src/net/safety/safetyLaw.js`, `src/net/safety/conduct.js`, and `server-account/src/safety.js`, wired into the client by `src/net/chatSafetyHost.js` and `src/net/accountClient.js`.

## Server-Stored Block List

The `blocks` table (primary key `(player, blocked)` with `ON DELETE CASCADE`) persists across devices via `/v1/safety/blocks`, `/v1/safety/block`, and `/v1/safety/unblock`. `server-account/src/safety.js` rejects self-blocks with `'block-self'`, enforces `BLOCKS_MAX` (`200`) inside a single conditional `INSERT` statement, and meters block and unblock mutations together at `BLOCK_RATE_MAX` (`60`) per `BLOCK_WINDOW_S` (`3600` seconds).

Blocking is silent to the target. On the client, `src/net/chatSafetyHost.js` wires `ChatLog.hears` (`src/net/chat.js`) and `SocialState.hears` (`src/net/social.js`) to drop incoming chat lines, friend requests, party invites, and notes from blocked accounts. Recording a new block immediately runs `ChatLog.forgetSpeaker` to erase lines already on screen and strips pending social invites.

## Code of Conduct Gate

`src/net/chatSafetyHost.js` intercepts outgoing chat lines until the player accepts the active `CONDUCT_VERSION` in `src/ui/conductCard.js` (populated by `conductRules()` under localization keys), keeping the unsent draft in the input field. `POST /v1/safety/conduct` (`agreeConduct`) refuses mismatched versions with `'conduct-stale'`, writes `players.conduct_v`, and includes `conduct` on minted tokens.
