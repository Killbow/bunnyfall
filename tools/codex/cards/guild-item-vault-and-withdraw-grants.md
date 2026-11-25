---
slug: guild-item-vault-and-withdraw-grants
title: "Guild Item Vault: Slots, Atomic Put/Take, and Rank Withdraw Grants"
domain: account
kind: subcard
parent: guild-overhaul-overview
files:
  - server-account/src/guildVault.js
  - src/net/guildVaultLaw.js
  - src/net/guildPowers.js
  - server-account/src/realm.js
  - src/net/realmTradeLaw.js
  - src/saves/realmSaves.js
  - src/net/guildBook.js
  - src/ui/socialPanel.js
  - server-account/src/guilds.js
routes:
  - /v1/guilds/vault
  - /v1/guilds/vault/put
  - /v1/guilds/vault/take
  - /v1/guilds/vault/grant
  - /v1/guilds/disband
tables:
  - guild_vault
  - guild_vault_log
  - guild_members
  - homes
replacesBible:
  - "11-Multiplayer/Guild-Overhaul.md"
related:
  - guild-overhaul-overview
  - economy-ledger-and-item-judge
  - homes-camps-guilds-and-territories
invariants:
  - "Vault capacity equals `guildVaultSlots(hasHall)` (`GUILD_VAULT_SLOTS = 50` plus `GUILD_VAULT_HALL_SLOTS = 50` while the guild owns a `homes` row), evaluated in SQL via `SHELVES_SQL`."
  - "`vaultPut` removes the item from the depositor realm record (`prepareRealmRecord` and `takeTradeGoods`) and inserts the `guild_vault` slot in one D1 batch, while `vaultTake` restores it via `giveTradeGoods`; an item never exists in both places or neither."
  - "`takeTradeGoods` rejects equipped, quest, summoned, bound, gold, boat-held, and Materials Bag items."
  - "`VAULT_RANK_DEFAULTS` grants the guildmaster `withdraw` with limit `0` (unlimited), officers `withdraw` with limit `10`, and members or recruits `deposit`; grants cannot target the guildmaster."
  - "Daily withdrawal counts track per UTC day in `guild_members.vault_day` and `vault_taken` inside the withdrawal batch, rejecting any take that exceeds the member limit."
  - "Guild disband (`/v1/guilds/disband`) and lone-guildmaster departure fail with `guild-vault` while any `guild_vault` row exists."
traps:
  - "`vaultTake` matches `slot`, its `at` timestamp, and the stored item record; if a slot is refilled within the same second, a stale take is rejected."
  - "On deposit, the client advances its local realm sequence via `realmGoldAct`; on withdrawal, the request sets `needsAnswer` so a dropped response terminates the session and forces a fresh character load on rejoin."
  - "If a guild sells its hall while holding more than 50 items, withdrawals remain available in all slots, but new deposits are rejected until fewer than 50 items remain."
  - "A `withdraw` grant without an explicit limit defaults to `VAULT_GRANT_LIMIT` (`10`, capped at `VAULT_LIMIT_MAX = 100`), and town-proximity checks (`GUILD_VAULT_REACH_TEXT` and `reachNow()`) run client-side in `src/ui/socialPanel.js`."
dfu: []
tags:
  - guilds
  - vault
  - items
  - permissions
  - atomic-batch
---

# Guild Item Vault: Slots, Atomic Put/Take, and Rank Withdraw Grants

`server-account/src/guildVault.js` and `src/net/guildVaultLaw.js` back the shared item vault (`guild_vault` and `guild_vault_log`), coupling slot transfers to the authoritative R2 and D1 realm character record (`server-account/src/realm.js`, `src/net/realmTradeLaw.js`).

- **Capacity and hall bonus:** `guildVaultSlots(hasHall)` grants `GUILD_VAULT_SLOTS` (`50`) base slots plus `GUILD_VAULT_HALL_SLOTS` (`50`) bonus slots while the guild owns a `homes` hall (verified inside the batch via `SHELVES_SQL`). Selling a hall with over 50 stored items keeps withdrawals open while blocking deposits until fewer than 50 remain. Non-empty vaults block `/v1/guilds/disband` and lone-guildmaster departure (`guild-vault` in `server-account/src/guilds.js`).
- **Atomic deposits and withdrawals (`POST /v1/guilds/vault/put`, `POST /v1/guilds/vault/take`):** `vaultPut` runs `prepareRealmRecord` and `takeTradeGoods` (refusing equipped, quest, summoned, bound, gold, boat-stored, and Materials Bag items), then writes the character sequence, `guild_vault` slot, and `guild_vault_log` row in one `db.batch`. `vaultTake` matches `slot`, `at`, and `record`, restores the item via `giveTradeGoods`, and increments `guild_members.vault_taken` for the UTC `vault_day`. In `src/saves/realmSaves.js`, deposits advance sequence state via `realmGoldAct`, while withdrawals set `needsAnswer` so a lost response ends the session and reloads the character on rejoin.
- **Permissions and log (`POST /v1/guilds/vault/grant`, `GET /v1/guilds/vault`):** `VAULT_LEVELS` (`'none'`, `'deposit'`, `'withdraw'`) and `VAULT_LIMIT_CHOICES` (`[1, 3, 5, 10, 25, 0]`, default `VAULT_GRANT_LIMIT = 10`, cap `VAULT_LIMIT_MAX = 100`) override `VAULT_RANK_DEFAULTS` (`src/net/guildPowers.js`, `src/net/guildBook.js`). `vaultOf` returns the slots and `GUILD_VAULT_LOG_SHOWN` (`40`) log rows.
