---
slug: realm-arc-overview
title: "Realm Arc: Offline/Online Character Split and Online Power Law"
domain: saves
kind: overview
parent: null
files:
  - src/platform/onlineLane.js
  - src/mods/modSettings.js
  - src/saves/realmSaves.js
  - src/saves/offlineCopy.js
  - src/saves/realmCopyMark.js
  - src/world/worldSaveLoad.js
  - src/items/itemBound.js
  - server-account/src/realm.js
routes:
  - /v1/realm
  - /v1/realm/customs
tables:
  - realm_characters
replacesBible:
  - "06-Systems/Realm-Arc.md"
related:
  - realm-saves-and-mod-save-hooks
  - economy-ledger-and-item-judge
  - realm-arc-rescue-saves-and-stranded-copies
  - realm-arc-customs-migration-and-passes
  - realm-arc-gold-law-empire-and-vendor-ceiling
  - realm-arc-service-transactions-and-escrow
invariants:
  - "Offline saves stay local and authoritative; realm character saves are authoritative on the account service (`realm_characters` + R2), with the browser acting only as a cache."
  - "Realm characters never load offline; `offlineCopyOf` forks a new offline character marked with `realmCopy` and `REALM_COPY_SAVE_NAME` that can never re-enter customs."
  - "An online boot drops every `ONLINE_REFUSED_FLAGS` URL flag (`shot`, `fly`, `tp`, `class`, `spell`, `weapon`, `spawn`, ...) via `refuseOnlinePowerFlags` before anything reads them."
  - "Online, mods listed in `ONLINE_WHOLE_MODS` read shipped defaults except for their named player-owned keys (`onlineModSetting`)."
  - "Bound pieces (`isBound`: Sigil Stones and Sigil Broker wares with `bound: true`) cannot be traded, dropped, or sold; they move only to pack, wagon, and own storage (`BOUND_KEEPS`)."
traps:
  - "`ONLINE_WHOLE_MODS` is not a blanket lock: the cosmetic keys it names remain player-owned, so do not assume every mod key is forced to defaults."
  - "Offline copies keep their `realmCopy` mark through `src/saves/save.js`; stripping that field would let a forked copy pass customs."
dfu: []
tags:
  - realm
  - online
  - trust-boundary
  - power-flags
  - bound-items
---

# Realm Arc: Offline/Online Character Split and Online Power Law

The Realm Arc separates local single-player saves from cloud-authoritative online characters in `server-account/src/realm.js` (`realm_characters` and R2 storage) and enforces online power, mod, and item transfer rules across `src/platform/onlineLane.js`, `src/mods/modSettings.js`, and `src/items/itemBound.js`.

## Character Split and Forking

- **Realm sessions (`src/world/worldSaveLoad.js`, `src/saves/realmSaves.js`):** `realmBirth` mints a fresh online character via `/v1/realm`, while `openRealmBoot` and `createRealmSession` manage the active lease and checkpoint loop. Online death uses `reviveForPlay` (`src/player/deathRespawn.js`) to restore half health instead of permadeath.
- **One-way offline forks (`src/saves/offlineCopy.js`, `src/saves/realmCopyMark.js`):** Realm characters never load in offline play. `offlineCopyOf` forks an offline copy stamped with `realmCopy: true` and `REALM_COPY_SAVE_NAME`, preserving that flag through `src/saves/save.js` so forked saves can never pass `/v1/realm/customs`.

## Online Power Flags, Mod Locks, and Bound Gear

- **URL flag scrubbing (`src/platform/onlineLane.js`):** `refuseOnlinePowerFlags(params)` returns `[]` offline and deletes every `ONLINE_REFUSED_FLAGS` entry (`shot`, `fly`, `tp`, `class`, `spell`, `weapon`, `spawn`, and others) in place during online boot.
- **Selective mod locking (`src/mods/modSettings.js`):** For mods in `ONLINE_WHOLE_MODS`, `onlineModSetting` enforces shipped defaults while leaving named cosmetic keys (such as `variantNpcs` or travel map display preferences) under player control.
- **Bound items (`src/items/itemBound.js`):** `isBound` marks Sigil Stones and `bound: true` Sigil Broker wares with `BOUND_LINE`, restricting transfers to `BOUND_KEEPS` (pack, wagon, and personal storage).
