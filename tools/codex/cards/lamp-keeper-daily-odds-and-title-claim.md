---
slug: lamp-keeper-daily-odds-and-title-claim
title: "Lamp Keeper Daily Odds and Title Claim"
domain: account
kind: subcard
parent: zone-respawn-hold-monument-and-honor-banners-overview
files:
  - src/world/lampKeeper.js
  - src/world/eliteGates/pseudoArchives.js
  - src/scenes/interiorContext.js
  - src/net/accountClient.js
  - server-account/src/lamp.js
  - server-account/src/titles.js
  - server-account/src/index.js
  - server-account/src/service.js
  - server-account/src/routes/playRoutes.js
  - server-account/migrations/0113_lamp_title.sql
  - src/net/identityToken.js
  - src/ui/playerBadge.js
routes:
  - /v1/lamp/claim
tables:
  - players
replacesBible:
  - "01-Overview/handoffs/Five-Asks-2026-10-14.md"
related:
  - zone-respawn-hold-monument-and-honor-banners-overview
  - account-titles-glyphs-and-play-clock
  - market-vendors-and-professions
invariants:
  - "LAMP_KEEPER_ODDS = 25: each shop keeper has a 1-in-25 daily chance, seeded by isLampKeeper."
  - "LAMP_ARCHIVE = 38232 (classic 197_6 texture)."
  - "The claim runs UPDATE players SET lamp_title = 1 WHERE lamp_title = 0, so the title is granted once and kept."
  - "`/v1/lamp/claim` must stay registered in `service.js` `ROUTES` so claims do not return 404."
  - "Deploy the relay whose token TITLES knows the lamp title before the account service that issues it."
traps:
  - "Claims are trusted from the signed-in account and not verified by the relay."
  - "The I Love Lamp text is fixed English in playerBadge.js."
dfu: []
tags:
  - lamp-keeper
  - titles
  - account
---

# Lamp Keeper Daily Odds and Title Claim

Shop interiors (`src/world/lampKeeper.js`, `src/world/eliteGates/pseudoArchives.js`, and `src/scenes/interiorContext.js`) roll a daily deterministic chance to replace a merchant flat with a lamp archive that grants the permanent `I Love Lamp` account title through `/v1/lamp/claim`.

## Daily Lamp Roll and Pseudo-Archive Flat

In `src/world/lampKeeper.js` and `src/scenes/interiorContext.js`, `isLampKeeper` seeds a deterministic daily check at `LAMP_KEEPER_ODDS = 25`, giving each eligible shopkeeper a 1-in-25 daily chance to appear as a lamp. When triggered, `src/world/eliteGates/pseudoArchives.js` substitutes `LAMP_ARCHIVE = 38232`, backed by the classic `197_6` lamp texture.

## Title Claim Route, Persistence, and Deploy Order

Interacting with the lamp keeper sends `POST /v1/lamp/claim` (`src/net/accountClient.js`, `server-account/src/routes/playRoutes.js`, `server-account/src/index.js`, and `server-account/src/service.js`, where `/v1/lamp/claim` must stay registered in `ROUTES` to avoid a 404). The account service trusts the signed-in account without relay verification (`server-account/src/lamp.js` and `server-account/migrations/0113_lamp_title.sql`), running `UPDATE players SET lamp_title = 1 WHERE lamp_title = 0` or returning `why` as `'held'` or `'guest'`. When `lamp_title === 1`, `server-account/src/titles.js` pushes `LAMP_TITLE` into the identity token (`TITLES` in `src/net/identityToken.js`), rendered as fixed English `I Love Lamp` in `src/ui/playerBadge.js`. Deploy the relay whose `TITLES` list recognizes `LAMP_TITLE` before the account service that issues it.
