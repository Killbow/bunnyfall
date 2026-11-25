---
slug: account-titles-glyphs-and-play-clock
title: "Derived Titles, Glyphs, and the Server Play Clock"
domain: account
kind: subcard
parent: accounts-and-cloud-saves-overview
files:
  - server-account/src/titles.js
  - server-account/src/founderLink.js
  - server-account/src/routes/mailRoutes.js
  - server-account/migrations/0004_titles.sql
  - server-account/migrations/0005_played.sql
  - server-account/migrations/0068_glyphs_off.sql
  - src/net/playClock.js
  - src/ui/playerBadge.js
  - src/ui/profileBadge.js
routes:
  - /v1/account/title
  - /v1/account/glyph
  - /v1/account/played
  - /v1/heartbeat
tables:
  - players
replacesBible:
  - "06-Systems/Accounts-And-Cloud-Saves-Arc.md"
related:
  - accounts-and-cloud-saves-overview
  - identity-tokens-and-relay-seam
  - chat-safety-sanctions-bans-and-discord
  - wardrobe-appearances-overview
invariants:
  - "Titles and glyphs derive at mint and read from timestamps and config handle lists (`FOUNDER_HANDLES`, `TIER_LISTS`); only the worn `title` choice is stored."
  - "Hiding glyphs (`players.glyphs_off`, `glyphsHidden`/`glyphsShown`) changes paint only; permission checks read the full verified glyph list."
  - "Play time is credited by the server clock from empty beats every `PLAY_BEAT_S` (300 s), with gaps capped at `PLAY_GRACE_S` (600 s)."
traps:
  - "`canModerate` is `isModerator || isDeveloper`; `MOD_TIERS` (`shadowfang`) grants moderation without the shield glyph."
  - "Founder eligibility uses `FOUNDER_UNTIL` and `firstPlayed`, linked via `linkFirstPlay`, not a stored grant flag."
dfu: []
tags:
  - titles
  - glyphs
  - play-time
  - profile
  - account
---

# Derived Titles, Glyphs, and the Server Play Clock

Account titles, badge glyphs, and server-credited play time derive from `players` timestamps and configuration lists in `server-account/src/titles.js`, `server-account/src/founderLink.js`, and `server-account/src/routes/mailRoutes.js`.

- **Derived titles and founder linking:** Entitlements compute dynamically at token mint and profile read from account timestamps and config handle lists (`FOUNDER_HANDLES` and `TIER_LISTS`), while `players.title` (`0004_titles.sql`, updated via `/v1/account/title`) stores only the currently worn choice. Founder eligibility checks `FOUNDER_UNTIL` and `firstPlayed` linked via `linkFirstPlay` (`server-account/src/founderLink.js`), never a static grant column.
- **Glyph visibility and moderation authority:** Players toggle badge display via `/v1/account/glyph` (`players.glyphs_off` in `0068_glyphs_off.sql`, read by `glyphsHidden` and `glyphsShown` in `src/ui/playerBadge.js` and `src/ui/profileBadge.js`). Hiding glyphs affects UI rendering only; authority checks inspect the full verified glyph list. `canModerate` evaluates `isModerator || isDeveloper`, and `MOD_TIERS` (`shadowfang`) grants moderator power even without a shield glyph. Moderation caps mute length at `MUTE_MAX_MIN` (one week in `src/net/moderation.js`) and throttles commands to `MUTE_HZ_MAX` and `RED_HZ_MAX` (1 in `src/net/wire.js`). Live badge and name updates throttle `rehello` by `REHELLO_GAP_MS` (3000 ms in `src/net/online.js`).
- **Server play clock:** `src/net/playClock.js` sends empty beats every `PLAY_BEAT_S` (300 seconds) to `/v1/account/played` and `/v1/heartbeat` (`server-account/src/routes/mailRoutes.js`), advancing `players.played_s` and `played_at` (`0005_played.sql`) by the server clock with elapsed gaps capped at `PLAY_GRACE_S` (600 seconds).
