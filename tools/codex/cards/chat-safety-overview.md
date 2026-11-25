---
slug: chat-safety-overview
title: "Chat Safety: Blocks, Witnessed Reports, Sanctions, and Discord Queue"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/safety/safetyLaw.js
  - src/net/safety/chatStamp.js
  - src/net/safety/conduct.js
  - server-account/src/safety.js
  - server-account/src/sanctions.js
  - server-account/src/safetyClock.js
  - server-account/src/discord.js
  - src/net/chatSafetyHost.js
  - server-account/migrations/0126_chat_safety.sql
  - server-account/migrations/0206_no_automatic_cases.sql
routes:
  - /v1/safety/report
  - /v1/safety/block
  - /v1/mod/cases
  - /v1/discord/interactions
tables:
  - blocks
  - mod_cases
  - mod_reports
  - mod_case_lines
  - mod_actions
  - players
replacesBible:
  - "11-Multiplayer/Chat-Safety-Arc.md"
related:
  - chat-safety-block-list-and-conduct
  - chat-safety-relay-stamps-and-new-voice-pace
  - chat-safety-reports-cases-and-auto-mute
  - chat-safety-sanctions-bans-and-discord
  - identity-tokens-and-relay-seam
  - room-engine-and-hub-sharding
invariants:
  - "Moderation cases open only from player reports and spawn-grant counts; migration `0206_no_automatic_cases.sql` removed the public-chat feed and automatic case review, so human moderators review every chat case."
  - "`src/net/safety/safetyLaw.js` grants no client authority; `server-account` verifies `MODERATOR_HANDLES` and `DEVELOPER_HANDLES` through `canModerate` in `server-account/src/titles.js`."
  - "Every mute, unmute, ban, unban, and dismissal appends a permanent audit row to `mod_actions`."
traps:
  - "Do not reintroduce `modAi.js` or `mod_feed` ingestion; only human-reviewed moderation flows remain active."
  - "`mod_cases` retains legacy `ai_*` columns and the `'review'` source value from migration `0126_chat_safety.sql`, and `openCaseFor` always writes `ai_state` as `'off'`."
dfu: []
tags:
  - chat
  - safety
  - moderation
  - reports
  - bans
  - discord
---

Chat safety links client-side blocking, relay-signed chat lines, witnessed report cases, a graduated sanction ladder, and a Discord moderation queue across `src/net/safety/`, `server/`, and `server-account/`.

## Architecture and Authority

- **Shared bounds (`src/net/safety/`):** `safetyLaw.js`, `chatStamp.js`, and `conduct.js` define request shapes, Ed25519 stamp formatting, and code-of-conduct versions shared by client, relay, and account service. The client shapes requests and filters local views in `src/net/chatSafetyHost.js`, while `server-account/src/safety.js` and `server-account/src/sanctions.js` enforce authority via `canModerate` (`MODERATOR_HANDLES` and `DEVELOPER_HANDLES`).
- **Human-only case pipeline:** Every chat case in `mod_cases` originates from witnessed player reports (`POST /v1/safety/report`) accompanied by relay-stamped lines in `mod_case_lines` and reporter notes in `mod_reports`. Migration `0206_no_automatic_cases.sql` retired automatic chat-feed cases and sets `ai_state` to `'off'` on every new case created by `openCaseFor`.
- **Clocks and enforcement (`server-account/src/cron.js`):** The per-minute `'safety'` job (`server-account/src/safetyClock.js`) posts open case cards to Discord (`server-account/src/discord.js`), where moderators act through `POST /v1/discord/interactions` or `/v1/mod/cases`. The hourly `'safety-sweep'` job expires stale cases and redacts aged chat lines. Signed mute and ban orders cross to the relay to silence or disconnect sanctioned accounts.

## Subcards

- `chat-safety-block-list-and-conduct`: server-stored `blocks` table, client-side filtering, and `CONDUCT_VERSION` gating.
- `chat-safety-relay-stamps-and-new-voice-pace`: `chat-stamp1` Ed25519 signatures and `NEW_VOICE_GAP_MS` pacing.
- `chat-safety-reports-cases-and-auto-mute`: report intake, `mod_cases_open` aggregation, credible-reporter auto-mute, and `safetySweep`.
- `chat-safety-sanctions-bans-and-discord`: `LADDER_MIN` strikes, relay ban enforcement, and `/mod` Discord interactions.
