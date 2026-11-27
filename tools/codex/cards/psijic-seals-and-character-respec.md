---
slug: psijic-seals-and-character-respec
title: "Psijic Seals Ledger, Character Reset, and Banked Build Revert"
domain: characters
kind: overview
parent: null
files:
  - src/systems/psijicSealsLaw.js
  - server-account/src/psijicSeals.js
  - server-account/src/routes/townRoutes.js
  - server-account/src/service.js
  - server-account/src/staffPanelDesk.js
  - src/net/accountClient.js
  - src/net/psijicSealsClient.js
  - src/characters/characterRespec.js
  - src/characters/chargen.js
  - src/ui/characterRespecWindow.js
  - src/items/walletItem.js
  - src/saves/save.js
  - src/saves/realmCustoms.js
  - src/systems/vampire/thralls.js
  - src/tools/staffPanel.js
  - src/tools/staffPanelActions.js
routes:
  - /v1/seals/balance
  - /v1/seals/spend
  - /v1/staff/seals/grant
tables:
  - psijic_seals
  - psijic_seal_ledger
replacesBible: []
related:
  - bazaar-betwixt-sanctum-and-portal
  - wallet-sheet-ledger-and-silver
  - realm-arc-customs-migration-and-passes
  - staff-panel-desk-and-feeds
invariants:
  - "Permute earned skill scores strictly 1-to-1 within Primary (3), Major (3), Minor (6), and Other (23) tiers so levelUpSkillSum stays unchanged (delta = 0), carrying > 100 tier mastery slots onto their new skills and clearing arcanePath and martialPath for judgeSave."
  - "Include OGHMA_BONUS_POOL (+30) in attributeBudgetOf(entity) when entity.oghmaLevelUp is true, and fold owed +30 points directly into entity.stats (capped at 100) with oghmaLevelUp = false on revertCharacterRespec."
  - "PSIJIC_SEAL_EPOCH is 0, so no account or offline character is granted a Seal; only the staff grant adds them. Raising the epoch grants one per step, once, through ensureSealsAccountRow and ensureOfflinePsijicSeals."
  - "Persist in-flight spend request IDs via pendingRespecRidFor and entity.lastRespecRid against psijic_seal_ledger.rid UNIQUE so retrying after a dropped connection never double-spends a Seal, and gate /v1/seals/* on accountKind(player) === 'linked'."
traps:
  - "When hasParkedRespec(entity) is true, subsequent applyCharacterRespec calls require explicit bankPolicy ('replace' or 'keep'), and crossLeveling in realmCustoms.js must migrate parkedRespec from oblivion to classic leveling."
  - "On revertCharacterRespec, shift banked Vampire timestamps and rebaseThrallDays(dtDays) forward, relink worn items via rebuildEquipState and restartHeldEnchantments without CastWhenHeld durability drain, run clampActiveStatDrains, and refresh computeEnchantmentMods plus passiveSpecialsMagicRound."
dfu: []
tags:
  - psijic-seals
  - respec
  - character
  - account-service
---

# Psijic Seals Ledger, Character Reset, and Banked Build Revert

Master Celarus in The Bazaar Betwixt resets a character's class, attributes, and skill assignments for one Psijic Seal (`respec.*` in `locales/en/Port_Strings.csv`), banking one pre-reset build (`entity.parkedRespec`, `PARKED_RESPEC_VERSION = 1`) for an optional free `REVERT`.

- **Wallet & Account Ledger (`psijicSealsLaw.js`, `psijicSeals.js`, `psijicSealsClient.js`, `0225_psijic_seals.sql`):** Displays `Psijic Seals` in `walletItem.js` (`setWalletPsijicSeals` online; `entity.psijicSeals` and `entity.psijicSealEpoch` offline), starting at 0 Seals. `PSIJIC_SEAL_EPOCH` is 0, so nothing is granted automatically; raising it grants `+1` per missed epoch, once, online and offline. Master Celarus refuses the reset at 0 Seals without opening the window. D1 tables `psijic_seals` and `psijic_seal_ledger` back `/v1/seals/balance`, `/v1/seals/spend` (`409 seals-short` returning `{ error, balance }`; anonymous guests write zero rows), and admin `/v1/staff/seals/grant` (which creates the account's row when it has none).
- **Reset & Banked Revert (`characterRespec.js`, `characterRespecWindow.js`, `tools/bazaarRespecProbe.mjs`):** Preserves inventory, gold, bank balances, houses, ships, guild ranks, and quests while lifting curses (`healCurseLift` with `advanceMinutes: null`), returning vampire thrall gear (`returnAllServantKits`), and unequipping forbidden worn items. `sanitizeParkedRespec` bounds saved HP rolls and `rawMaxHealth` in `save.js`, and `revertCharacterRespec` restores the banked build once without spending or refunding a Seal, clearing `entity.parkedRespec` and syncing readied spells and arms.
