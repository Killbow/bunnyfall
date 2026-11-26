---
slug: "combat-abilities-overview"
title: "Combat Abilities: Engine, Ladders, Damage Floor, and Rig"
domain: "combat"
kind: "overview"
files:
  - "src/combat/abilities/registry.js"
  - "src/combat/abilities/engine.js"
  - "src/combat/abilities/rig.js"
  - "src/combat/abilities/milestones.js"
  - "src/combat/abilities/weaponLadders.js"
  - "src/combat/abilities/combinationLadders.js"
  - "src/combat/abilities/racialProfiles.js"
  - "src/combat/abilities/damage.js"
  - "src/combat/abilities/previewHits.js"
  - "src/combat/abilities/capstones.js"
  - "src/combat/abilities/utilityProfiles.js"
routes: []
tables: []
related:
  - "combat-abilities-autoaim-and-leaps"
  - "combat-abilities-unlocks-combinations-and-racial-traits"
  - "combat-abilities-presentation-and-sound"
  - "spellbook-abilities-page"
  - "weapon-techniques-overview"
invariants:
  - "A blow's mult multiplies the weapon's own rolled damage (previewDamage); a plain swing is 1. meleeBeatMult and shotMult in damage.js are the only places that weigh an ability hit or arrow."
  - "Normal weapon and combination abilities (rank below 100) never weigh less than ABILITY_DAMAGE.meleeBeatFloor (1.4) per melee hit or shotFloor (1.3) per arrow. Racial abilities and capstones keep (1 + potency) * share."
  - "milestones.js already gives normal melee abilities a third of the fatigue cost and +0.35 potency, so ABILITY_DAMAGE.potencyScale stays 1."
traps:
  - "Abilities never reach players: blockedActor refuses online, duel and peer actors, and abilityMayStrike excludes players, so ability tuning cannot change PvP."
  - "A multi-hit ability splits its weight by share; without the floor its single hits fall below a plain swing."
tags:
  - "abilities"
  - "combat"
  - "damage"
  - "balance"
---

# Combat Abilities: Engine, Ladders, Damage Floor, and Rig

Ability IDs and unlock ranks live in `src/combat/abilities/registry.js`. Deliveries come from `milestones.js` (weapon ladders from `weaponLadders.js`), `combinationLadders.js`, and `racialProfiles.js`.

`engine.js` owns one cast per character: wind-up, release, impact cues, recovery, and per-ability cooldowns, plus the shared 28-second capstone recovery. `rig.js` is the stepping host's seam: it reserves fatigue, starts swings through the weapon machine, runs advances (dashes, leaps, and side hops), and fires ability arrows.

## Damage

`previewHits.js` `previewDamage` multiplies the rolled weapon damage by the blow's `mult` plus conditional bonuses (counter, rear, unaware, low health, and openings). `damage.js` sets `mult`:

- **Normal abilities:** `max(1.4, (1 + potency) * share)` per melee hit and `max(1.3, (1 + potency) / arrows)` per arrow, so every hit of a costly ability lands clearly harder than a plain swing.
- **Racial abilities and capstones:** the raw split, with capstones adding `capstonePower` as a damage modifier.

The spellbook shows each ability's weight per hit against a plain swing from the same functions.
