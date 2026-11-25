---
slug: features-arc-tiles-all-off-and-presets
title: "Features Arc: Segment Tiles, All Off, Defaults, Presets"
domain: ui
kind: subcard
parent: features-arc-registry-overview
files:
  - src/ui/enhancedMenu.js
  - src/ui/uiPrefs.js
  - src/platform/settings.js
  - src/platform/graphicsPresets.js
  - src/ui/settingsMap.js
  - tools/enhancedMenuProbe.mjs
  - tools/featureRailProbe.mjs
routes: []
tables: []
replacesBible:
  - "10-UI/Features-Arc.md"
related:
  - features-arc-registry-overview
  - features-arc-prefs-declaration-and-shelf
  - performance-priority-overview
invariants:
  - "tileStates(f) turns a resolved control into segments with set(i) through the owning store; online-forced prefs come back locked; a control it cannot segment returns null and falls back to its own row builder."
  - "All off presses the classic or Off segment on each unlocked tile and keeps the values from the first press in pref featuresRestore (FEATURES_RESTORE_PREF); featuresRestore() brings them back."
  - "featuresDefaults uses defaultSegment and defaultOf(section, key) = PORT_DEFAULTS over DEFAULTS, so Defaults returns to how the port ships, not the raw DFU ini."
  - "Settings keys owned by a feature row are filtered out of the settings pane (paneKeys uses featureForControl); movedRow returns null."
traps:
  - "PORT_DEFAULTS overrides DFU ini (PlayerTorchFromItems True, WeaponSwingMode 2, AllowMagicRepairs True, InstantRepairs True); reading DEFAULTS directly gives the wrong shipped value."
dfu: []
tags:
  - features
  - tiles
  - all-off
  - defaults
  - graphics-presets
---

# Features Arc: Segment Tiles, All Off, Defaults, Presets

`src/ui/enhancedMenu.js` and `src/platform/graphicsPresets.js` render segmented `.ft-` feature tiles (`ft-seg`, `ft-seg-switch`), global reset actions, and graphics quality presets across the Settings tabs (`src/ui/settingsMap.js`), verified by `tools/enhancedMenuProbe.mjs` and `tools/featureRailProbe.mjs`.

## Segment Tiles and Settings Deduplication

`tileStates(f)` converts a resolved feature control into clickable segments whose `set(i)` handler writes through the owning store (`src/ui/uiPrefs.js`, `src/platform/settings.js`, or `src/mods/modSettings.js`). Online-forced preferences return locked segments, while non-segmentable controls return `null` and fall back to custom row builders. In the settings pane, `paneKeys` calls `featureForControl` to exclude any key already owned by a feature row, and `movedRow` returns `null`.

## All Off, Restore, Defaults, and Graphics Presets

Pressing All off switches every unlocked tile to its classic or Off segment and snapshots the prior values on first press into `featuresRestore` (`FEATURES_RESTORE_PREF` in `src/ui/uiPrefs.js`), allowing `featuresRestore()` to restore them. Pressing Defaults runs `featuresDefaults`, which applies `defaultSegment` and `defaultOf(section, key)` (`PORT_DEFAULTS` layered over raw DFU `DEFAULTS` in `src/platform/settings.js`, keeping shipped overrides such as `PlayerTorchFromItems: True`, `WeaponSwingMode: 2`, `AllowMagicRepairs: True`, and `InstantRepairs: True`).

In `src/platform/graphicsPresets.js`, `PRESET_ROWS` covers `land-view-distance`, `grass`, `cloud-quality`, `ground-sharpness`, `water-quality`, and `real-windows` (plus part `steadyShadows`). The High preset matches every shipped default (`landViewDistance: 5`, `grassDensity: 1`, `cloudQuality: 'default'`, `ground-sharpness: 'default'`, `water-quality: 'full'`, `real-windows: 'full'`).
