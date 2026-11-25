---
slug: "enchantment-side-once-duel-vitality-and-questor-notices-overview"
title: "Single-Pick Enchant Side Effects, Duel Vitality Isolation, and UI Notices"
domain: "systems"
kind: "overview"
parent: null
files:
  - "server-account/src/reports.js"
  - "src/magic/enchantmentCatalogue.js"
  - "src/items/itemLaw.js"
  - "src/ui/spellbookWindow.js"
  - "src/ui/enhancedNotice.js"
  - "src/ui/enhancedPort.js"
  - "src/systems/quest/offerFlow.js"
  - "src/magic/concealment.js"
  - "src/afflictions/diseases.js"
  - "src/ui/hudStatus.js"
  - "src/ui/healthStatus.js"
  - "src/net/duelBar.js"
  - "src/ui/hudVitals.js"
  - "src/ui/profPages.js"
  - "src/ui/heldMap.js"
  - "src/ui/townSheet.js"
  - "src/ui/automapSheet.js"
  - "src/world/smallerDungeons.js"
routes:
  - "/v1/mod/realm-findings"
tables:
  - "realm_findings"
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-19f.md"
related:
  - "late-solid-gate-mover-substeps-and-dungeon-void-rescue"
  - "relay-stand-in-whole-health-dot-ticks-and-chain-numbers"
  - "wild-companion-packs-revenant-exclusions-and-purse-mend"
  - "ui-arc-notices-and-message-boxes"
  - "enhanced-maps-town-plan-quarters-and-marks"
  - "legacy-heirlooms-remains-and-blessing"
invariants:
  - "ITEM_MAKER_EFFECT_FLAGS gives UserTakesDamage and ItemDeteriorates flag 1 only (no DFU AllowMultipleSecondaryInstances bit 2); primaryPickerList omits an effect with no setting left."
  - "Pre-SIDE-ONCE pieces with duplicate settings remain legal in itemLaw.js so trade is not blocked."
  - "duelVitality lives in src/net/duelBar.js, outside the relay bundle, and never mutates save health."
traps:
  - "Do not move duelBar.js under net/duel/: that directory ships in the relay bundle, so any byte change forces a relay version bump."
  - "TOWN-EXIT is retired (superseded by OW-TOWN-WALK); do not resurrect gate pathing from this arc."
dfu:
  - "Assets/Scripts/Game/MagicAndEffects/Effects/Enchanting/UserTakesDamage.cs"
  - "Assets/Scripts/Game/MagicAndEffects/Effects/Enchanting/ItemDeteriorates.cs"
  - "Assets/Scripts/Game/UserInterfaceWindows/DaggerfallSpellBookWindow.cs"
  - "Assets/Scripts/Game/UserInterfaceWindows/DaggerfallExteriorAutomapWindow.cs"
tags:
  - "enchanting"
  - "ui"
  - "quests"
  - "afflictions"
  - "duel"
  - "maps"
---

# Single-Pick Enchant Side Effects, Duel Vitality Isolation, and UI Notices

Enchanting side-effect rules, duel vitality isolation, concealment resets, UI notices, and staff findings span `src/magic/enchantmentCatalogue.js`, `src/items/itemLaw.js`, `src/net/duelBar.js`, and `server-account/src/reports.js`.

- **Single-pick side effects and disenchant thresholds:** In `src/magic/enchantmentCatalogue.js`, `ITEM_MAKER_EFFECT_FLAGS` assigns `UserTakesDamage` and `ItemDeteriorates` flag `1` without the DFU `AllowMultipleSecondaryInstances` bit `2`, so each side-effect setting is picked once per item and `primaryPickerList` omits exhausted effects. Legacy duplicate-setting items remain valid in `src/items/itemLaw.js` for trading. In `src/ui/profPages.js`, `disenchantableOf` dims gear below `ESSENCE_POINTS = 100` using `ENCHANT_UNDER_LINE`.
- **Concealment, illness, and duel vitality:** `breakNormalPowerConcealment` (`src/magic/concealment.js`) ends worn-item concealment in place (`roundsRemaining = 0`, `ended = true`) while retaining the `heldItem` pin for the `REROLL_MINIMUM_HOURS = 6` reroll. `diseaseIncubating` (`src/afflictions/diseases.js`) drives one unnamed `Unwell` tile in `src/ui/hudStatus.js` and a line in `src/ui/healthStatus.js`. In `src/net/duelBar.js` and `src/ui/hudVitals.js`, `duelVitality` stays outside the `net/duel/` relay bundle and never alters saved health.
- **UI notices, maps, instances, and findings:** `NOTES` (`['noSpellbook', 'notEnoughGold', 'note']`) in `src/ui/spellbookWindow.js` render through `noticeFrame` (`src/ui/enhancedNotice.js`) and dismiss via `noticeShown` (`src/ui/enhancedPort.js`). In `src/systems/quest/offerFlow.js`, `questorBusy` closes with `ACTIVE_QUESTOR` (`'activeQuestor'`) and names the open quest. `findMe` (`src/ui/townSheet.js`, `src/ui/heldMap.js`) centers at `FIND_ME_BLOCKS = 2`, `src/ui/automapSheet.js` exposes `backToMe`, `src/world/smallerDungeons.js` exports `builtSizeFor`, and `/v1/mod/realm-findings` queries `realm_findings`.
