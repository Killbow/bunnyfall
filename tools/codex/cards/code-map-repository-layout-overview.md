---
slug: "code-map-repository-layout-overview"
title: "Code Map: Repository Layout"
domain: "overview"
kind: "overview"
parent: null
files:
  - "src/main.js"
  - "src/buildTag.js"
  - "vite.config.js"
  - "server/src/index.js"
  - "server/wrangler.toml"
  - "server-account/src/index.js"
  - "server-account/wrangler.toml"
  - "app/main.cjs"
  - "app/preload.cjs"
  - "selfhost/README.md"
routes: []
tables: []
replacesBible:
  - "01-Overview/Code-Map.md"
related:
  - "code-map-src-layers-and-feature-folders"
  - "code-map-relay-bundle-and-move-ledger"
  - "home-port-doctrine-overview"
  - "four-hosts-and-modal-frame"
  - "scene-router-and-boot-doors"
invariants:
  - "The browser client lives in src/ with src/main.js as the Vite entry router."
  - "The relay is a Cloudflare Worker (server/wrangler.toml main src/index.js) exporting Durable Object class Room from server/src/index.js."
  - "The account service is a Cloudflare Worker (server-account/wrangler.toml main src/index.js) bound to D1 with migrations_dir migrations."
  - "server/ and server-account/ import game law from src/ (mostly src/net/) and import no src/ui/ module."
traps:
  - "server-account/src files mention src/ui paths in comments only; adding a real src/ui import pulls DOM code into a worker bundle."
dfu: []
tags:
  - "code-map"
  - "layout"
  - "repository"
  - "architecture"
---

# Code Map: Repository Layout

The repository separates the browser client, Cloudflare Worker services, desktop wrapper, and operations scripts into top-level directories while sharing deterministic game rules directly from `src/`.

## Root Directories and Entry Points

- **Browser client (`src/` and `vite.config.js`):** `src/main.js` is the Vite entry router (`scene-router-and-boot-doors`). Prototype and lab pages (`sky.html`, `ketch.html`, and `viewer.html`) sit at the repository root beside `index.html`. During builds, `scripts/buildTag.mjs` rewrites `src/buildTag.js` on prebuild and restores it via `git checkout` on postbuild.
- **Multiplayer relay (`server/`):** Configured by `server/wrangler.toml` (`main = "src/index.js"`), `server/src/index.js` exports the `Room` Durable Object class.
- **Account service (`server-account/`):** Configured by `server-account/wrangler.toml` (`main = "src/index.js"`), `server-account/src/index.js` serves accounts, guilds, boards, and ladders against Cloudflare D1 using ordered SQL files in `server-account/migrations/` starting at `0001_accounts.sql`.
- **Desktop, self-hosting, and tooling:** `app/` holds the Electron shell (`main.cjs`, `preload.cjs`, `launcherPreload.cjs`, and `afterPack.cjs`), `selfhost/` packages Docker, Caddy, nginx, `relay.toml`, and `accounts.toml`, and `tools/`, `scripts/`, `docs/`, and `discord-bot/` hold build, verification, and auxiliary scripts.

## Worker Import Boundary

Both `server/` and `server-account/` import shared game law from `src/` (around 780 import lines reach `src/net/`, with a few dozen reaching `src/items/`, `src/poi/`, `src/characters/`, `src/world/`, and `src/guilds/`). Neither worker imports any `src/ui/` module; `server-account/src` files mention `src/ui/` paths in comments only, because a real import would pull browser DOM dependencies into the worker bundle.
