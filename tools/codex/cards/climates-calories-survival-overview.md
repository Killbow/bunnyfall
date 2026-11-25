---
slug: "climates-calories-survival-overview"
title: "Climates & Calories: Survival Tiers as Rules Data"
domain: "systems"
kind: "overview"
parent: null
files:
  - "src/systems/survival/difficulty.js"
  - "src/systems/survival/switch.js"
  - "src/systems/survival/needs.js"
  - "src/systems/survival/temperature.js"
  - "src/systems/survival/env.js"
  - "src/ui/uiPrefs.js"
  - "src/mods/features.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Climates-Calories.md"
related:
  - "climates-calories-felt-temperature-and-wetness"
  - "climates-calories-needs-clock-and-boons"
  - "climates-calories-provisions-taverns-and-rest-gate"
  - "rest-arc-overview"
  - "rest-arc-campfires-charges-and-dungeon-fires"
  - "sky-weather-and-lighting"
invariants:
  - "SURVIVAL_TIER_IDS order is off, boons, casual, hard; SURVIVAL_DEFAULT is 'boons' (BOONS-DEFAULT)."
  - "SURVIVAL_STORED stores Off as false, others by name; the default is never stored and unknown values read as the default (tierOfStored)."
  - "Tiers differ only in SURVIVAL_RULES fields; stage thresholds and drain rates live in needs.js and rest.js and are identical across tiers."
  - "difficulty.js is an import-free leaf so laws, switch, and prefs read it without cycles."
traps:
  - "FLOOR_FATIGUE = 64 was removed; the floor is the tier rule stamina.floor (0 Hard, 0.5 Casual, 1 Boons)."
  - "The old boolean true is no tier and is dropped at load (uiPrefs.js)."
dfu: []
tags:
  - "survival"
  - "climates-calories"
  - "tiers"
  - "difficulty"
---

# Climates & Calories: Survival Tiers as Rules Data

The Climates & Calories survival arc (`mod-climates-calories` in `src/mods/features.js`) defines four tier IDs in `src/systems/survival/difficulty.js`: `SURVIVAL_TIER_IDS = ['off', 'boons', 'casual', 'hard']`, with `SURVIVAL_DEFAULT = 'boons'`. Because `difficulty.js` is an import-free leaf module, `src/systems/survival/switch.js`, `src/systems/survival/needs.js`, `src/systems/survival/temperature.js`, `src/systems/survival/env.js`, and `src/ui/uiPrefs.js` read tier rules without circular imports.

## Storage Mapping and Tier Rules

`SURVIVAL_STORED` persists `'off'` as `false` and non-default tiers by string name, omits the default `'boons'` from storage, and resolves unknown or legacy `true` values back to `'boons'` via `tierOfStored`. Stage thresholds and minute drain rates in `src/systems/survival/needs.js` and `src/systems/survival/rest.js` remain identical across active tiers; tiers differ only by their `SURVIVAL_RULES` entry (which replaced the removed `FLOOR_FATIGUE = 64` constant with `stamina.floor`):

- **Boons (`'boons'`):** Sets `stamina.floor` to `1` (drains charge nothing) and `boons` to `true`.
- **Casual (`'casual'`):** Sets `stamina.floor` to `0.5`, widens comfort bounds (`hotFrom` `51`, `coldFrom` `-31`), enables `repaid` stamina loans, and disables attribute and health harm.
- **Hard (`'hard'`):** Sets `stamina.floor` to `0`, enables `attributes`, `health`, `rust`, `sickness`, `restGate`, `blackout`, and `wastedMeal`, and penalizes `roughRest` (`recovery` `0.5`, `encounters` `2`, `stiffHours` `4`).
