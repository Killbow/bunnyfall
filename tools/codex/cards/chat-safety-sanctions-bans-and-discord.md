---
slug: chat-safety-sanctions-bans-and-discord
title: "Moderation Record, Sanction Ladder, Bans, and Discord Queue"
domain: multiplayer
kind: subcard
parent: chat-safety-overview
files:
  - server-account/src/sanctions.js
  - server-account/src/safety.js
  - server-account/src/discord.js
  - server-account/src/discordCommands.js
  - server-account/src/safetyClock.js
  - server-account/src/titles.js
  - src/net/safety/safetyLaw.js
  - src/net/identityToken.js
  - src/net/wire.js
  - src/net/online.js
  - server/src/index.js
  - selfhost/accounts.toml
  - server-account/migrations/0164_staff_banned.sql
routes:
  - /v1/mod/mute
  - /v1/mod/ban
  - /v1/mod/unban
  - /v1/mod/strikes
  - /v1/mod/cases
  - /v1/mod/case
  - /v1/mod/dismiss
  - /v1/discord/interactions
  - /v1/law
tables:
  - mod_actions
  - mod_cases
  - players
replacesBible:
  - "11-Multiplayer/Chat-Safety-Arc.md"
related:
  - chat-safety-overview
  - chat-safety-reports-cases-and-auto-mute
  - identity-tokens-and-relay-seam
  - spawn-grants-measure-and-moderation
invariants:
  - "A strike is any non-voided mute or ban in `mod_actions` within `STRIKE_WINDOW_S` (`90` days); `LADDER_MIN` steps through `30`, `1440`, and `10080` minutes, and at `LADDER_BAN_AT` (`3`) strikes the next moderator action is a ban decision."
  - "Accounts satisfying `canModerate` (`server-account/src/titles.js`, checked by `autoMutable`) cannot be muted or banned automatically or manually."
  - "Dismissing a case sets `void_at` on its automatic mutes and lifts any active automatic mute through `voidAutoMutes`."
  - "Banning writes `players.banned_until` (`BAN_FOREVER` or `1` to `BAN_DAYS_MAX` `365` days, default `30`), blocks token minting with `'banned'`, and pushes a `mintBanOrder` order so rooms close sockets with `CLOSE_POLICY` (`1008`) and reject reconnects via `_bannedHello` and persisted room `bans`."
  - "Relay ban frames are sent only when `relaySupportsBan` confirms `BAN_RELAY_MIN` or newer, because older relays close on unknown frames."
  - "`POST /v1/discord/interactions` verifies raw request bytes with `discordSigned` against `DISCORD_PUBLIC_KEY` and permits actions only from `DISCORD_MODERATORS` `id:handle` pairs that pass `canModerate`."
traps:
  - "Discord button interactions must respond within three seconds and defer the relay `pushLaw` call to `waitUntil`, while the minute clock redraws case cards."
  - "Sanction buttons never shorten an existing longer mute or ban, and `/mod` resolves targets by account ID before matching by handle."
  - "Service sanctions push to `RELAY_LAW_URL` (`SAFE_LAW_PATH` `'/v1/law'`); if a push fails, the sanction takes effect on the player's next token refresh or room connection."
dfu: []
tags:
  - sanctions
  - bans
  - ladder
  - discord
  - audit
---

`server-account/src/sanctions.js`, `server-account/src/safety.js`, and `server-account/src/discord.js` record moderation actions, push signed orders to the relay, and run the Discord moderation queue.

## Sanction Ladder and Relay Enforcement

Every decision writes an `ACTION_KINDS` row (`mute`, `unmute`, `ban`, `unban`, or `dismiss`) to `mod_actions`, attributing automatic mutes to `AUTO_ACTORS` (`'auto:reports'` live, `'auto:review'` legacy). Non-voided mutes and bans within `STRIKE_WINDOW_S` (`90` days) advance `LADDER_MIN` (`[30, 1440, 10080]` minutes); at `LADDER_BAN_AT` (`3`) strikes, the next step is a moderator ban. Moderators and developers (`canModerate`, checked by `autoMutable`) cannot be muted or banned. Dismissing a case (`/v1/mod/dismiss`) stamps `void_at` and runs `voidAutoMutes` to lift any active automatic mute.

Bans set `players.banned_until` (`BAN_FOREVER`, or `1` to `BAN_DAYS_MAX` `365` days, default `30`; migration `0164_staff_banned.sql`). Banned accounts receive `'banned'` on token requests, and `pushLaw` posts `mintBanOrder` (`src/net/identityToken.js`) to `RELAY_LAW_URL` (`SAFE_LAW_PATH` `'/v1/law'`). Relays at or above `BAN_RELAY_MIN` (`relaySupportsBan` in `src/net/wire.js`) close sockets with `CLOSE_POLICY` (`1008`) and refuse handshakes via `_bannedHello` and persisted room `bans` (`server/src/index.js`).

## Discord Queue and Staff Routes

Each minute, `postCards` (`server-account/src/safetyClock.js`) posts up to `POSTS_MAX` (`5`) open cases (most credible reporters first) to `DISCORD_MOD_CHANNEL` with `DISCORD_BOT_TOKEN` after checking `MOD_CHANNEL_NEEDS`. `POST /v1/discord/interactions` checks `discordSigned` against `DISCORD_PUBLIC_KEY` and maps the caller via `DISCORD_MODERATORS` (`id:handle` with `canModerate`). Button presses lock a case for `CASE_CLAIM_S` (`60` s), record one sanction via `act_click`, and answer within three seconds while `waitUntil` pushes the relay order. `DISCORD_COMMANDS` (`server-account/src/discordCommands.js`, synced on deploy by `tools/discordModCommands.mjs`) registers `/mod` (`lookup`, `mute`, `unmute`, `ban`, and `unban`, resolving ID before handle) alongside `/v1/mod/mute`, `/v1/mod/ban`, `/v1/mod/unban`, `/v1/mod/strikes`, `/v1/mod/cases`, and `/v1/mod/case`.
