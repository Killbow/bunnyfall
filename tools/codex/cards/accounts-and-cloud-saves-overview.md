---
slug: accounts-and-cloud-saves-overview
title: "Accounts and Cloud Saves Overview"
domain: account
kind: overview
parent: null
files:
  - server-account/src/index.js
  - server-account/src/service.js
  - server-account/src/accounts.js
  - src/net/accountClient.js
  - src/net/online.js
  - server/src/message/entry.js
  - selfhost/upstream-ci/workflows/account-deploy.yml
routes:
  - /v1/health
  - /v1/pubkey
  - /v1/auth/guest
  - /v1/auth/register
  - /v1/auth/login
  - /v1/auth/recover
  - /v1/auth/token
  - /v1/auth/session
  - /v1/account
tables:
  - players
  - sessions
  - rate_limits
  - saves
  - d1_migrations
replacesBible:
  - "06-Systems/Accounts-And-Cloud-Saves-Arc.md"
related:
  - account-routes-and-gate-wall
  - identity-tokens-and-relay-seam
  - account-guest-names-and-handles
  - account-passwords-recovery-codes-and-rate-limits
  - cloud-saves-r2-backups-and-save-tiles
  - account-titles-glyphs-and-play-clock
  - realm-saves-and-mod-save-hooks
invariants:
  - "Account and save deploys ship in `server-account/` so they never restart relay Durable Objects in `server/`."
  - "Guests are real `players` rows from first contact and upgrade in place on `/v1/auth/register`."
  - "`_named` in `server/src/message/entry.js` refuses frames without `tok` ('sign in to play online') and fails closed when `IDENTITY_PUBLIC_KEY` will not import."
  - "Local saves stay authoritative; cloud saves are backup and transfer only, never an automatic overwrite."
traps:
  - "Only `AdmitGate` and `default` may be exported from `server-account/src/index.js`; any other named value export fails workerd boot."
  - "`account-deploy.yml` applies migrations, then deploys, then mints secrets; `wrangler secret list` errors before a Worker first deploys."
dfu: []
tags:
  - account
  - accounts
  - cloud-saves
  - auth
  - d1
  - r2
---

# Accounts and Cloud Saves Overview

The account and cloud save stack runs inside the standalone `server-account/` Worker backed by D1 (`players`, `sessions`, `rate_limits`, `saves`, and `d1_migrations`) and R2, keeping persistence deploys isolated from live relay Durable Objects in `server/`.

- **Guest and linked lifecycle:** First contact at `/v1/auth/guest` creates a real `players` row and device session (`server-account/src/accounts.js`). `/v1/auth/register` upgrades that guest row in place without losing history, while `/v1/auth/login`, `/v1/auth/recover`, `/v1/auth/session`, `/v1/account`, and `/v1/auth/logout` manage credential sign-in, recovery, profile state, and current-device sign-out.
- **Client session handling:** `src/net/accountClient.js` coordinates tokens and sessions. `adoptIdentity` updates stored and live sessions when an account state changes, but never creates a session after sign-out.
- **Mandatory relay tokens:** `/v1/auth/token` mints Ed25519 identity tokens verified against `/v1/pubkey` and `IDENTITY_PUBLIC_KEY`. In `src/net/online.js`, `TOKEN_WAIT_MS` is 8000 (raised from 2.5 seconds after tokens became mandatory). In `server/src/message/entry.js`, `_named` refuses frames lacking `tok` (`'sign in to play online'`) and fails closed if `IDENTITY_PUBLIC_KEY` fails to import. Relay replay protection caps spent signatures at `SPENT_MAX` (4096) in `server/src/room/holds.js`.
- **Cloud backups and deploy pipeline:** Local saves remain authoritative while R2 stores explicit backups and transfers. In `selfhost/upstream-ci/workflows/account-deploy.yml`, CI applies D1 migrations first, deploys the Worker second, and mints secrets third so `wrangler secret list` never runs before initial Worker creation.
