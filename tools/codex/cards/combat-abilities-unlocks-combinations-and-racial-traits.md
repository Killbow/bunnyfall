---
slug: "combat-abilities-unlocks-combinations-and-racial-traits"
title: "Combat Abilities: Unlocks, Combination Deliveries, and Racial Traits"
domain: "combat"
kind: "subcard"
parent: "combat-abilities-overview"
files:
  - "src/combat/abilities/progress.js"
  - "src/combat/abilities/combinations.js"
  - "src/combat/abilities/racialIdentity.js"
routes: []
tables: []
related:
  - "combat-abilities-overview"
  - "spellbook-abilities-page"
invariants:
  - "abilitiesEnabled is true only offline, with the ?abilities page flag or the combat-preview test character. Only the unlock sync is gated: every save restores and writes the learned block."
  - "The save block is { version: 1, learned: [ids] }: restore keeps at most 512 valid IDs, and a block of another version is dropped. Unlocks are permanent once learned."
  - "A weapon or combination ability unlocks when every listed skill reaches its rank, a utility when any physical skill does, and a racial ability only for its own race."
  - "previewPhysicalActor refuses online, peer, mentored, beast-form and sigil-dueling actors, so racial traits never touch PvP."
traps:
  - "combinationDelivery reshapes by the weapon in hand: any table melee combination used with empty hands shortens every stage to 85% reach, and Hunting Line and Predator's Crossing pick their stages from the held weapon."
  - "racialGuardDamage applies after armor and only to damage from a non-player, non-peer attacker."
tags:
  - "abilities"
  - "unlocks"
  - "racial"
  - "combinations"
---

# Combat Abilities: Unlocks, Combination Deliveries, and Racial Traits

`progress.js` owns the gate and the learned list. `syncAbilityUnlocks` adds every ability the trained ranks reach, and `saveAbilityProgress` syncs before it writes the block when the preview is on. `abilityLoad` counts restores, so the rig drops state that belongs to an earlier load.

`combinations.js` holds the two-skill abilities. `combinationDescription` gives the page text, and `combinationDelivery` builds the stages for the held weapon. Blade Weave, Thousand Cuts, Hunting Line, Predator's Crossing, Knockout Chain, and Titan's Hands are built in this file; the rest come from the `meleeCombinations` and `rangedCombinations` tables in `combinationLadders.js`.

`racialIdentity.js` gives each race its passive edge: a 6% pace bonus in its own condition (`racialPace`), a 6% guard against one kind of damage, or all physical damage (`racialGuardDamage`), and +4 accuracy with its favorite weapons at half health or higher (`previewRacialModifiers`). An active racial ability can add a timed accuracy bonus (`setRacialAccuracy`).
