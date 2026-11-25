---
slug: selfhost-runtime-and-updater
title: Self-Host Runtime, Caddy Proxy, Updater, and Discord Bot
domain: selfhost
kind: overview
files:
  - selfhost/start.mjs
  - selfhost/Caddyfile
  - selfhost/updater.mjs
  - selfhost/discordSetup.mjs
  - selfhost/relay.toml
  - selfhost/accounts.toml
routes:
  - /v1/account
  - /v1/staff/me
related:
  - account-routes-and-gate-wall
  - identity-tokens-and-relay-seam
invariants:
  - "`selfhost/start.mjs` bundles and runs both `daggerfall-accounts` and `daggerfall-online` inside one `workerd` process via Miniflare, persisting state under `DATA/v3`."
  - "`selfhost/updater.mjs` never holds Docker or GitHub credentials; verified `POST /update` requests write `updates/update-requested` for the host cron (`selfhost/update.sh --if-requested`)."
  - "`selfhost/Caddyfile` uses `trusted_proxies_strict` to forward `CF-Connecting-IP` from `{client_ip}` and blocks `/accounts/__scheduled*` with 404."
traps:
  - Directly internet-facing Docker deployments must set `TRUSTED_PROXIES` to `127.0.0.1/32` instead of `private_ranges`, or Docker's userland proxy makes client-supplied headers look trusted.
  - "`selfhost/start.mjs` writes `DATA/keys.json` once via temp-file rename and generates `relay.vars` and `accounts.vars`; deleting `keys.json` invalidates active relay tokens and prompts clients to reconnect."
tags:
  - selfhost
  - caddy
  - miniflare
  - updater
  - discord
---

# Self-Host Runtime, Caddy Proxy, Updater, and Discord Bot

Bunnyfall self-hosting runs both Cloudflare Workers locally without a Cloudflare account, fronted by Caddy and paired with an out-of-band host updater and optional Discord bot.

- **Single-process Workers (`selfhost/start.mjs`):** `start.mjs` generates Ed25519 identity and gate keypairs atomically into `DATA/keys.json` (emitting `relay.vars` and `accounts.vars`), applies D1 migrations via `wrangler d1 migrations apply`, bundles `selfhost/accounts.toml` and `selfhost/relay.toml`, and runs `daggerfall-accounts` (port `8788`) and `daggerfall-online` (port `8787`) in one Miniflare `workerd` instance (`DATA/v3`). Minute (`* * * * *`) and hourly (`41 * * * *`) crons invoke `accountsFetcher.scheduled`.
- **Caddy reverse proxy (`selfhost/Caddyfile`):** Routes `/relay/*` to `8787`, `/updater/*` to `8789`, and `/v1/*` and `/accounts/*` to `8788`, injects `CF-Connecting-IP` using `trusted_proxies_strict`, returns 404 on `/accounts/__scheduled*`, redirects `/builder` to `/builder/editor.html`, sets `immutable` caching on existing `/assets/*`, and serves `/srv`.
- **Host updater (`selfhost/updater.mjs`):** `startUpdater` serves `GET /status` and `POST /update` (checking Bearer tokens via `GET /v1/account` against `OWNER_HANDLES`) plus `POST /discord` (checking `x-staff-session` via `POST /v1/staff/me`), with CORS enabled for `dagger://game`. `POST /update` writes `updates/update-requested` for the host cron.
- **Discord bot (`selfhost/discordSetup.mjs`):** `discordIntegrationKey` persists `DATA/discord-integration.key`, and `manageDiscord` forks `discord-bot/bot.mjs` from `DATA/discord-bot.json` using `discord-lfg.sqlite` and optional `ARENA2_PATH`.
