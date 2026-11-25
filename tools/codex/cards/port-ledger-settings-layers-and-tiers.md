---
slug: "port-ledger-settings-layers-and-tiers"
title: "Settings Parity: Baked Defaults, Port Defaults, and Online-Forced Values"
domain: "overview"
kind: "subcard"
parent: "port-ledger-overview"
files:
  - "src/platform/settings.js"
  - "src/platform/settingsDefaults.js"
  - "scripts/bakeSettings.mjs"
  - "src/platform/onlineLane.js"
  - "src/ui/settingsMap.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/Port-Ledger.md"
related:
  - "port-ledger-overview"
  - "features-arc-registry-overview"
  - "port-ledger-url-flags-and-browser-tab-guards"
invariants:
  - "`SETTINGS_DEFAULTS` is baked from vendor/dfu-settings/defaults.ini.txt by scripts/bakeSettings.mjs (13 sections, 171 keys). It is never hand-transcribed."
  - "Every default is read through `defaultOf(section, key)`: `PORT_DEFAULTS` first, then the vendored ini."
  - "On online pages `onlineForcedSetting` is checked first. `ONLINE_FORCED_SETTINGS` currently forces Controls.AllowMagicRepairs = 'True'."
  - "Typed getters preserve upstream failure modes: unparseable booleans return `False`, and unparseable integers or floats return `MIN` rather than the default."
  - "Each key has a tier (live, stored, unavailable, or restart), and the launcher reads it. A toggle that changes nothing is never shown as live."
traps:
  - "Local `False` for `Controls.AllowMagicRepairs` applies offline only; online pages force `True` via `ONLINE_FORCED_SETTINGS`."
  - "Importing the bake parser must not trigger a bake (AUDIT 68 S01). Run `node scripts/bakeSettings.mjs` explicitly."
dfu:
  - "Assets/Scripts/SettingsManager.cs"
tags:
  - "settings"
  - "defaults"
  - "online"
  - "tiers"
---

# Settings Parity: Baked Defaults, Port Defaults, and Online-Forced Values

`src/platform/settings.js` layers online overrides, port defaults, and baked Daggerfall Unity defaults across 13 sections and 171 keys, persisting overrides to `localStorage` under `dagger.settings.v1` via `appStorage`.

## Resolution Layers and Getter Semantics

- **Baked and port defaults (`scripts/bakeSettings.mjs`, `src/platform/settingsDefaults.js`):** Running `node scripts/bakeSettings.mjs` bakes `SETTINGS_DEFAULTS` from `vendor/dfu-settings/defaults.ini.txt` with no import side effects. `defaultOf(section, key)` reads `PORT_DEFAULTS` first (`Enhancements.PlayerTorchFromItems = 'True'`, `Controls.WeaponSwingMode = '2'`, `Controls.AllowMagicRepairs = 'True'`, and `Controls.InstantRepairs = 'True'`), then the baked table.
- **Online overrides and typed getters (`src/platform/onlineLane.js`, `src/platform/settings.js`):** On online pages, `onlineForcedSetting` checks `ONLINE_FORCED_SETTINGS` first, forcing `Controls.AllowMagicRepairs = 'True'`. Typed getters preserve upstream failure modes: unparseable booleans return `False`, while unparseable integers or floats return `MIN` rather than the default.

## Tiers and Settings Taxonomy

Each key has a tier (`live`, `stored`, `unavailable`, or `restart`) so inactive toggles never appear live. The `restart` tier covers `FPS-VSYNC`, read at the next desktop shell launch (`SHELL_AT_LAUNCH`). In `src/ui/settingsMap.js`, `CATEGORY_IDS` defines 9 categories: `graphics`, `gameplay`, `combat`, `world`, `interface`, `audio`, `controls`, `accessibility`, and `mods`.
