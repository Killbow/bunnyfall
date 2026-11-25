---
slug: account-guest-names-and-handles
title: "Guest Names, Handles, and Display Names"
domain: account
kind: subcard
parent: accounts-and-cloud-saves-overview
files:
  - server-account/src/guestName.js
  - src/net/handleShape.js
  - src/net/wire.js
  - src/net/identityToken.js
  - server-account/src/accounts.js
  - server-account/migrations/0001_accounts.sql
routes:
  - /v1/auth/guest
  - /v1/auth/register
  - /v1/account/name
tables:
  - players
replacesBible:
  - "06-Systems/Accounts-And-Cloud-Saves-Arc.md"
related:
  - accounts-and-cloud-saves-overview
  - identity-tokens-and-relay-seam
  - chat-safety-block-list-and-conduct
invariants:
  - "`GUEST_NAME_RE` (`/^\\S+ \\S+$/`) always holds one space; `HANDLE_RE` forbids whitespace, so guest names cannot collide with chosen handles."
  - "`GUEST_NAME_RE` and `HANDLE_RE` live in `src/net/handleShape.js` so imports flow one way from `src/` into `server-account/`."
  - "`players.handle_lc` carries a partial UNIQUE index (`idx_players_handle_lc`)."
  - "`nameIsIssuable` requires `sanitizeName(name) === name`; tokens refuse rather than repair names."
traps:
  - "Daggerfall name banks can produce 25-char names; `guestName` rejects draws over `NAME_MAX` (24, `src/net/wire.js`), which cannot be raised without invalidating issued names."
  - "New handles containing `@` are refused (`handleLooksLikeEmail`); legacy email handles fall back to the guest name for display."
dfu: []
tags:
  - account
  - names
  - guests
  - handles
---

# Guest Names, Handles, and Display Names

Guest name generation (`server-account/src/guestName.js`), handle validation (`src/net/handleShape.js`), and display-name selection (`server-account/src/accounts.js`) partition generated names from registered handles while enforcing strict wire length caps (`src/net/wire.js`).

- **Disjoint shapes and one-way imports:** `src/net/handleShape.js` defines `GUEST_NAME_RE` (`/^\\S+ \\S+$/`, always containing one space) and `HANDLE_RE` (no whitespace), ensuring imports flow one way from `src/` into `server-account/` and guest names never collide with handles. In `server-account/migrations/0001_accounts.sql`, `players.handle_lc` enforces case-folded handle uniqueness via the partial index `idx_players_handle_lc`.
- **Length caps and email guards:** `guestName` draws from Daggerfall name banks and rejects any combination exceeding `NAME_MAX` (24 in `src/net/wire.js`). Two guests may share a generated name, so moderation resolves targets by relay `sub` rather than display name. Registration at `/v1/auth/register` refuses new handles containing `@` (`handleLooksLikeEmail`), and legacy email handles fall back to the account guest name for display.
- **Display mode and token issuance:** `NAME_AS` is `['account', 'character']`, and client calls to `chooseNameAs` post to `/v1/account/name`. On the server, `wornNameOf` and `wornNameRefusal` (`server-account/src/accounts.js`) govern character-name display and fallback rules. Before minting an identity token (`src/net/identityToken.js`), `nameIsIssuable` verifies `sanitizeName(name) === name` so invalid names are refused outright rather than silently repaired.
