---
slug: horse-care-tiers-overview
title: "Horse Care: Off, Boons, and Hard Tiers"
domain: world
kind: overview
parent: null
files:
  - src/systems/upkeep/upkeepTiers.js
  - src/systems/upkeep/upkeepSwitch.js
  - src/systems/upkeep/upkeepRuntime.js
  - src/travel/steedCare.js
  - src/mods/features.js
  - src/travel/horseVoice.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Horse-Care.md"
related:
  - horse-care-stats-bond-and-hunger
  - horse-care-breath-gallop-and-walk
  - horse-care-keep-stables-and-yards
  - holdings-stable-and-transport-stabling
invariants:
  - "One prefs key `horseCare` (HORSE_CARE_PREF) holds three tiers: Off is stored as `false` (the old switch's off), Hard as 'hard', and the Boons default is never stored (PREF1). The Features row 'horse-care' is `online: 'player'`."
  - "Every reader gets the tier rules through `horseCareRules()` (upkeepSwitch.js). It returns null for Off and for any non-enhanced skin, and it is read live on every call."
  - "A steedCare law handed no rules runs `HORSE_CARE_HARD`, so tests written before the tiers still check Hard behavior."
  - "HORSE_CARE_RULES flags: boons = { hungerCosts: false, bondFades: false, paceFloor: true, draftDrags: false, refusedRunWalks: false }; hard sets every flag the other way."
  - "`hoofClipFor` plays the classic riding clip for the cart, for hard ground, for an unknown footstep kind, and for any loop not yet loaded."
traps:
  - "Boons is not Hard with smaller numbers. Stats, bond, food clock, and words are the same in both tiers; only what the horse pays differs. Never fork the world state per tier."
  - "upkeepTiers.js must stay a leaf with no imports, because uiPrefs.js and the account Worker bundle load it."
  - "`hush()` runs `mount(false)` on the first frame the rig plays the classic sounds, dropping queued voices and any owed whinny, so the voices resume without a backlog."
dfu: []
tags:
  - horse
  - upkeep
  - tiers
  - boons
  - prefs
---

# Horse Care: Off, Boons, and Hard Tiers

Horse care divides upkeep into three player-scoped tiers (`HORSE_CARE_TIER_IDS`: `'off'`, `'boons'`, and `'hard'`, with `HORSE_CARE_DEFAULT` set to `'boons'`). `upkeepTiers.js` remains an import-free leaf module shared by UI preferences and the account Worker bundle, while `upkeepSwitch.js` exposes `horseCareRules()` live on every call.

- **Preference storage and migration (`src/systems/upkeep/upkeepSwitch.js`, `src/mods/features.js`):** The single `horseCare` (`HORSE_CARE_PREF`) key stores `false` for Off, `'hard'` for Hard, and omits the `'boons'` default (`PREF1`). A legacy stored `true` (`HORSE_CARE_OLD_ON`) migrates to Hard. The `'horse-care'` feature row runs with `online: 'player'`, and `horseCareRules()` returns `null` when set to Off or when running a non-enhanced skin.
- **Tier behavior (`src/systems/upkeep/upkeepTiers.js`, `src/travel/steedCare.js`):** Under Off, horses match classic Daggerfall Unity behavior with one pace, no stats, and nothing to feed, while `createUpkeep` advances each `horseFed` clock with the game clock so enabling care later resumes cleanly. Under Boons, a horse is never worse than classic: hunger costs nothing (`hungerCosts: false`), bond never decays (`bondFades: false`), `steedSpeedScale` floors at `1` (`paceFloor: true`), wagon draft stays `1` (`draftDrags: false`), refused runs keep ride pace (`refusedRunWalks: false`), and status chips never turn red. Hard flips all five flags (`HORSE_CARE_HARD`), which is also the fallback when a `steedCare` rule receives no rules object.
- **Scene wiring (`src/systems/upkeep/upkeepRuntime.js`):** Both `src/scenes/world.js` and `src/scenes/exterior.js` wire `createUpkeep`, `setGallopGate`, `setRideWalk`, and `registerUpkeepUses`.
