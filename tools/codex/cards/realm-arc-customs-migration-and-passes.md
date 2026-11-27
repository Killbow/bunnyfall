---
slug: realm-arc-customs-migration-and-passes
title: "Customs Migration, Wealth Allowance, Crossed Deeds, and Staff Passes"
domain: saves
kind: subcard
parent: realm-arc-overview
files:
  - src/saves/realmCustoms.js
  - src/net/realmGoldLaw.js
  - src/saves/realmSaves.js
  - server-account/src/realm.js
  - server-account/src/routes/storageRoutes.js
  - server-account/src/routes/worldRoutes.js
routes:
  - /v1/realm/customs
  - /v1/realm/undo
  - /v1/mod/customs-pass
tables:
  - realm_characters
  - realm_census
  - realm_passes
replacesBible:
  - "06-Systems/Realm-Arc.md"
related:
  - realm-arc-overview
  - realm-saves-and-mod-save-hooks
  - realm-arc-gold-law-empire-and-vendor-ceiling
invariants:
  - "A pre-realm character migrates once (`realmCustoms` -> `POST /v1/realm/customs`) when `realm_census` holds its trace or a staff pass in `realm_passes` is open; `realm_characters_origin` (player, origin_id) is unique."
  - "Liquid wealth is trimmed to `CUSTOMS_WEALTH_BASE` (20,000) + `CUSTOMS_WEALTH_PER_LEVEL` (10,000) per level, from stashed containers first; outstanding loans are called in."
  - "`crossDeeds` marks imported deeds so they cannot be sold back to Empire banks; `CUSTOMS_HOUSE_PRICE` (100,000) values a carried house."
  - "Homes, guild ties, and renown carry over through `customsCarry` on the service."
  - "A customs entry marks every `realm_census` row of its origin spent, on every account, in the same batch that writes the character, so a character copied to two accounts enters the realm once."
traps:
  - "A customs character whose first save never landed is undone (`undoCustoms` via `/v1/realm/undo`), not deleted, and its property is restored offline via `reclaimCustomsDeeds` and `reclaimFromDevice`."
  - "`grantCustomsPass` supports `revoke`; `realm_passes_open` is unique per player, so only one open pass exists at a time."
dfu: []
tags:
  - customs
  - migration
  - wealth-cap
  - deeds
  - staff
---

# Customs Migration, Wealth Allowance, Crossed Deeds, and Staff Passes

Customs migration (`src/saves/realmCustoms.js`, `server-account/src/realm.js`) imports eligible pre-realm offline characters into `realm_characters` once while trimming excess liquid wealth, crossing property deeds, and carrying over world ties.

## Census Eligibility, Staff Passes, and First-Save Guard

- **One-time admission (`server-account/src/routes/storageRoutes.js`, `server-account/src/routes/worldRoutes.js`):** `realmCustoms` submits a candidate save to `POST /v1/realm/customs`. Admission requires either a matching trace in `realm_census` or an open staff pass in `realm_passes` managed by `grantCustomsPass` (`POST /v1/mod/customs-pass`, which also supports `revoke` under the unique per-player `realm_passes_open` index). The unique `realm_characters_origin` `(player, origin_id)` index blocks repeat imports.
- **Validation and rollback (`src/saves/realmSaves.js`, `server-account/src/realm.js`):** `firstSaveRefusal` verifies the initial save for both customs imports and fresh births (capping fresh birth wealth at `REALM_BIRTH_WEALTH_MAX` = `10,000`). If a customs character's first save never lands, `undoCustoms` (`POST /v1/realm/undo`) rolls the migration back rather than deleting the character, and `reclaimCustomsDeeds` with `reclaimFromDevice` restores property offline.

## Wealth Allowance, Crossed Deeds, and Carried Ties

- **Loan settlement and gold cap (`src/saves/realmCustoms.js`, `src/net/realmGoldLaw.js`):** Before admission, outstanding bank loans are called in and liquid gold is trimmed to `CUSTOMS_WEALTH_BASE` (`20,000`) + `CUSTOMS_WEALTH_PER_LEVEL` (`10,000`) * level, drawing from stashed containers first.
- **Deeds and carried state:** `crossDeeds` flags imported ship and house deeds (valuing a carried house at `CUSTOMS_HOUSE_PRICE` = `100,000`) so Empire banks refuse resale, while `customsCarry` transfers homes, guild memberships, and renown.
