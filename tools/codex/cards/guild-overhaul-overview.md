---
slug: guild-overhaul-overview
title: "Guild Overhaul: Rename, Vault, Arms, and the Company Window"
domain: account
kind: overview
parent: null
files:
  - server-account/src/guilds.js
  - server-account/src/guildVault.js
  - src/net/guildLaw.js
  - src/net/guildVaultLaw.js
  - src/net/heraldryLaw.js
  - src/ui/socialPanel.js
  - server-account/migrations/0077_guild_overhaul.sql
routes:
  - /v1/guilds/mine
  - /v1/guilds/rename
  - /v1/guilds/vault
  - /v1/guilds/heraldry
tables:
  - guilds
  - guild_members
  - guild_renames
  - guild_vault
  - guild_vault_log
replacesBible:
  - "11-Multiplayer/Guild-Overhaul.md"
  - "11-Multiplayer/Company-Overhaul.md"
related:
  - guild-rename-and-name-filter
  - guild-item-vault-and-withdraw-grants
  - guild-heraldry-divisions-and-charges
  - guild-window-and-member-presence
  - homes-camps-guilds-and-territories
  - seats-arc-overview
invariants:
  - "Every guild mutation (rename, vault deposit, vault withdrawal, and vault permission grant) executes as a single D1 `db.batch` whose SQL `WHERE` guards re-verify membership, rank, and balances, rejecting the entire batch if any row moved."
  - "Migration `server-account/migrations/0077_guild_overhaul.sql` introduces `guild_renames`, `guild_vault`, `guild_vault_log`, `guilds.renamed_at`, and the `vault_level`, `vault_limit`, `vault_day`, and `vault_taken` columns on `guild_members`."
traps:
  - "Player-facing UI refers to a player guild as a 'Company' and opens a dedicated Company window rather than a tab inside the social panel, while code, routes, and D1 tables retain `guild*` identifiers."
dfu: []
tags:
  - guilds
  - company
  - account
  - overview
---

# Guild Overhaul: Rename, Vault, Arms, and the Company Window

Player guilds (displayed in the UI as Companies) support paid renames, an atomic shared item vault with per-member withdrawal grants, parted heraldry with charge colors, and a multi-page Company window with member online presence. Schema additions live in `server-account/migrations/0077_guild_overhaul.sql`, shared validation rules live in `src/net/guildLaw.js`, `src/net/guildVaultLaw.js`, and `src/net/heraldryLaw.js`, and account routes dispatch through `server-account/src/guilds.js` and `server-account/src/guildVault.js`.

- **Company state and member presence (`GET /v1/guilds/mine`):** `viewOf` in `server-account/src/guilds.js` assembles the guild state for the caller, including rank permissions, ledger entries, heraldry, and member roster with last-seen timestamps derived from play heartbeats (`guild-window-and-member-presence`).
- **Treasury rename (`POST /v1/guilds/rename`):** Guildmasters rename their guild and tag using treasury gold discounted by Adventurers Guild rank, subject to a 14-day cooldown, word filtering, and an active seat-battle lock (`guild-rename-and-name-filter`).
- **Shared item vault (`/v1/guilds/vault*`):** `server-account/src/guildVault.js` transfers eligible items between a saved realm character record and `guild_vault` in one atomic batch, enforcing rank defaults, per-member daily withdrawal quotas, and disband blocks (`guild-item-vault-and-withdraw-grants`).
- **Expanded heraldry (`POST /v1/guilds/heraldry`):** `src/net/heraldryLaw.js` expands arms to 40 devices, plain plus 7 parted field divisions, and distinct charge colors, burning Drakes from the guild treasury on changes after initial creation (`guild-heraldry-divisions-and-charges`).
