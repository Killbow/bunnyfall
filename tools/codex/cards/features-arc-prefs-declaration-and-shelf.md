---
slug: features-arc-prefs-declaration-and-shelf
title: "Features Arc: Prefs Rows as the One Declaration"
domain: ui
kind: subcard
parent: features-arc-registry-overview
files:
  - src/mods/features.js
  - src/ui/uiPrefs.js
  - src/platform/onlineLane.js
  - src/items/lootRarity.js
routes: []
tables: []
replacesBible:
  - "10-UI/Features-Arc.md"
related:
  - features-arc-registry-overview
  - features-arc-tiles-all-off-and-presets
  - online-coop-overview
invariants:
  - "A prefs-store control (and each prefs entry in its also list) carries initial and online (true | false | 'player'); FEATURE_PREF_DEFAULTS and FEATURE_PREF_ONLINE derive from them and declareOnlinePrefs(FEATURE_PREF_ONLINE) feeds ONLINE_FORCED_PREFS."
  - "uiPrefs PREF_DEFAULTS spreads FEATURE_PREF_DEFAULTS; savePrefs writes overridesOf(prefs), which drops every key equal to its default and stamps _rev = SHELF_REV (2)."
  - "On a shelf without _rev, PREF1_ADOPT_NEW_DEFAULT keys (lootRarity, enhancedAI) adopt the current default once."
traps:
  - "Adding a new switch default to uiPrefs by hand duplicates initial on the row; declare it on the row."
  - "Writing a default value to storage would shadow a later default change; overridesOf exists to prevent that."
dfu: []
tags:
  - features
  - prefs
  - online
  - defaults
---

# Features Arc: Prefs Rows as the One Declaration

Every `'prefs'` store control and each `'prefs'` entry inside an `also` list in `src/mods/features.js` is the single source of truth for its initial value and online policy.

## Derived Defaults and Online Forcing

Each `'prefs'` entry declares `initial` and `online` (`true`, `false`, or `'player'`). At module load, `src/mods/features.js` builds `FEATURE_PREF_DEFAULTS` and `FEATURE_PREF_ONLINE` from those rows and passes `FEATURE_PREF_ONLINE` to `declareOnlinePrefs` (`src/platform/onlineLane.js`) to populate `ONLINE_FORCED_PREFS`. `PREF_DEFAULTS` in `src/ui/uiPrefs.js` spreads `FEATURE_PREF_DEFAULTS` directly rather than repeating switch defaults by hand.

Representative `initial` defaults include `landViewDistance: 5`, `grassDensity: 1`, `cloudQuality: 'default'`, `enhancedWater: true`, `soundEnhancements: true`, `quickbarStyle: 'hotbar'`, and `blood-gore: 'normal'`. Rows forced on in online play (`online: true`) include `enhancedAI`, `enhancedEnvironments`, `enhancedCombatVisuals`, `lootRarity` (read by `lootRarityOn` via `LOOT_RARITY_KEY` in `src/items/lootRarity.js`), `weatherEvents`, and `worldDungeonSizes`.

## Sparse Persistence and Shelf Migration

When persisting user preferences, `savePrefs` in `src/ui/uiPrefs.js` filters the active state through `overridesOf(prefs)`, stripping every key whose value equals its default and stamping `_rev = SHELF_REV` (`2`). Storing only non-default overrides prevents saved defaults from shadowing future default changes. When loading an older shelf that lacks `_rev`, `PREF1_ADOPT_NEW_DEFAULT` migrates `lootRarity` and `enhancedAI` to their current default (`true`) once.
