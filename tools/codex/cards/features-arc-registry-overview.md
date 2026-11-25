---
slug: features-arc-registry-overview
title: "Features Arc: One Registry Over Three Stores"
domain: ui
kind: overview
parent: null
files:
  - src/mods/features.js
  - src/platform/settings.js
  - src/ui/uiPrefs.js
  - src/mods/modSettings.js
  - src/ui/enhancedMenu.js
  - src/ui/settingsMap.js
  - tools/featuresProbe.mjs
routes: []
tables: []
replacesBible:
  - "10-UI/Features-Arc.md"
related:
  - features-arc-prefs-declaration-and-shelf
  - features-arc-lanes-and-kill-doors
  - features-arc-tiles-all-off-and-presets
  - ui-arc-overview
  - dungeon-sizing-and-online-quest-relay
invariants:
  - "FEATURES in src/mods/features.js is presentation only: each row names a store ('prefs' | 'settings' | 'mods') and key; no live value is held there (STORES)."
  - "Every row declares kinds from KINDS (KIND_ORDER enhanced, mod, classic) and one group from GROUPS (GROUP_ORDER sight, interface, sound, world, loot, combat, character)."
  - "checkFeature rejects a row with no id/title, unknown group, empty or repeated or unknown kinds, unknown store, a key its store lacks (settings via ALL_KEYS, mods via MOD_SETTINGS[vendor].keys), or a prefs row without initial/online; checkFeatures adds repeated ids and repeated controls (including also-covered ones)."
  - "featureForControl(store, key, vendor) finds the row owning a key, including also-covered keys, so the settings pane draws no second switch."
traps:
  - "features.js imports no store above it except ALL_KEYS/MOD_SETTINGS/declareOnlinePrefs; importing uiPrefs or landView from it closes a cycle."
  - "The DFU store is `src/platform/settings.js` (171 keys, 13 sections); `src/systems/legacy/settings.js` belongs to Project Legacy and is unrelated."
dfu:
  - "Assets/Scripts/SettingsManager.cs"
tags:
  - features
  - settings
  - registry
  - ui
  - mods
---

# Features Arc: One Registry Over Three Stores

`FEATURES` in `src/mods/features.js` declares a presentation registry over three backing stores (`STORES`: `'prefs'` in `src/ui/uiPrefs.js`, `'settings'` in `src/platform/settings.js` with 171 keys across 13 sections, and `'mods'` in `src/mods/modSettings.js` with 668 keys across 41 vendors, 123 curated in `MOD_CURATED` across 29 vendors), verified by `tools/featuresProbe.mjs`.

## Registry Shape, Validation, and Tabs

The 120 live rows span `KINDS` (`KIND_ORDER`: `enhanced`, `mod`, `classic`; `featureCounts` totals 68 enhanced, 45 mod, and 15 classic, counting multi-kind rows under each) and `GROUPS` (`GROUP_ORDER`: `sight`, `interface`, `sound`, `world`, `loot`, `combat`, `character`). `CATEGORIES` in `src/ui/settingsMap.js` distributes rows across the 9 Settings tabs rendered by `src/ui/enhancedMenu.js`.

`checkFeature` and `checkFeatures` validate every row against `ALL_KEYS` and `MOD_SETTINGS[vendor].keys`, rejecting missing metadata, duplicate IDs, and duplicate primary or `also`-covered controls. `featureForControl(store, key, vendor)` locates the owning row so the settings pane omits duplicate switches.

## Search and Classic Rows

`featureSearchText` folds title, note, group and kind labels, part labels, and mod metadata; `matchesFeatureQuery` requires every whitespace-split query word as a substring. Classic rows include `smaller-dungeons`, `enemy-infighting`, `varied-dungeon-monsters`, `torches-from-items`, `combat-voices`, `near-death-warning`, `bows-left-hand`, `choose-guild-jobs`, and `dungeon-wall-style` (`Video/RandomDungeonTextures`), while `Enhancements/EnhancedCombatAI` and `Enhancements/AdvancedClimbing` stay `UNAVAILABLE` in `src/platform/settings.js` in favor of `enhanced-ai`.
